// Validation for AI-generated plan details. The model proposes; this decides
// what is kept. Pure and dependency-free so it's unit-tested. Anything that
// isn't the expected shape/range is dropped rather than coerced, and the Day 90
// review is added deterministically (not left to the model).

export const CHECKPOINT_TYPES = ["reassessment", "nutrition_review", "goal_review", "day90_review"];
export const CHANGE_ACTIONS = ["replace", "add", "remove", "progress"];
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function sanitizePlanDetails(raw, phases, programWeeks) {
  const maxDay = Math.max(0, (Number(programWeeks) || 12) * 7);
  const out = phases.map(() => ({ plan_rationale: "", planned_changes: [], checkpoints: [] }));
  const items = Array.isArray(raw?.phases) ? raw.phases : [];
  items.forEach((p) => {
    const i = Number.isInteger(p?.index) ? p.index : -1;
    if (i < 0 || i >= phases.length) return;
    const target = out[i];
    target.plan_rationale = str(p.plan_rationale, 500);
    target.planned_changes = (Array.isArray(p.planned_changes) ? p.planned_changes : []).slice(0, 6).map((c) => ({
      action: CHANGE_ACTIONS.includes(c?.action) ? c.action : null,
      from: str(c?.from, 80), to: str(c?.to, 80), reason: str(c?.reason, 240),
    })).filter((c) => c.action && c.reason && (c.to || c.from));
    const seen = new Set();
    target.checkpoints = (Array.isArray(p.checkpoints) ? p.checkpoints : []).slice(0, 4).map((c) => ({
      type: CHECKPOINT_TYPES.includes(c?.type) && c.type !== "day90_review" ? c.type : null,
      label: str(c?.label, 80), day: Number.isInteger(c?.day) ? c.day : null,
    })).filter((c) => {
      if (!c.type || !c.label || c.day == null || c.day < 0 || c.day > maxDay) return false;
      const key = c.type + ":" + c.day;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  // Deterministic Day 90 review on the final phase (a 12-week program ends at
  // day 84, so this is the follow-up review, not a training day).
  if (out.length) {
    const last = out[out.length - 1];
    if (!last.checkpoints.some((c) => c.type === "day90_review")) last.checkpoints.push({ type: "day90_review", label: "Day 90 review", day: 90 });
  }
  return out;
}

