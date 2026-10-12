// Shared by the coach editor and the (client-visible) roadmap modal. Pure.
export const CHECKPOINT_LABELS = { reassessment: "Reassessment", nutrition_review: "Nutrition review", goal_review: "Goal review", day90_review: "Day 90 review" };

// "Day 28" or, with the program's start date, "Day 28 · Oct 9".
export function checkpointWhen(checkpoint, startDate) {
  const day = Number(checkpoint.day);
  if (!Number.isFinite(day)) return "";
  if (!startDate) return `Day ${day}`;
  const d = new Date(startDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + day);
  return `Day ${day} · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

// Stable stringify (keys sorted recursively). jsonb round-trips through
// Postgres with its own key order, so comparing a stored snapshot to a fresh
// one needs a canonical form or every save would look "changed".
export function canonicalJson(v) {
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}

// Snapshot of the roadmap for plan history: only plan content, in order, so two
// saves with identical content compare equal and don't mint a new version.
export function planSnapshot(rows) {
  return rows.map((r, i) => ({
    order_index: i, phase: r.phase, week_start: r.week_start === "" ? null : Number(r.week_start), week_end: r.week_end === "" ? null : Number(r.week_end),
    note: r.note || null, objective: r.objective || null, training_focus: r.training_focus || null, movement_focus: r.movement_focus || null,
    progression_strategy: r.progression_strategy || null, exit_criteria: r.exit_criteria || [],
    checkpoints: r.checkpoints || [], plan_rationale: r.plan_rationale || null, planned_changes: r.planned_changes || [],
  }));
}
