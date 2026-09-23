import { generateGoalInsight, generatePhaseRecommendation, generateRoadmap } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireCoach } from "./_lib/auth.js";
import { computeGoalScore } from "../src/lib/scoring/goalScoring.js";
import { nutritionAdherenceFrom } from "../src/lib/scoring/nutritionAdherence.js";
import { strengthTrendsFrom } from "./_lib/strengthTrends.js";
import { currentMilestoneValues } from "./_lib/milestones.js";
import { createTask, claimTask, markReady, failTask, closeTaskNoAction, escalateTask, markRetrying } from "./_lib/headCoachTasks.ts";
import { buildReviewCheckInContext, persistContextSnapshot } from "./_lib/headCoachContextBuilder.ts";
import { evaluateRules } from "./_lib/headCoachRuleEngine.ts";
import { applySafetyGate } from "./_lib/headCoachSafetyGate.ts";
import { generateReviewCheckInRecommendation } from "./_lib/headCoachReviewCheckInPrompt.ts";
import { validateReviewCheckInOutput } from "./_lib/headCoachOutputValidator.ts";

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

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cut = cutoff.toISOString().split("T")[0];
    const [{ data: profile }, { data: milestones }, { data: workoutLogs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name").eq("id", program.client_id).maybeSingle(),
      supabaseAdmin.from("client_goals").select("*").eq("client_id", program.client_id).eq("status", "active").not("category", "is", null),
      supabaseAdmin.from("workout_logs").select("date,exercise_id,weight,reps").eq("client_id", program.client_id).gte("date", cut),
    ]);

    const withCurrent = await currentMilestoneValues(program.client_id, milestones);

    // Same per-exercise top-set movement used in generateGoalInsight/
    // generateCheckinSummary (api/_lib/strengthTrends.js) — lets the
    // recommendation cite a real PR or a stalled lift instead of only
    // comparing a milestone's current value to its target.
    const exerciseIds = [...new Set((workoutLogs || []).map((l) => l.exercise_id).filter(Boolean))];
    const { data: exRows } = exerciseIds.length
      ? await supabaseAdmin.from("exercises").select("id,name,is_bodyweight").in("id", exerciseIds)
      : { data: [] };
    const exerciseById = {};
    (exRows || []).forEach((e) => { exerciseById[e.id] = e; });
    const strengthTrends = strengthTrendsFrom(workoutLogs || [], exerciseById);

    const rec = await generatePhaseRecommendation({ profile: profile || {}, phase, exitCriteria: phase.exit_criteria || [], milestones: withCurrent, strengthTrends });

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

