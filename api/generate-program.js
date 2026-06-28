import { getClientFromNotion } from "./_lib/notion.js";
import { generateTrainingPlan, generateNutritionPlan } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// POST /api/generate-program  { client_email, template_id? }
// 1. Reads the client's intake from Notion
// 2. Loads the coach-selected program template (optional)
// 3. Generates a training plan + nutrition plan with Claude (in parallel)
// 4. Saves both to Supabase (the tables the client portal reads)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { client_email, template_id } = req.body || {};
  if (!client_email) return res.status(400).json({ error: "client_email is required" });

  try {
    // 1. Read client data from Notion.
    const client = await getClientFromNotion(client_email);
    if (!client) {
      return res.status(404).json({ error: `No client found in Notion for ${client_email}` });
    }

    // 2. Make sure the client has an app profile to attach the program to.
    //    Pull any stored assessment scores so coach overrides take priority.
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, nervous_system_recruitment, muscular_density_to_size, metabolic_work_capacity"
      )
      .eq("email", client_email)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) {
      return res.status(404).json({ error: "Client has not signed up in the app yet" });
    }

    // Resolve the V12 assessment: a coach-set profile score wins over Notion.
    const assessment = {
      nervous_system_recruitment:
        profile.nervous_system_recruitment ?? client.nervous_system_recruitment,
      muscular_density_to_size:
        profile.muscular_density_to_size ?? client.muscular_density_to_size,
      metabolic_work_capacity:
        profile.metabolic_work_capacity ?? client.metabolic_work_capacity,
    };
    const assessed = { ...client, ...assessment };

    // 3. Load the coach-selected template (falls back to the client's Notion
    //    template if none was chosen).
    let template = null;
    if (template_id) {
      const { data, error } = await supabaseAdmin
        .from("program_templates")
        .select("*")
        .eq("id", template_id)
        .maybeSingle();
      if (error) throw error;
      template = data;
    }
    const templateText = template
      ? `${template.name}${template.goal ? ` (${template.goal})` : ""}` +
        `${template.days_per_week ? ` — ${template.days_per_week} days/week` : ""}\n` +
        `${template.structure || template.description || ""}`
      : client.program_template;

    // 4. Generate both plans concurrently, feeding the template + assessment
    //    into training and the assessment into nutrition.
    const [training, nutrition] = await Promise.all([
      generateTrainingPlan({ ...assessed, program_template: templateText }),
      generateNutritionPlan(assessed),
    ]);

    // 4. Save program metadata.
    const { data: program, error: progErr } = await supabaseAdmin
      .from("programs")
      .insert({
        client_id: profile.id,
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

    // 5. Replace previously AI-generated exercises (keep coach-added ones),
    //    then insert the new weekly split into the per-client exercises table.
    await supabaseAdmin
      .from("exercises")
      .delete()
      .eq("client_id", profile.id)
      .eq("source", "ai");

    const exercises = [];
    for (const day of training.weekly_split || []) {
      (day.exercises || []).forEach((ex, i) => {
        exercises.push({
          client_id: profile.id,
          program_id: program.id,
          name: ex.name,
          category: ex.category || day.focus || null,
          day_of_week: day.day,
          sets: ex.sets ?? null,
          reps: ex.reps != null ? String(ex.reps) : null,
          is_bodyweight: !!ex.is_bodyweight,
          notes: ex.notes || null,
          order_index: i,
          source: "ai",
        });
      });
    }
    if (exercises.length) {
      const { error } = await supabaseAdmin.from("exercises").insert(exercises);
      if (error) throw error;
    }

    // 6. Replace the active nutrition plan.
    await supabaseAdmin
      .from("nutrition_plans")
      .update({ active: false })
      .eq("client_id", profile.id)
      .eq("active", true);

    const { error: nutErr } = await supabaseAdmin.from("nutrition_plans").insert({
      client_id: profile.id,
      program_id: program.id,
      name: nutrition.plan_name || "Nutrition Plan",
      calories: nutrition.daily_calories ?? client.calorie_target ?? null,
      protein_g: nutrition.protein_g ?? null,
      carbs_g: nutrition.carbs_g ?? null,
      fats_g: nutrition.fats_g ?? null,
      hydration: nutrition.hydration || null,
      guidelines: nutrition.guidelines || null,
      meals: nutrition.meals || [],
      active: true,
    });
    if (nutErr) throw nutErr;

    // 7. Mark onboarding complete, sync the goal, and persist the resolved
    //    assessment (coerced to 1-10 ints; non-numeric Notion values -> null).
    const toScore = (v) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : null;
    };
    await supabaseAdmin
      .from("profiles")
      .update({
        goal: client.goal || null,
        onboarding_complete: true,
        nervous_system_recruitment: toScore(assessment.nervous_system_recruitment),
        muscular_density_to_size: toScore(assessment.muscular_density_to_size),
        metabolic_work_capacity: toScore(assessment.metabolic_work_capacity),
      })
      .eq("id", profile.id);

    return res.status(200).json({
      success: true,
      program: training.program_name,
      template: template?.name ?? null,
      exercises_created: exercises.length,
      meals_created: (nutrition.meals || []).length,
      calories: nutrition.daily_calories ?? null,
    });
  } catch (err) {
    console.error("generate-program error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
