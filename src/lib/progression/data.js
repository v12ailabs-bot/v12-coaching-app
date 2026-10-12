import { supabase } from "../../supabaseClient.js";
import { evaluateProgression } from "./methods.js";
import { latestSessionRows } from "./engine.js";
import { decideRecommendation } from "./decisions.js";
import { planTaper, applyTaperOverride, evaluateTaperWatch } from "./taper.js";
import { todayStr } from "../dates.js";

// Thin Supabase layer around the pure engine. Nothing here is wired into the UI
// yet (Slice 1). Writes go to progression_recommendations (coach-only RLS) —
// the client-facing workout_logs path is untouched.

// Evaluates one exercise's most recent session. The stored recommendation for
// an exercise/method/session is the authoritative one (its calculation is
// frozen), so if one already exists it is returned as-is rather than
// recalculated. Only actionable results (increase / hold / prescription) are
// stored; insufficient-data and invalid results are returned but not saved, so
// an early incomplete session can never block a later, complete one.
export async function recommendForExercise({ exercise, clientId, currentLoad, oneRepMax, week, techniqueConfirmed, painReported }) {
  const methodId = exercise.progression_method;
  if (!methodId) return { error: "This exercise has no progression method assigned." };
  const { data: rows, error } = await supabase.from("workout_logs").select("*").eq("exercise_id", exercise.id).eq("client_id", clientId).order("date");
  if (error) return { error: error.message };
  const session = latestSessionRows(rows || []);

  // Some methods need more than this exercise's latest session.
  //  * density: every logged row, the statuses of its earlier recommendations (consecutive-regression
  //    rule) and, if the coach set a readiness rule, that day's check-in values.
  //  * conjugate max effort: the logs of every max-effort exercise for the same lift (fatigue watch).
  let extra = {};
  if (methodId === "density_progression") {
    const { data: prior } = await supabase.from("progression_recommendations").select("calc_result,session_date").eq("exercise_id", exercise.id).eq("method_id", methodId).lt("session_date", session.date || "9999-12-31").order("session_date", { ascending: false }).limit(10);
    let readiness = null;
    if (exercise.progression_config?.readiness && session.date) {
      const { data: ck } = await supabase.from("daily_checkins").select("energy,sleep,mood").eq("client_id", clientId).eq("date", session.date).maybeSingle();
      readiness = ck || null;
    }
    extra = { allRows: rows, history: (prior || []).map((p) => p.calc_result?.status), readiness };
  } else if (methodId === "conjugate") {
    extra = { allRows: rows, exerciseName: exercise.name, siblingRows: [] };
    const cfg = exercise.progression_config || {};
    if (cfg.role === "max_effort" && cfg.lift) {
      const { data: sibs } = await supabase.from("exercises").select("id,name,progression_config").eq("client_id", clientId).eq("progression_method", "conjugate").is("retired_at", null);
      const same = (sibs || []).filter((e) => e.progression_config?.role === "max_effort" && String(e.progression_config?.lift || "").trim().toLowerCase() === String(cfg.lift).trim().toLowerCase());
      const since = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
      if (same.length) {
        const { data: logs } = await supabase.from("workout_logs").select("*").in("exercise_id", same.map((e) => e.id)).eq("client_id", clientId).gte("date", since);
        const nm = Object.fromEntries(same.map((e) => [e.id, e.name]));
        extra.siblingRows = (logs || []).map((l) => ({ ...l, exercise: nm[l.exercise_id] }));
      }
    }
  }
  const calcResult = evaluateProgression(methodId, { config: exercise.progression_config || {}, currentLoad, sets: session.rows, oneRepMax, week, techniqueConfirmed, painReported, today: new Date(), ...extra });
  const actionable = ["increase", "decrease", "hold", "prescription", "progress", "regression"].includes(calcResult.status);

  // A PRESCRIPTION (percentage-based, conjugate dynamic effort) is for NOW, not tied to a past
  // session, and can exist before anything is logged: it is keyed by today's date. Every other result
  // is keyed by the session it evaluated.
  const keyDate = calcResult.status === "prescription" ? todayStr() : session.date;
  if (!keyDate || !actionable) return { sessionDate: session.date, calcResult, stored: null };

  // The stored recommendation for an exercise/method/date is authoritative (its calculation is frozen).
  const { data: existing } = await supabase.from("progression_recommendations").select("*")
    .eq("exercise_id", exercise.id).eq("method_id", methodId).eq("session_date", keyDate).maybeSingle();
  if (existing) return { sessionDate: keyDate, stored: existing, calcResult: existing.calc_result };

  const row = {
    client_id: clientId, exercise_id: exercise.id, method_id: methodId, session_date: keyDate,
    calc_input: { currentLoad, oneRepMax: oneRepMax ?? null, week: week ?? null, techniqueConfirmed: techniqueConfirmed ?? null, config: exercise.progression_config || {}, sets: calcResult.calc?.sets ?? null },
    calc_result: calcResult, recommended_load: calcResult.recommendedLoad,
  };
  const { data, error: insErr } = await supabase.from("progression_recommendations").insert(row).select().single();
  if (insErr) return { sessionDate: keyDate, calcResult, error: insErr.message };
  return { sessionDate: keyDate, calcResult, stored: data };
}

