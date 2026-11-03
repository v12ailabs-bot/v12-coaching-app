import { supabase } from "../supabaseClient.js";

// Strength memory (client_strength_records): what a client has proven they can
// lift, keyed by exercise NAME so it outlives the exercise row. Kept current by a
// database trigger on workout_logs. Formatting helpers live in strengthRecords.js.

// Map of exerciseKey -> record for one client. Names the coach has declared "the same
// lift" (client_strength_aliases) point at the same record object.
export async function fetchStrengthMemory(clientId) {
  const { data, error } = await supabase.from("client_strength_records").select("*").eq("client_id", clientId);
  if (error) return new Map(); // table not migrated yet / no access: behave as "no memory"
  const map = new Map((data || []).map((r) => [r.exercise_key, r]));
  const { data: aliases } = await supabase.from("client_strength_aliases").select("alias_key,canonical_key").eq("client_id", clientId);
  (aliases || []).forEach((a) => { const rec = map.get(a.canonical_key); if (rec && !map.has(a.alias_key)) map.set(a.alias_key, rec); });
  return map;
}

// Coach corrections (RLS: coach only).
export async function updateStrengthRecord(id, patch) {
  return supabase.from("client_strength_records").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}
export async function deleteStrengthRecord(id) {
  return supabase.from("client_strength_records").delete().eq("id", id);
}
// "These two names are the same lift": fold fromKey into intoKey and remember the link.
export async function mergeStrengthRecords(clientId, fromKey, intoKey) {
  return supabase.rpc("merge_strength_records", { p_client: clientId, p_from_key: fromKey, p_into_key: intoKey });
}

// Save a coach-verified 1RM for a lift (keyed by name, so it outlives the exercise row). Creates the record when
// the client has no logs for the lift yet; an existing record only has its 1RM fields changed.
export async function saveVerifiedOneRm({ clientId, exerciseKey, exerciseName, value }) {
  const v = Number(value);
  if (!(v > 0)) return { error: { message: "Enter a 1RM above 0." } };
  return supabase.from("client_strength_records").upsert(
    { client_id: clientId, exercise_key: exerciseKey, exercise_name: exerciseName, verified_1rm: v, verified_1rm_date: new Date().toISOString().slice(0, 10) },
    { onConflict: "client_id,exercise_key" });
}
