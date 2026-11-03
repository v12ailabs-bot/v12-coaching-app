// Estimated 1RM from logged sets (Epley: weight x (1 + reps/30)). Pure.
// An ESTIMATE, never a verified 1RM: it is only ever shown to the coach as a starting point, labelled as such,
// and a calculation made from it is recorded as "estimated". Sets above MAX_REPS are ignored because the formula
// becomes unreliable at high reps; a single (reps = 1) is the weight itself.

export const MAX_REPS = 10;
export const WINDOW_DAYS = 120;

export function epley(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !Number.isInteger(r) || r < 1 || r > MAX_REPS) return null;
  return r === 1 ? w : w * (1 + r / 30);
}

const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

// sets: [{ weight, reps, date, set_type? }]. Warm-ups are ignored. Uses the best estimate from sets within the
// last WINDOW_DAYS; if nothing recent qualifies, falls back to the best older one and says so (stale: true).
export function estimateOneRm(sets, today) {
  const cands = (sets || []).filter((s) => (s.set_type || "working") === "working")
    .map((s) => ({ ...s, e: epley(s.weight, s.reps) })).filter((s) => s.e != null && s.date);
  if (!cands.length) return null;
  const best = (list) => list.reduce((a, b) => (b.e > a.e ? b : a));
  const recent = cands.filter((s) => daysBetween(s.date, today) <= WINDOW_DAYS && daysBetween(s.date, today) >= 0);
  const pick = recent.length ? best(recent) : best(cands);
  return { value: Math.round(pick.e), formula: "Epley", basedOn: { weight: Number(pick.weight), reps: Number(pick.reps), date: pick.date }, stale: !recent.length };
}
