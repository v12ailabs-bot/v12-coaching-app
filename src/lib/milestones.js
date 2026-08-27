import { supabase } from "../supabaseClient.js";

export const MILESTONE_CATEGORY_LABELS = {
  strength: "Strength",
  rep_performance: "Rep Performance",
  exercise_progression: "Exercise Progression",
  conditioning: "Conditioning",
  movement_competency: "Movement Competency",
  body_composition: "Body Composition",
  consistency: "Consistency",
};

// Exercise-based milestones (category not null) -- additive to the existing
// single-bodyweight-goal system, see add_milestone_fields.sql. Ordered
// primary-first so the UI can highlight the one headline target.
export async function fetchMilestones(clientId) {
  const { data } = await supabase.from("client_goals").select("*")
    .eq("client_id", clientId).eq("status", "active").not("category", "is", null)
    .order("priority").order("created_at", { ascending: false });
  return data || [];
}

// Live current value for an exercise-tracked milestone, read straight from
// workout_logs (the client's actual logged performance) -- never stored, so
// it can't drift out of sync with reality. Mirrors the "top set per day"
// convention used by strengthTrendsFrom (api/_lib/strengthTrends.js) and the
// client-facing exercise charts: heaviest weight, or most reps for
// bodyweight moves, on the most recent logged date.
export async function currentExerciseValue(clientId, exerciseName, isBodyweight) {
  const { data: exs } = await supabase.from("exercises").select("id").eq("client_id", clientId).ilike("name", exerciseName);
  const ids = (exs || []).map((e) => e.id);
  if (ids.length === 0) return null;
  const { data: logs } = await supabase.from("workout_logs").select("date,weight,reps").in("exercise_id", ids).order("date", { ascending: false }).limit(30);
  if (!logs || logs.length === 0) return null;
  const latestDate = logs[0].date;
  const sameDayLogs = logs.filter((l) => l.date === latestDate);
  const key = isBodyweight ? "reps" : "weight";
  const values = sameDayLogs.map((l) => l[key]).filter((v) => v != null);
  return values.length ? Math.max(...values) : null;
}

// direction 'increase' (default) — most milestone categories move upward
// (more weight/reps/capacity); body_composition milestones can move either
// way, so direction is read off the goal row like the existing bodyweight
// goal system already does.
export function milestoneProgress(goal, currentValue) {
  if (currentValue == null) return { progressPct: null, achieved: false };
  const { baseline_value: base, target_value: target, direction } = goal;
  const dir = direction || "increase";
  const achieved = dir === "decrease" ? currentValue <= target : currentValue >= target;
  const span = target - base;
  const progressPct = span === 0 ? 100 : Math.max(0, Math.min(100, Math.round(((currentValue - base) / span) * 100)));
  return { progressPct, achieved };
}

export async function markMilestoneAchieved(goalId) {
  await supabase.from("client_goals").update({ status: "achieved", updated_at: new Date().toISOString() }).eq("id", goalId);
}
