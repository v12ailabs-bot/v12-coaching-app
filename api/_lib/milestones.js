import { supabaseAdmin } from "./supabaseAdmin.js";

// Current value per exercise-tracked milestone, same "top set on most recent
// logged date" convention as MilestonesCard/currentExerciseValue
// (src/lib/milestones.js) and strengthTrendsFrom. Shared by
// handlePhaseRecommendation and handleGenerateRoadmap in api/goal-insight.js,
// and by the Head Coach core-state module (api/_lib/headCoachCoreState.ts) —
// extracted here instead of left inline so a third copy of this logic never
// gets written.
export async function currentMilestoneValues(clientId, milestones) {
  return Promise.all((milestones || []).map(async (m) => {
    if (!m.exercise_name) return { ...m, current_value: null };
    const { data: exs } = await supabaseAdmin.from("exercises").select("id").eq("client_id", clientId).ilike("name", m.exercise_name);
    const ids = (exs || []).map((e) => e.id);
    if (!ids.length) return { ...m, current_value: null };
    const { data: logs } = await supabaseAdmin.from("workout_logs").select("date,weight,reps").in("exercise_id", ids).order("date", { ascending: false }).limit(10);
    if (!logs?.length) return { ...m, current_value: null };
    const key = m.unit === "reps" ? "reps" : "weight";
    const values = logs.filter((l) => l.date === logs[0].date).map((l) => l[key]).filter((v) => v != null);
    return { ...m, current_value: values.length ? Math.max(...values) : null };
  }));
}
