// Nutrition-adherence component for the Goals Engine — uses the actual logged
// macros against the client's nutrition_plans targets. This is deliberately
// separate from the existing nutritionScoreFrom() in src/lib/scoring.js, which
// scores the qualitative self-rated "diet feeling" field and is left alone
// for its existing callers (Progress page wellness stats).

const DAY_MS = 86400000;
const MACRO_WEIGHTS = { protein_g: 0.4, calories: 0.3, carbs_g: 0.15, fats_g: 0.15 };

const macroAccuracy = (actual, target) => {
  if (target == null || target === 0) return null;
  return Math.max(0, 100 - (Math.abs(actual - target) / target) * 100);
};

// `checkins` is daily_checkins rows (date + calories/protein_g/carbs_g/fats_g),
// `targets` is the active nutrition_plans row (or null if none). Returns
// { score, loggingRate } — score is null when there's no target to score
// against or nothing logged in the window; loggingRate is always 0-1.
export function nutritionAdherenceFrom(checkins, targets, days = 30, today = new Date()) {
  const cutoff = new Date(today.getTime() - (days - 1) * DAY_MS);
  const recent = (checkins || []).filter(c => {
    const d = new Date(c.date + "T00:00:00Z");
    return d >= cutoff && d <= today;
  });

  const loggedDays = recent.filter(c =>
    c.calories != null || c.protein_g != null || c.carbs_g != null || c.fats_g != null
  );
  const loggingRate = recent.length ? loggedDays.length / days : 0;

  if (!targets || !loggedDays.length) return { score: null, loggingRate };

  let weightSum = 0, weighted = 0;
  for (const [key, weight] of Object.entries(MACRO_WEIGHTS)) {
    const target = targets[key];
    if (target == null) continue;
    const dayScores = loggedDays
      .map(c => macroAccuracy(c[key], target))
      .filter(v => v != null);
    if (!dayScores.length) continue;
    const avg = dayScores.reduce((s, v) => s + v, 0) / dayScores.length;
    weightSum += weight;
    weighted += weight * avg;
  }
  if (weightSum === 0) return { score: null, loggingRate };

  const macroScore = weighted / weightSum;
  // Silence isn't success: a day with no entry doesn't count toward the
  // macro average above, but it does drag the overall score down via
  // loggingRate so a client who logs 3 perfect days out of 30 doesn't read
  // as "100% on track."
  return { score: Math.round(macroScore * loggingRate), loggingRate };
}