// Most recent stored recommendations for an exercise (newest first) — the
// decision history shown under the panel.
export async function fetchRecommendations(exerciseId, limit = 5) {
  const { data } = await supabase.from("progression_recommendations").select("*").eq("exercise_id", exerciseId).order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

// Records the coach's decision AND, for approve/modify, writes the load to the
// exercise as the client's current target — one database transaction
// (decide_progression_recommendation), so the decision and the prescription
// can't disagree. Validation mirrors decisions.js; the database re-checks it.
export async function decide(recommendation, decision) {
  const pre = decideRecommendation(recommendation, decision);
  if (!pre.ok) return pre;
  const { data, error } = await supabase.rpc("decide_progression_recommendation", {
    p_rec_id: recommendation.id, p_decision: decision.decision, p_modified_load: decision.decision === "modify" ? decision.modifiedLoad : null, p_note: decision.note || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, status: data.status, prescribedWeight: data.prescribed_weight };
}

// ---- Performance taper (plan-level, not per exercise) -----------------------------
// Baseline volume comes from the client's logged working sets over the coach's
// reference period. The calculated plan, the in-force plan and every override are
// stored separately (taper_plans: the original is immutable, the log is append-only).
export async function loadTaperLogs(clientId, referencePeriod) {
  const from = referencePeriod?.start, to = referencePeriod?.end;
  const { data: ex } = await supabase.from("exercises").select("id,name").eq("client_id", clientId);
  const ids = (ex || []).map((e) => e.id);
  if (!ids.length || !from || !to) return [];
  const nameById = Object.fromEntries((ex || []).map((e) => [e.id, e.name]));
  const { data: logs } = await supabase.from("workout_logs").select("date,sets,reps,weight,set_type,exercise_id").in("exercise_id", ids).gte("date", from).lte("date", to);
  return (logs || []).map((l) => ({ ...l, exercise: nameById[l.exercise_id] }));
}

export async function createTaperPlan({ clientId, programId = null, name, config, coachId }) {
  const logs = await loadTaperLogs(clientId, config?.referencePeriod);
  const plan = planTaper({ config, logs });
  if (plan.status !== "prescription") return { ok: false, plan };
  const { data, error } = await supabase.from("taper_plans").insert({
    client_id: clientId, program_id: programId, name, event_date: config.eventDate, config, calculated: plan, current_plan: plan, created_by: coachId || null,
  }).select().single();
  return error ? { ok: false, error: error.message, plan } : { ok: true, row: data, plan };
}

export async function fetchTaperPlans(clientId) {
  const { data } = await supabase.from("taper_plans").select("*").eq("client_id", clientId).order("event_date", { ascending: false });
  return data || [];
}

export async function overrideTaper(row, override, coachId) {
  const r = applyTaperOverride({ plan: row.current_plan, calculated: row.calculated, log: row.override_log || [], override, by: coachId });
  if (!r.ok) return r;
  const { error } = await supabase.from("taper_plans").update({ current_plan: r.plan, override_log: r.log }).eq("id", row.id);
  return error ? { ok: false, errors: [error.message] } : { ok: true, plan: r.plan, log: r.log };
}

// Flags for coach review from real data only (check-in readiness values in the taper
// window + pain reports the coach passes in). Never changes the plan.
export async function taperWatch(row, { painReports = [], performance = null } = {}) {
  const w = row.current_plan?.window;
  if (!w) return null;
  const { data } = await supabase.from("daily_checkins").select("date,energy,sleep,mood").eq("client_id", row.client_id).gte("date", w.start).lte("date", w.end);
  return evaluateTaperWatch({ config: row.config, window: w, readinessRows: data || [], painReports, performance });
}
