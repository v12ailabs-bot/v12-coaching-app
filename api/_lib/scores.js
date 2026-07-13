// Shared coercion for the V12 three-system assessment scores.
//
// Coerces a Notion value into a 1-10 integer, or null when there is no usable
// value. Blank/absent MUST stay null so a sync or generation never wipes a
// coach-set score, and so an unassessed client is never silently defaulted to a
// score of 1. (The old bug: Number("") -> 0, then clamped up to 1, which made
// every unassessed client look like they'd been rated 1/10.)
export function toScore(v) {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : null;
}
