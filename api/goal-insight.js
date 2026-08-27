import { generateGoalInsight, generatePhaseRecommendation } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireCoach } from "./_lib/auth.js";
import { computeGoalScore } from "../src/lib/scoring/goalScoring.js";
import { nutritionAdherenceFrom } from "../src/lib/scoring/nutritionAdherence.js";
import { strengthTrendsFrom } from "./_lib/strengthTrends.js";

// Advisory phase-progression recommendation (Part 25/26 of the roadmap
// spec) — separate request shape on this same route (not a new API file;
// the Vercel Hobby plan is already at its 12-function cap). Never writes to
// programs/exercises — only ever inserts a pending recommendation row the
// coach approves/modifies/holds/rejects.
async function handlePhaseRecommendation(req, res) {
  const { phase_id } = req.body || {};
  if (!phase_id) return res.status(400).json({ error: "phase_id is required" });
  try {
    const { data: phase } = await supabaseAdmin.from("program_phases").select("*").eq("id", phase_id).maybeSingle();
    if (!phase) return res.status(404).json({ error: "Phase not found." });
    const { data: program } = await supabaseAdmin.from("programs").select("id,client_id").eq("id", phase.program_id).maybeSingle();
    if (!program) return res.status(404).json({ error: "Program not found." });

    const [{ data: profile }, { data: milestones }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name").eq("id", program.client_id).maybeSingle(),
      supabaseAdmin.from("client_goals").select("*").eq("client_id", program.client_id).eq("status", "active").not("category", "is", null),
    ]);

    // Current value per exercise-tracked milestone, same "top set on most
    // recent logged date" convention as MilestonesCard/currentExerciseValue.
    const withCurrent = await Promise.all((milestones || []).map(async (m) => {
      if (!m.exercise_name) return { ...m, current_value: null };
      const { data: exs } = await supabaseAdmin.from("exercises").select("id").eq("client_id", program.client_id).ilike("name", m.exercise_name);
      const ids = (exs || []).map((e) => e.id);
      if (!ids.length) return { ...m, current_value: null };
      const { data: logs } = await supabaseAdmin.from("workout_logs").select("date,weight,reps").in("exercise_id", ids).order("date", { ascending: false }).limit(10);
      if (!logs?.length) return { ...m, current_value: null };
      const key = m.unit === "reps" ? "reps" : "weight";
      const values = logs.filter((l) => l.date === logs[0].date).map((l) => l[key]).filter((v) => v != null);
      return { ...m, current_value: values.length ? Math.max(...values) : null };
    }));

    const rec = await generatePhaseRecommendation({ profile: profile || {}, phase, exitCriteria: phase.exit_criteria || [], milestones: withCurrent });

    const { data: saved, error: insertErr } = await supabaseAdmin.from("program_phase_recommendations").insert({
      program_id: program.id, client_id: program.client_id, phase: phase.phase,
      recommendation_text: rec.recommendation, reasoning_text: rec.reasoning, suggested_action: rec.suggested_action,
    }).select().maybeSingle();
    if (insertErr) throw insertErr;

    return res.status(200).json({ recommendation: saved });
  } catch (e) {
    console.error("phase-recommendation error:", e, "phase_id:", phase_id);
    return res.status(500).json({ error: e.message });
  }
}