// AI-generated full roadmap proposal for an existing program (works for both
// AI-generated and manually-built programs — it only reads exercises, never
// their `source`). Purely advisory: returns the proposed phases directly to
// the caller, no DB write — the coach reviews/edits them in the existing
// ProgramRoadmapPlanner form and only they persist by saving, same as a
// hand-typed roadmap.
async function handleGenerateRoadmap(req, res) {
  const { program_id } = req.body || {};
  if (!program_id) return res.status(400).json({ error: "program_id is required" });
  try {
    const { data: program } = await supabaseAdmin.from("programs").select("id,client_id,goal,experience_level,weeks,description").eq("id", program_id).maybeSingle();
    if (!program) return res.status(404).json({ error: "Program not found." });

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cut = cutoff.toISOString().split("T")[0];

    const [{ data: profile }, { data: exercises }, { data: nutritionPlan }, { data: milestones }, { data: weightGoal }, { data: daily }, { data: weekly }, { data: workoutLogs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name,goal,age,sex").eq("id", program.client_id).maybeSingle(),
      supabaseAdmin.from("exercises").select("category,day_of_week,sets,reps").eq("program_id", program_id),
      supabaseAdmin.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id", program.client_id).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("client_goals").select("*").eq("client_id", program.client_id).eq("status", "active").not("category", "is", null),
      // Primary bodyweight goal, same metric_key convention as GoalsSection —
      // excluded by the milestones query above since it has no category.
      supabaseAdmin.from("client_goals").select("*").eq("client_id", program.client_id).eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("daily_checkins").select("date,weight,calories,protein_g,carbs_g,fats_g").eq("client_id", program.client_id).gte("date", cut).order("date"),
      supabaseAdmin.from("weekly_checkins").select("date,bodyweight").eq("client_id", program.client_id).gte("date", cut).order("date"),
      supabaseAdmin.from("workout_logs").select("date,exercise_id,weight,reps").eq("client_id", program.client_id).gte("date", cut),
    ]);

    // Compact aggregate, not a raw dump — days/week + category counts + a
    // rep-range sample is enough context for phase design without sending
    // every exercise row.
    const days = new Set((exercises || []).map((e) => e.day_of_week).filter(Boolean));
    const categoryCounts = {};
    (exercises || []).forEach((e) => { if (e.category) categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1; });
    const repRangeSample = [...new Set((exercises || []).map((e) => e.reps).filter(Boolean))].slice(0, 6);
    const exerciseSummary = { days_per_week: days.size, category_counts: categoryCounts, rep_range_sample: repRangeSample };

    // Same daily/weekly merge as GoalsSection/goal-insight's single-goal
    // path, so "current weight" here matches what the coach sees elsewhere.
    const byDate = {};
    (daily || []).forEach((d) => { if (d.weight != null) byDate[d.date] = d.weight; });
    (weekly || []).forEach((w) => { if (w.bodyweight != null && byDate[w.date] == null) byDate[w.date] = w.bodyweight; });
    const weightSeries = Object.entries(byDate).map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const latestWeight = weightSeries.length ? weightSeries[weightSeries.length - 1].value : null;

    const nutritionAdherence = nutritionAdherenceFrom(daily || [], nutritionPlan || null, 30).score;

    const exerciseIds = [...new Set((workoutLogs || []).map((l) => l.exercise_id).filter(Boolean))];
    const { data: exRows } = exerciseIds.length
      ? await supabaseAdmin.from("exercises").select("id,name,is_bodyweight").in("id", exerciseIds)
      : { data: [] };
    const exerciseById = {};
    (exRows || []).forEach((e) => { exerciseById[e.id] = e; });
    const strengthTrends = strengthTrendsFrom(workoutLogs || [], exerciseById);

    const withCurrent = await currentMilestoneValues(program.client_id, milestones);

    const result = await generateRoadmap({
      profile: profile || {}, program, exerciseSummary, nutritionPlan: nutritionPlan || null,
      milestones: withCurrent, weightGoal: weightGoal || null, latestWeight, nutritionAdherence, strengthTrends,
    });

    return res.status(200).json(result);
  } catch (e) {
    console.error("generate-roadmap error:", e, "program_id:", program_id);
    return res.status(500).json({ error: e.message });
  }
}

