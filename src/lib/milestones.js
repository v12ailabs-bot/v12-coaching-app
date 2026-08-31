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

// Auto-detected the moment a live-computed value first clears the target —
// independent of the coach clicking "Mark Achieved" (which only archives the
// row's status). This is what lets a hit surface on its own, on the coach's
// Recent Activity feed and as a popup on the client's page, instead of
// waiting for the coach to notice and confirm it manually. No-ops past the
// first hit (achieved_at is set once, never overwritten).
export async function recordAchievement(goalId) {
  await supabase.from("client_goals").update({ achieved_at: new Date().toISOString() }).eq("id", goalId).is("achieved_at", null);
}

// Milestones this client has hit that the coach hasn't seen a popup for yet —
// drives the "you opened this client's page" notification.
export async function fetchUnacknowledgedAchievements(clientId) {
  const { data } = await supabase.from("client_goals").select("*")
    .eq("client_id", clientId).not("achieved_at", "is", null).is("coach_acknowledged_at", null)
    .order("achieved_at", { ascending: false });
  return data || [];
}

export async function acknowledgeAchievements(goalIds) {
  if (!goalIds.length) return;
  await supabase.from("client_goals").update({ coach_acknowledged_at: new Date().toISOString() }).in("id", goalIds);
}

// Coach-wide feed of recent hits across all (coaching) clients, for
// RecentActivityFeed — same WINDOW_HOURS cutoff as the other event types
// merged into that feed, not gated on acknowledgment (a hit stays in the
// 48h feed whether or not the coach has already seen the popup for it).
export async function fetchRecentMilestoneAchievements(clientIds, cutoffIso) {
  if (!clientIds.length) return [];
  const { data } = await supabase.from("client_goals").select("client_id,exercise_name,category,target_value,unit,achieved_at")
    .in("client_id", clientIds).not("achieved_at", "is", null).gte("achieved_at", cutoffIso);
  return data || [];
}
