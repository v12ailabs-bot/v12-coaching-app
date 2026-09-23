// Extracted out of src/lib/milestones.js (which imports the browser
// supabaseClient.js at module scope) so this pure calculation can be
// imported from server-side code without pulling in a browser-only client
// -- same reasoning as src/lib/dates.js in HC-004. src/lib/milestones.js
// re-exports this unchanged, so its existing importers (CoachHome,
// MilestonesCard, CurrentMilestoneCard) needed no changes.

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