// POST /api/goal-insight  { goal_id } | { phase_id }
// Coach-only: recomputes the goal's score server-side (never trusts a
// client-supplied score in the prompt) and generates a short AI coaching
// insight, persisted as a new client_goal_insights row.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireCoach(req, res);
  if (!user) return;

  const { goal_id, phase_id } = req.body || {};
  if (phase_id) return handlePhaseRecommendation(req, res);
  if (!goal_id) return res.status(400).json({ error: "goal_id or phase_id is required" });

  try {
    const { data: goal } = await supabaseAdmin.from("client_goals").select("*").eq("id", goal_id).maybeSingle();
    if (!goal) return res.status(404).json({ error: "Goal not found." });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 44); // a bit more than 30d so the 30-day windows below have full coverage
    const cut = cutoff.toISOString().split("T")[0];

    const [{ data: profile }, { data: daily }, { data: weekly }, { data: nutPlan }, { data: habits }, { data: habitLogs }, { data: workoutLogs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name,goal").eq("id", goal.client_id).maybeSingle(),
      supabaseAdmin.from("daily_checkins").select("date,weight,calories,protein_g,carbs_g,fats_g,workout").eq("client_id", goal.client_id).gte("date", cut).order("date"),
      supabaseAdmin.from("weekly_checkins").select("date,bodyweight,sleep_quality,hydration_quality").eq("client_id", goal.client_id).gte("date", cut).order("date"),
      supabaseAdmin.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id", goal.client_id).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("habits").select("id").eq("client_id", goal.client_id).eq("active", true),
      supabaseAdmin.from("habit_logs").select("habit_id,date,done").eq("client_id", goal.client_id).gte("date", cut),
      supabaseAdmin.from("workout_logs").select("date,exercise_id,weight,reps").eq("client_id", goal.client_id).gte("date", cut),
    ]);

    // Primary metric series — v1 only supports metric_key 'bodyweight': daily
    // check-in weight merged with weekly check-in bodyweight (daily wins on a
    // shared date), same merge rule as the client-facing Progress page.
    const byDate = {};
    (daily || []).forEach(d => { if (d.weight != null) byDate[d.date] = d.weight; });
    (weekly || []).forEach(w => { if (w.bodyweight != null && byDate[w.date] == null) byDate[w.date] = w.bodyweight; });
    const series = Object.entries(byDate).map(([date, value]) => ({ date, value })).sort((a, b) => a.date < b.date ? -1 : 1);

    const nutrition = nutritionAdherenceFrom(daily || [], nutPlan || null, 30).score;

    const recentDaily = (daily || []).filter(d => d.date >= (() => { const c = new Date(); c.setDate(c.getDate() - 29); return c.toISOString().split("T")[0]; })());
    const training = recentDaily.length ? Math.round((recentDaily.filter(d => d.workout === "completed").length / recentDaily.length) * 100) : null;

    const recentWeekly = (weekly || []).slice(-4).filter(w => w.sleep_quality != null || w.hydration_quality != null);
    const recovery = recentWeekly.length
      ? Math.round((recentWeekly.reduce((s, w) => s + ((w.sleep_quality || 0) + (w.hydration_quality || 0)) / 2, 0) / recentWeekly.length) * 10)
      : null;

    const habitCount = (habits || []).length;
    const habit = habitCount
      ? Math.round(((habitLogs || []).filter(l => l.done).length / (habitCount * 30)) * 100)
      : null;

    // The component scores above are all reduced to 0-100 — enough to say
    // "nutrition is at 62%" but not WHY. Pull the underlying numbers behind
    // each one from the same 30-day window so the insight can cite concrete
    // reasons (calorie/macro gaps, workout-session count) instead of only
    // restating a percentage.
    const avgOf = (rows, key) => { const v = rows.map(r => r[key]).filter(v => v != null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
    // Top-set weight/rep movement per exercise over the same window — lets
    // the insight cite real strength progress alongside nutrition/training,
    // not just the weight-trend goal score.
    const exerciseIds = [...new Set((workoutLogs || []).map(l => l.exercise_id).filter(Boolean))];
    const { data: exRows } = exerciseIds.length
      ? await supabaseAdmin.from("exercises").select("id,name,is_bodyweight").in("id", exerciseIds)
      : { data: [] };
    const exerciseById = {};
    (exRows || []).forEach(e => { exerciseById[e.id] = e; });
    const strength_trends = strengthTrendsFrom(workoutLogs || [], exerciseById);

    const rawStats = {
      calorie_target: nutPlan?.calories ?? null,
      avg_calories_logged: avgOf(recentDaily, "calories"),
      protein_target_g: nutPlan?.protein_g ?? null,
      avg_protein_g: avgOf(recentDaily, "protein_g"),
      carbs_target_g: nutPlan?.carbs_g ?? null,
      avg_carbs_g: avgOf(recentDaily, "carbs_g"),
      fats_target_g: nutPlan?.fats_g ?? null,
      avg_fats_g: avgOf(recentDaily, "fats_g"),
      days_with_nutrition_logged: recentDaily.filter(d => d.calories != null || d.protein_g != null).length,
      workouts_completed: recentDaily.filter(d => d.workout === "completed").length,
      window_days: recentDaily.length,
      strength_trends,
    };

    const scoreData = computeGoalScore(goal, series, { nutrition, training, recovery, habit });
    const insightText = await generateGoalInsight({ profile: profile || {}, goal, scoreData, rawStats });

    const { data: saved, error: insertErr } = await supabaseAdmin.from("client_goal_insights").insert({
      client_id: goal.client_id,
      goal_id: goal.id,
      insight_text: insightText,
      score_snapshot: scoreData,
    }).select().maybeSingle();
    if (insertErr) throw insertErr;

    return res.status(200).json({ insight: saved });
  } catch (e) {
    console.error("goal-insight error:", e, "goal_id:", goal_id);
    return res.status(500).json({ error: e.message });
  }
}