// HC-005/HC-006/HC-008/HC-009/HC-011/HC-012: Head Coach task creation,
// claiming, context assembly, rule evaluation, the safety gate, AI
// reasoning, and output validation for a specific check-in -- coach-
// triggered (no automatic check-in->task trigger, no cron worker, per the
// owner's decision), same synchronous shape as every other action on this
// route. A no_action/escalate safety-gate outcome resolves the task right
// here (CLOSED/ESCALATED) and never reaches the model at all. Validated AI
// output is still not persisted as a recommendation row -- HC-013/HC-014
// onward. requireCoach() above already satisfies the HC-003
// authorization requirement for this coach-driven Head Coach operation
// (this route is coach-only end to end; there is no separate
// requireCoachForHeadCoach() call needed since it's the same underlying
// check).
async function handleReviewCheckIn(req, res, user) {
  const { checkin_id } = req.body || {};
  if (!checkin_id) return res.status(400).json({ error: "checkin_id is required" });
  // `task` is kept in sync with the LATEST successful transition throughout,
  // not just the initial create -- failTask() compares-and-swaps against
  // task.status, so if it were left stale (e.g. still QUEUED after a
  // successful claim), a later failure would silently fail to record
  // FAILED instead of erroring loudly.
  let task = null;
  try {
    const { data: checkin } = await supabaseAdmin.from("daily_checkins").select("id,client_id").eq("id", checkin_id).maybeSingle();
    if (!checkin) return res.status(404).json({ error: "Check-in not found." });

    task = await createTask({
      clientId: checkin.client_id,
      taskType: "REVIEW_CHECK_IN",
      sourceTable: "daily_checkins",
      sourceId: checkin.id,
      actor: "coach",
      actorId: user.id,
      actorLabel: user.email,
    });

    // Not QUEUED anymore -- either already claimed/advanced by a prior
    // click, or (in a future automatic-trigger world) by something else.
    // Return its current state rather than erroring.
    const claimed = await claimTask(task.id);
    if (!claimed) return res.status(200).json({ task });
    task = claimed;

    const context = await buildReviewCheckInContext(checkin.client_id);
    // Rules run against the context BEFORE it's persisted -- the snapshot
    // is insert-only, so applicableRules/rule_versions must be final at
    // insert time, not patched in afterward.
    const ruleResult = evaluateRules("REVIEW_CHECK_IN", context);
    const finalContext = { ...context, applicableRules: ruleResult.outcomes };
    const snapshot = await persistContextSnapshot(task.id, finalContext, ruleResult.outcomes);

    const ready = await markReady(task.id, checkin.client_id, "coach", user.id);
    if (ready) task = ready;

    // Safety Gate: a no_action/escalate verdict resolves the task right
    // here and it never reaches AI reasoning (not built yet regardless) --
    // "proceed" means no safety objection, task is left at READY since
    // there's nothing built yet for it to proceed to.
    const gate = applySafetyGate(ruleResult);
    let gateOutcomeTask = null;
    if (gate.decision === "close_no_action") gateOutcomeTask = await closeTaskNoAction(task.id, checkin.client_id, gate.reason, "coach", user.id);
    else if (gate.decision === "escalate") gateOutcomeTask = await escalateTask(task.id, checkin.client_id, gate.reason, "coach", user.id);
    if (gateOutcomeTask) task = gateOutcomeTask;

    // HC-011/HC-012: only reached on "proceed" -- a no_action/escalate
    // verdict resolved the task above and never gets here. Validation order
    // per spec: JSON -> schema -> enums -> evidence -> rules -> fabrication
    // -> authority -> safety. One bounded retry on failure; still invalid
    // (or the AI itself declares "escalate") after that -> ESCALATED, same
    // human-review mechanism the deterministic safety gate uses. Output is
    // still not persisted as a recommendation row (that's HC-013/HC-014 --
    // authority engine + recommendation manager).
    let aiReasoning = null;
    if (gate.decision === "proceed_to_reasoning") {
      let generation = await generateReviewCheckInRecommendation(finalContext, ruleResult.outcomes);
      let validation = validateReviewCheckInOutput(generation, ruleResult.outcomes);

      if (!validation.valid) {
        const retrying = await markRetrying(task.id, checkin.client_id, task, validation.issues, "coach", user.id);
        if (retrying) task = retrying;
        generation = await generateReviewCheckInRecommendation(finalContext, ruleResult.outcomes);
        validation = validateReviewCheckInOutput(generation, ruleResult.outcomes);
      }

      if (!validation.valid || validation.requiresEscalation) {
        const reason = validation.requiresEscalation ? "AI output declared status: escalate" : "Output failed validation after one retry";
        const escalated = await escalateTask(task.id, checkin.client_id, reason, "coach", user.id);
        if (escalated) task = escalated;
      }

      aiReasoning = { generation, validation };
    }

    return res.status(200).json({
      task,
      context: finalContext,
      ruleEngine: { verdict: ruleResult.verdict, verdictReason: ruleResult.verdictReason, registryVersion: ruleResult.ruleRegistryVersion },
      safetyGate: gate,
      aiReasoning,
      context_snapshot_id: snapshot.id,
      note: "HC-012 only: full pipeline through validated AI reasoning (bounded retry, escalation on failure). Output is NOT yet persisted as a recommendation (HC-013/HC-014 onward).",
    });
  } catch (e) {
    console.error("review-checkin error:", e, "checkin_id:", checkin_id);
    if (task) await failTask(task, e.message, "coach", user.id);
    return res.status(500).json({ error: e.message });
  }
}

// POST /api/goal-insight  { goal_id } | { phase_id } | { program_id } | { checkin_id }
// Coach-only: recomputes the goal's score server-side (never trusts a
// client-supplied score in the prompt) and generates a short AI coaching
// insight, persisted as a new client_goal_insights row.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireCoach(req, res);
  if (!user) return;

  const { goal_id, phase_id, program_id, checkin_id } = req.body || {};
  if (phase_id) return handlePhaseRecommendation(req, res);
  if (program_id) return handleGenerateRoadmap(req, res);
  if (checkin_id) return handleReviewCheckIn(req, res, user);
  if (!goal_id) return res.status(400).json({ error: "goal_id, phase_id, program_id, or checkin_id is required" });

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
