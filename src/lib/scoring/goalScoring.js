// Pure, dependency-free goal-progress scoring — no Supabase, no DOM. Kept
// separate and unit-tested because a silently-wrong Goal Score is a
// trust-breaking bug class the rest of the app's low-stakes UI doesn't have.
//
// `series` is [{date: 'YYYY-MM-DD', value: number}, ...] for the goal's
// primary metric, ascending by date. `goal` is a client_goals row (or the
// subset: direction, baseline_value, baseline_date, target_value, target_date).
// `components` are already-computed 0-100 scores (or null when there's no
// data): { nutrition, training, recovery, habit }.

const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Average of the values within the trailing `days` window ending at `today`
// (inclusive). Returns null if the window has no data — callers must treat
// that as "no signal," never as 0.
export function trailingAverage(series, today, days) {
  const cutoff = new Date(today.getTime() - (days - 1) * DAY_MS);
  const inWindow = (series || []).filter(p => {
    const d = new Date(p.date + "T00:00:00Z");
    return d >= cutoff && d <= today && p.value != null;
  });
  if (!inWindow.length) return null;
  return inWindow.reduce((s, p) => s + p.value, 0) / inWindow.length;
}

// Least-squares slope of value vs. elapsed days, in units/day. Using actual
// date deltas (not point index) so irregular check-in spacing doesn't skew
// the trend. Returns null if fewer than 2 distinct dates are present.
export function linregressSlope(series) {
  const pts = (series || []).filter(p => p.value != null);
  if (pts.length < 2) return null;
  const t0 = new Date(pts[0].date + "T00:00:00Z").getTime();
  const xs = pts.map(p => (new Date(p.date + "T00:00:00Z").getTime() - t0) / DAY_MS);
  const ys = pts.map(p => p.value);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // all points on the same day
  return (n * sumXY - sumX * sumY) / denom;
}

// Scores the goal's primary metric against its baseline->target timeline.
// Returns { score, progressRatio, velocity, etaDate, classification } where
// score/progressRatio/etaDate are null when there isn't enough data yet.
export function computePrimaryProgress(goal, series, today = new Date()) {
  const baselineDate = new Date(goal.baseline_date + "T00:00:00Z");
  const targetDate = new Date(goal.target_date + "T00:00:00Z");
  const totalDays = daysBetween(baselineDate, targetDate);

  if (daysBetween(baselineDate, today) < 7) {
    return { score: null, progressRatio: null, velocity: null, etaDate: null, classification: "Gathering Data" };
  }

  const current = trailingAverage(series, today, 7);
  if (current == null) {
    return { score: null, progressRatio: null, velocity: null, etaDate: null, classification: "Gathering Data" };
  }

  const velocity = linregressSlope((series || []).filter(p => daysBetween(new Date(p.date + "T00:00:00Z"), today) <= 30));
  const actualDelta = current - goal.baseline_value;

  let score, progressRatio = null;
  if (goal.direction === "maintain") {
    const tolerance = Math.max(Math.abs(goal.baseline_value) * 0.02, 1e-6);
    score = clamp(100 - (Math.abs(actualDelta) / tolerance) * 100, 0, 100);
  } else {
    const elapsedFraction = clamp(totalDays > 0 ? daysBetween(baselineDate, today) / totalDays : 1, 0, 1);
    const expectedDelta = (goal.target_value - goal.baseline_value) * elapsedFraction;
    progressRatio = expectedDelta !== 0 ? actualDelta / expectedDelta : (actualDelta === 0 ? 1 : 0);
    score = clamp(progressRatio * 100, 0, 100);
  }

  // ETA: only report a date when velocity is actually moving toward the
  // target — a flat or wrong-signed trend gets `null`, never a fabricated date.
  let etaDate = null;
  const neededSign = Math.sign(goal.target_value - goal.baseline_value);
  const remaining = goal.target_value - current;
  const velocityHelps = velocity != null && Math.abs(velocity) > 1e-9 &&
    Math.sign(velocity) === (goal.direction === "maintain" ? Math.sign(velocity) : neededSign);
  if (goal.direction !== "maintain" && velocityHelps && Math.sign(remaining) === neededSign) {
    const daysNeeded = remaining / velocity;
    if (daysNeeded > 0 && Number.isFinite(daysNeeded)) {
      etaDate = new Date(today.getTime() + daysNeeded * DAY_MS);
    }
  }

  const velocityWrongSigned = goal.direction !== "maintain" && velocity != null &&
    Math.abs(velocity) > 1e-9 && Math.sign(velocity) !== neededSign && neededSign !== 0;

  let classification;
  if (velocityWrongSigned) classification = "Off Track";
  else if (score >= 90) classification = "On Track";
  else if (score >= 60) classification = "Slightly Behind";
  else classification = "Off Track";

  return { score, progressRatio, velocity, etaDate, classification };
}

// Blends the primary-metric score with supporting components. Any component
// that's null (no data in the window) is dropped and the remaining weights
// are renormalized to sum to 1 — mirrors api/_lib/scores.js's convention of
// preserving "unassessed" rather than silently scoring it as a failure.
const WEIGHTS = { primary: 0.4, nutrition: 0.2, training: 0.15, recovery: 0.1, habit: 0.15 };

export function computeGoalScore(goal, series, components = {}, today = new Date()) {
  const primary = computePrimaryProgress(goal, series, today);
  if (primary.score == null) {
    return { ...primary, overallScore: null };
  }

  const values = { primary: primary.score, ...components };
  let weightSum = 0, weighted = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const v = values[key];
    if (v == null) continue;
    weightSum += WEIGHTS[key];
    weighted += WEIGHTS[key] * v;
  }
  const overallScore = weightSum > 0 ? Math.round(weighted / weightSum) : null;

  return { ...primary, overallScore };
}
