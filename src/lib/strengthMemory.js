import { supabase } from "../supabaseClient.js";

// Strength memory (client_strength_records): what a client has proven they can
// lift, keyed by exercise NAME so it outlives the exercise row. Kept current by a
// database trigger on workout_logs; nothing here writes to it. Formatting helpers
// live in strengthRecords.js.

// Map of exerciseKey -> record for one client.
export async function fetchStrengthMemory(clientId) {
  const { data, error } = await supabase.from("client_strength_records").select("*").eq("client_id", clientId);
  if (error) return new Map(); // table not migrated yet / no access: behave as "no memory"
  return new Map((data || []).map((r) => [r.exercise_key, r]));
}
