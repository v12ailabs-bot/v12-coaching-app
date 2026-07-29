import { getProgramTemplate } from "./_lib/notionTemplates.js";
import { generateTrainingPlan, generateNutritionPlan } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireCoach } from "./_lib/auth.js";
import { toScore } from "./_lib/scores.js";
import { resolveClientForGeneration, resolveLockedExercises, replaceAiExercises } from "./_lib/programGeneration.js";

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
    // 1-2. Read client intake (Notion/leads) + app profile + coach assessment,
    //    resolved into the flat object the generators expect.
    const resolved = await resolveClientForGeneration(client_email);
    if (resolved.error) return res.status(resolved.error.status).json({ error: resolved.error.message });
    const { client, profile, trainingOwnerId, assessment, assessed } = resolved;

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
    let aiIds = [];
    let lockedExercises = [];
    let lockedExercisesText = null;
    if (!nutritionOnly) {
      ({ aiIds, lockedExercises, lockedExercisesText } = await resolveLockedExercises(trainingOwnerId));
    }

    // 5. Generate the plan(s). Nutrition-only skips the training generation;
    //    full mode runs both concurrently. Every new program starts at the
    //    first phase (Onboarding) — the coach can immediately override the
    //    phase/week-range or advance it via the Program Phase section.
    const INITIAL_PHASE = { phase: "Onboarding", weekStart: 1, weekEnd: 4 };
    const [training, nutrition] = nutritionOnly
      ? [null, await generateNutritionPlan(assessed)]
      : await Promise.all([
          generateTrainingPlan(
            { ...assessed, program_template: templateText, locked_exercises_text: lockedExercisesText },
            INITIAL_PHASE
          ),
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
          phase: INITIAL_PHASE.phase,
          phase_week_start: INITIAL_PHASE.weekStart,
          phase_week_end: INITIAL_PHASE.weekEnd,
          phase_updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (progErr) throw progErr;
      program = newProgram;

      // Seed phase history from day one — previously phase was only ever
      // logged via the coach's manual "Save Phase" edit, so a freshly
      // generated program had no history until the coach touched it.
      await supabaseAdmin.from("program_phase_history").insert({
        program_id: program.id,
        client_id: trainingOwnerId,
        phase: INITIAL_PHASE.phase,
        week_start: INITIAL_PHASE.weekStart,
        week_end: INITIAL_PHASE.weekEnd,
        changed_by: "system: initial generation",
      });

      // 7. Replace previously AI-generated exercises (coach-added ones are never
      //    touched), but PRESERVE any AI exercise that already has logged sets —
      //    deleting it would cascade-delete the client's workout_logs
      //    (exercise_id references exercises on delete cascade). Preserved
      //    exercises are re-pointed at the new program so history stays visible.
      //    lockedExercises/aiIds were computed in step 4, before generation.
      ({ exercises, preservedIds } = await replaceAiExercises({
        trainingOwnerId,
        programId: program.id,
        aiIds,
        lockedExercises,
        weeklySplit: training.weekly_split,
      }));
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
