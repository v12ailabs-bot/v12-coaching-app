// Pure helpers for strength memory (client_strength_records) — no I/O, so they are unit-testable.

// Must match the SQL strength_exercise_key().
export const exerciseKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

const fmtDate = (d) => { if (!d) return ""; const [y, m, day] = String(d).split("-").map(Number); return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };

// One short line for the coach, e.g. "Best 225 lb × 3 (Sep 15, 2026) · last 185 lb × 8 (Sep 22, 2026)".
export function describeRecord(rec) {
  if (!rec) return null;
  const parts = [];
  if (rec.is_bodyweight || rec.best_weight == null) {
    if (rec.best_reps != null) parts.push(`Best ${rec.best_reps} reps`);
    if (rec.last_reps != null && rec.last_date) parts.push(`last ${rec.last_reps} reps (${fmtDate(rec.last_date)})`);
  } else {
    parts.push(`Best ${rec.best_weight} lb${rec.best_weight_reps ? ` × ${rec.best_weight_reps}` : ""}${rec.best_weight_date ? ` (${fmtDate(rec.best_weight_date)})` : ""}`);
    if (rec.last_weight != null && rec.last_date) parts.push(`last ${rec.last_weight} lb${rec.last_reps ? ` × ${rec.last_reps}` : ""} (${fmtDate(rec.last_date)})`);
  }
  return parts.join(" · ") || null;
}

// The load to pre-fill as "current load": the client's most recent top weight.
export const memoryLoad = (rec) => (rec && !rec.is_bodyweight && Number(rec.last_weight) > 0 ? Number(rec.last_weight) : null);

// The coach-verified 1RM stored on a record (never estimated), or null.
export const verifiedOneRm = (rec) => (rec && Number(rec.verified_1rm) > 0 ? Number(rec.verified_1rm) : null);
