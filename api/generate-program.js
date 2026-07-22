import { getClientFromNotion } from "./_lib/notion.js";
import { getClientFromLead } from "./_lib/leads.js";
import { getProgramTemplate } from "./_lib/notionTemplates.js";
import { generateTrainingPlan, generateNutritionPlan } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireCoach } from "./_lib/auth.js";
import { toScore } from "./_lib/scores.js";
import { DAY_ORDER } from "../src/lib/constants.js";

// Maps the AI's returned day label onto one of the 7 canonical DAY_ORDER
// values (case-insensitive exact match) so regeneration never introduces a
// stray day label that doesn't match the client's existing day folders.
function normalizeDay(day) {
  const match = DAY_ORDER.find((d) => d.toLowerCase() === String(day || "").trim().toLowerCase());
  if (!match) console.warn(`generate-program: unrecognized day "${day}", falling back to Unscheduled`);
  return match || null;
}

// POST /api/generate-program  { client_email, template_id? }
// 1. Reads the client's intake from Notion
// 2. Loads the coach-selected program template (optional)
// 3. Generates a training plan + nutrition plan with Claude (in parallel)
// 4. Saves both to Supabase (the tables the client portal reads)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireCoach(req, res);
  if (!user) return;

  const { client_email, template_id, scope } = req.body || {};
  if (!client_email) return res.status(400).json({ error: "client_email is required" });
  // scope "nutrition" regenerates ONLY the nutrition plan, leaving the training
  // program and exercises (and their logged history) untouched. Default: "full".
  const nutritionOnly = scope === "nutrition";

  try {
    // 1. Read client data from Notion, falling back to the in-app leads
    //    table for clients who applied through the new intake form instead.
    let client = await getClientFromNotion(client_email);
    if (!client) client = await getClientFromLead(client_email);
    if (!client) {
      return res.status(404).json({ error: `No intake found for ${client_email} (checked Notion and in-app leads)` });
    }

    // 2. Make sure the client has an app profile to attach the program to.
    //    Pull any stored assessment scores so coach overrides take priority.
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, nervous_system_recruitment, muscular_density_to_size, metabolic_work_capacity, shared_program_owner_id, goal, is_local"
      )
      .eq("email", client_email)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) {
      return res.status(404).json({ error: "Client has not signed up in the app yet" });
    }

    // TRAINING is shared between linked partners: a client with a
    // shared_program_owner_id writes its program + exercises against the
    // owner's id, so both partners see the same training. NUTRITION and logged
    // history stay keyed to this client's OWN id (profile.id) — always separate.
    const trainingOwnerId = profile.shared_program_owner_id || profile.id;

    // Coach's in-app onboarding assessment (keyed by email), if one exists. This
    // is the coach's own evaluation and takes priority over inference.
    const { data: coachAssessment } = await supabaseAdmin
      .from("client_assessments")
      .select("*")
      .eq("email", client_email.toLowerCase())
      .maybeSingle();

    // Resolve the V12 assessment: a coach-set profile score wins, then the
    // in-app coach assessment, then Notion.
    const assessment = {
      nervous_system_recruitment:
        profile.nervous_system_recruitment ?? coachAssessment?.nervous_system_recruitment ?? client.nervous_system_recruitment,
      muscular_density_to_size:
        profile.muscular_density_to_size ?? coachAssessment?.muscular_density_to_size ?? client.muscular_density_to_size,
      metabolic_work_capacity:
        profile.metabolic_work_capacity ?? coachAssessment?.metabolic_work_capacity ?? client.metabolic_work_capacity,
    };

    // Free-text coach assessment, condensed into a prompt block the generator
    // treats as authoritative (see clientProfileBlock/generateTrainingPlan).
    const coachAssessmentText = coachAssessment
      ? [
          ["Strengths", coachAssessment.strengths],
          ["Weaknesses/limitations", coachAssessment.weaknesses],
          ["Injuries/health", coachAssessment.injuries],
          ["Training history", coachAssessment.training_history],
          ["Recovery/lifestyle", coachAssessment.recovery_lifestyle],
          ["Goal/focus", coachAssessment.goal_focus],
          ["Coach notes", coachAssessment.notes],
        ]
          .filter(([, v]) => (v || "").trim())
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")
      : null;

    const assessed = { ...client, ...assessment, coach_assessment: coachAssessmentText || null, is_local: !!profile.is_local };

    // 3. Load the coach-selected template from the Notion program library and
    //    read its session structure as the AI framework. Falls back to the
    //    client's own Notion `Program Template` property if none was chosen.
    let template = null;
    if (!nutritionOnly) {
      const chosenTemplate = template_id || client.program_template_id;
      if (chosenTemplate) {
        try {
          template = await getProgramTemplate(chosenTemplate);
        } catch (e) {
          console.warn("Program library fetch failed, falling back:", e.message);
        }
      }
    }
    const templateText = template?.frameworkText || null;

    // 4. Full-scope only: find which of the client's current AI exercises
    //    already have logged history BEFORE generating the new plan, so the
    //    AI can design the week around them instead of the old flow, where
    //    this was only discovered after generation and the AI had already
    //    (unknowingly) reintroduced the same lift as a separate exercise.
    //    Preserve an exercise if ANY partner has logged sets against it (logs
    //    are per-client but the exercise rows are shared), so regenerating one
    //    partner's program never destroys the other partner's history.
    let aiIds = [];
    let lockedExercises = [];
    if (!nutritionOnly) {
      const { data: aiExercises } = await supabaseAdmin
        .from("exercises")
        .select("id, name, day_of_week, sets, reps")
        .eq("client_id", trainingOwnerId)
        .eq("source", "ai");
      aiIds = (aiExercises || []).map((e) => e.id);
      if (aiIds.length) {
        const { data: logged } = await supabaseAdmin.from("workout_logs").select("exercise_id").in("exercise_id", aiIds);
        const loggedIds = new Set((logged || []).map((l) => l.exercise_id));
        lockedExercises = (aiExercises || []).filter((e) => loggedIds.has(e.id));
      }
    }
    const lockedExercisesText = lockedExercises.length
      ? lockedExercises.map((e) => `- ${e.name} (${e.day_of_week || "unscheduled"}${e.sets ? `, ${e.sets}x${e.reps || "?"}` : ""})`).join("\n")
      : null;

    // 5. Generate the plan(s). Nutrition-only skips the training generation;
    //    full mode runs both concurrently.
    const [training, nutrition] = nutritionOnly
      ? [null, await generateNutritionPlan(assessed)]
      : await Promise.all([
          generateTrainingPlan({ ...assessed, program_template: templateText, locked_exercises_text: lockedExercisesText }),
          generateNutritionPlan(assessed),
        ]);

    // 6. Save program metadata. Nutrition-only reuses the client's latest
    //    existing program (for the nutrition plan's program_id link) instead of
    //    creating a new one.
    let program = null;
    let exercises = [];
    let preservedIds = [];
    if (nutritionOnly) {
      const { data: latest } = await supabaseAdmin
        .from("programs")
        .select("id")
        .eq("client_id", trainingOwnerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      program = latest || null;
    } else {
      const { data: newProgram, error: progErr } = await supabaseAdmin
        .from("programs")
        .insert({
          client_id: trainingOwnerId,
          name: training.program_name,
          goal: training.goal || client.goal,
          experience_level: client.experience_level,
          description:
            `AI-generated V12 program for ${client.name || client_email}` +
            (template ? ` · template: ${template.name}` : ""),
          weeks: training.weeks || 12,
        })
        .select()
        .single();
      if (progErr) throw progErr;
      program = newProgram;

      // 7. Replace previously AI-generated exercises (coach-added ones are never
      //    touched), but PRESERVE any AI exercise that already has logged sets —
      //    deleting it would cascade-delete the client's workout_logs
      //    (exercise_id references exercises on delete cascade). Preserved
      //    exercises are re-pointed at the new program so history stays visible.
      //    lockedExercises/aiIds were computed in step 4, before generation.
      preservedIds = lockedExercises.map((e) => e.id);
      const deletableIds = aiIds.filter((id) => !preservedIds.includes(id));
      if (deletableIds.length) {
        const { error } = await supabaseAdmin.from("exercises").delete().in("id", deletableIds);
        if (error) throw error;
      }
      if (preservedIds.length) {
        await supabaseAdmin.from("exercises").update({ program_id: program.id }).in("id", preservedIds);
      }

      for (const day of training.weekly_split || []) {
        (day.exercises || []).forEach((ex, i) => {
          exercises.push({
            client_id: trainingOwnerId,
            program_id: program.id,
            name: ex.name,
            category: ex.category || day.focus || null,
            section: ex.section || null,
            exercise_type: ex.exercise_type || null,
            day_of_week: normalizeDay(day.day),
            sets: ex.sets ?? null,
            reps: ex.reps != null ? String(ex.reps) : null,
            is_bodyweight: !!ex.is_bodyweight,
            notes: ex.notes || null,
            order_index: i,
            block_type: ex.block_type || "straight_set",
            group_id: ex.group_id != null ? String(ex.group_id) : null,
            source: "ai",
          });
        });
      }
      if (exercises.length) {
        const { error } = await supabaseAdmin.from("exercises").insert(exercises);
        if (error) throw error;
      }
    }

    // 8. Replace the active nutrition plan.
    await supabaseAdmin
      .from("nutrition_plans")
      .update({ active: false })
      .eq("client_id", profile.id)
      .eq("active", true);

    const { error: nutErr } = await supabaseAdmin.from("nutrition_plans").insert({
      client_id: profile.id,
      program_id: program?.id ?? null,
      name: nutrition.plan_name || "Nutrition Plan",
      calories: nutrition.daily_calories ?? client.calorie_target ?? null,
      protein_g: nutrition.protein_g ?? null,
      carbs_g: nutrition.carbs_g ?? null,
      fats_g: nutrition.fats_g ?? null,
      hydration: nutrition.hydration || null,
      guidelines: nutrition.guidelines || null,
      meals: nutrition.meals || [],
      supplements: nutrition.supplements || [],
      supplements_disclaimer: Array.isArray(nutrition.supplements) && nutrition.supplements.length
        ? "General information, not individualized medical or dietetic advice. Check with a doctor before starting any supplement, especially if pregnant, on medication, or managing a health condition."
        : null,
      active: true,
    });
    if (nutErr) throw nutErr;

    // 9. Mark onboarding complete, sync the goal, and persist the resolved
    //    assessment (coerced to 1-10 ints; non-numeric Notion values -> null).
    if (!nutritionOnly) {
      await supabaseAdmin
        .from("profiles")
        .update({
          // Preserve a coach-set (or previously stored) goal; only fall back to
          // the Notion intake goal when the profile has none yet.
          goal: profile.goal || client.goal || null,
          onboarding_complete: true,
          nervous_system_recruitment: toScore(assessment.nervous_system_recruitment),
          muscular_density_to_size: toScore(assessment.muscular_density_to_size),
          metabolic_work_capacity: toScore(assessment.metabolic_work_capacity),
        })
        .eq("id", profile.id);
    }

    return res.status(200).json({
      success: true,
      scope: nutritionOnly ? "nutrition" : "full",
      program: training?.program_name ?? null,
      template: template?.name ?? null,
      exercises_created: exercises.length,
      exercises_preserved: preservedIds.length,
      meals_created: (nutrition.meals || []).length,
      calories: nutrition.daily_calories ?? null,
    });
  } catch (err) {
    console.error("generate-program error:", err, "client_email:", client_email);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
