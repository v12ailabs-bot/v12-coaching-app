// Validates the AI's "what next after this milestone" suggestion. The model proposes; this keeps
// only what is safe to show a coach and to act on: a next target that moves the SAME direction
// as the milestone and stays within a sane step (so a typo like 3250 lb can never become a
// milestone), and an exercise plan limited to known actions. Pure.

export const PLAN_ACTIONS = ["continue", "variation", "swap", "retire"];
const MAX_STEP_PCT = 0.30;   // next target at most 30% beyond the one just hit

const text = (v, n = 400) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t ? t.slice(0, n) : null; };

export function validateNextStep(goal, raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const dir = goal.direction === "decrease" ? "decrease" : "increase";
  const hit = Number(goal.target_value);
  let next_target = null;
  const v = Number(r.next_target?.value);
  if (Number.isFinite(v) && Number.isFinite(hit) && hit > 0) {
    const ok = dir === "increase" ? v > hit && v <= hit * (1 + MAX_STEP_PCT) : v < hit && v >= hit * (1 - MAX_STEP_PCT);
    if (ok) next_target = { value: Math.round(v * 10) / 10, unit: goal.unit || null, weeks: Number.isFinite(Number(r.next_target?.weeks)) ? Math.min(52, Math.max(1, Math.round(Number(r.next_target.weeks)))) : null, reasoning: text(r.next_target?.reasoning) };
  }
  const action = PLAN_ACTIONS.includes(r.exercise_plan?.action) ? r.exercise_plan.action : "continue";
  return {
    headline: text(r.headline, 200),
    next_target,                       // null => the AI gave no usable target; the coach sets one by hand
    exercise_plan: { action, exercise: text(r.exercise_plan?.exercise, 120) || goal.exercise_name || null, suggested_exercise: action === "variation" || action === "swap" ? text(r.exercise_plan?.suggested_exercise, 120) : null, reasoning: text(r.exercise_plan?.reasoning) },
    coach_note: text(r.coach_note, 500),
  };
}
