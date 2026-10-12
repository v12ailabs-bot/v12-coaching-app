import { supabase } from "../../supabaseClient.js";
import { evaluateProgression } from "./methods.js";
import { latestSessionRows } from "./engine.js";
import { decideRecommendation } from "./decisions.js";

// Thin Supabase layer around the pure engine. Nothing here is wired into the UI
// yet (Slice 1). Writes go to progression_recommendations (coach-only RLS) —
// the client-facing workout_logs path is untouched.

// Evaluates one exercise's most recent session. The stored recommendation for
// an exercise/method/session is the authoritative one (its calculation is
// frozen), so if one already exists it is returned as-is rather than
// recalculated. Only actionable results (increase / hold / prescription) are
// stored; insufficient-data and invalid results are returned but not saved, so
// an early incomplete session can never block a later, complete one.
export async function recommendForExercise({ exercise, clientId, currentLoad, oneRepMax, week, techniqueConfirmed }) {
  const methodId = exercise.progression_method;
  if (!methodId) return { error: "This exercise has no progression method assigned." };
  const { data: rows, error } = await supabase.from("workout_logs").select("*").eq("exercise_id", exercise.id).eq("client_id", clientId).order("date");
  if (error) return { error: error.message };
  const session = latestSessionRows(rows || []);

  if (session.date) {
    const { data: existing } = await supabase.from("progression_recommendations").select("*")
      .eq("exercise_id", exercise.id).eq("method_id", methodId).eq("session_date", session.date).maybeSingle();
    if (existing) return { sessionDate: session.date, stored: existing, calcResult: existing.calc_result };
  }
  const calcResult = evaluateProgression(methodId, { config: exercise.progression_config || {}, currentLoad, sets: session.rows, oneRepMax, week, techniqueConfirmed });
  const actionable = ["increase", "decrease", "hold", "prescription"].includes(calcResult.status);
  if (!session.date || !actionable) return { sessionDate: session.date, calcResult, stored: null };

  const row = {
    client_id: clientId, exercise_id: exercise.id, method_id: methodId, session_date: session.date,
    calc_input: { currentLoad, oneRepMax: oneRepMax ?? null, week: week ?? null, techniqueConfirmed: techniqueConfirmed ?? null, config: exercise.progression_config || {}, sets: calcResult.calc?.sets ?? null },
    calc_result: calcResult, recommended_load: calcResult.recommendedLoad,
  };
  const { data, error: insErr } = await supabase.from("progression_recommendations").insert(row).select().single();
  if (insErr) return { sessionDate: session.date, calcResult, error: insErr.message };
  return { sessionDate: session.date, calcResult, stored: data };
}

// Most recent stored recommendations for an exercise (newest first) — the
// decision history shown under the panel.
export async function fetchRecommendations(exerciseId, limit = 5) {
  const { data } = await supabase.from("progression_recommendations").select("*").eq("exercise_id", exerciseId).order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

export async function decide(recommendation, decision, coachId) {
  const d = decideRecommendation(recommendation, decision);
  if (!d.ok) return d;
  const { error } = await supabase.from("progression_recommendations").update({
    status: d.status, approved_prescription: d.approvedPrescription, decided_by: coachId, decided_at: new Date().toISOString(), decision_note: d.note,
  }).eq("id", recommendation.id).eq("status", "pending");
  return error ? { ok: false, error: error.message } : d;
}
