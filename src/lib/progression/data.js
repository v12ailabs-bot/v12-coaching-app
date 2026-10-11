import { supabase } from "../../supabaseClient.js";
import { evaluateProgression } from "./methods.js";
import { latestSessionRows } from "./engine.js";
import { decideRecommendation } from "./decisions.js";

// Thin Supabase layer around the pure engine. Nothing here is wired into the UI
// yet (Slice 1). Writes go to progression_recommendations (coach-only RLS) —
// the client-facing workout_logs path is untouched.

// Evaluates one exercise's most recent session and stores the result as a
// pending recommendation. Re-running for the same exercise/method/session is a
// no-op returning the existing row (unique index), never a duplicate.
export async function recommendForExercise({ exercise, clientId, currentLoad, oneRepMax, week, techniqueConfirmed }) {
  const methodId = exercise.progression_method;
  if (!methodId) return { error: "This exercise has no progression method assigned." };
  const { data: rows, error } = await supabase.from("workout_logs").select("*").eq("exercise_id", exercise.id).eq("client_id", clientId).order("date");
  if (error) return { error: error.message };
  const session = latestSessionRows(rows || []);
  const calcResult = evaluateProgression(methodId, { config: exercise.progression_config || {}, currentLoad, sets: session.rows, oneRepMax, week, techniqueConfirmed });
  if (!session.date || ["reference_only", "invalid"].includes(calcResult.status)) return { calcResult, stored: null };

  const row = {
    client_id: clientId, exercise_id: exercise.id, method_id: methodId, session_date: session.date,
    calc_input: { currentLoad, oneRepMax: oneRepMax ?? null, week: week ?? null, techniqueConfirmed: techniqueConfirmed ?? null, config: exercise.progression_config || {}, sets: calcResult.calc?.sets ?? null },
    calc_result: calcResult, recommended_load: calcResult.recommendedLoad,
  };
  const { data, error: insErr } = await supabase.from("progression_recommendations").upsert(row, { onConflict: "exercise_id,method_id,session_date", ignoreDuplicates: true }).select().maybeSingle();
  if (insErr) return { calcResult, error: insErr.message };
  if (data) return { calcResult, stored: data };
  const { data: existing } = await supabase.from("progression_recommendations").select("*").eq("exercise_id", exercise.id).eq("method_id", methodId).eq("session_date", session.date).maybeSingle();
  return { calcResult, stored: existing };
}

export async function decide(recommendation, decision, coachId) {
  const d = decideRecommendation(recommendation, decision);
  if (!d.ok) return d;
  const { error } = await supabase.from("progression_recommendations").update({
    status: d.status, approved_prescription: d.approvedPrescription, decided_by: coachId, decided_at: new Date().toISOString(), decision_note: d.note,
  }).eq("id", recommendation.id).eq("status", "pending");
  return error ? { ok: false, error: error.message } : d;
}
