// A body-composition estimate SEPARATE from BMI (src/lib/bmi.js stays pure
// height+weight — that's what BMI actually is; blending in age/waist would
// make the number not-really-BMI-anymore, which is misleading to show
// labeled as BMI). This is a second, distinct estimate using the peer-
// reviewed Relative Fat Mass (RFM) formula — height + waist + sex — which
// needs no neck measurement (unlike the US Navy method), so it works with
// what this app already tracks.
//
// RFM (Woolcott & Bergman, 2018):
//   male:   64 - 20 * (height / waist)
//   female: 64 - 20 * (height / waist) + 12
export function computeBodyFatEstimate(heightIn, waistIn, sex) {
  if (!heightIn || !waistIn || !sex) return null;
  const base = 64 - 20 * (heightIn / waistIn);
  const pct = sex === "female" ? base + 12 : base;
  return Math.round(pct * 10) / 10;
}

// Age doesn't change the % above — it changes what counts as "healthy" for
// that %. Brackets below are simplified from commonly published (ACE-style)
// body-fat-percentage category charts; treat as an estimate, not a
// clinical reading.
const RANGES = {
  male: [
    { maxAge: 39, essential: 5, athletic: 13, fitness: 17, average: 24 },
    { maxAge: 59, essential: 5, athletic: 15, fitness: 19, average: 26 },
    { maxAge: Infinity, essential: 5, athletic: 17, fitness: 21, average: 28 },
  ],
  female: [
    { maxAge: 39, essential: 12, athletic: 20, fitness: 24, average: 31 },
    { maxAge: 59, essential: 12, athletic: 22, fitness: 26, average: 33 },
    { maxAge: Infinity, essential: 12, athletic: 23, fitness: 27, average: 35 },
  ],
};

export function bodyFatCategory(pct, age, sex) {
  if (pct == null || !age || !sex) return null;
  const brackets = RANGES[sex] || RANGES.male;
  const b = brackets.find((r) => age <= r.maxAge) || brackets[brackets.length - 1];
  if (pct < b.essential) return "Essential Fat";
  if (pct < b.athletic) return "Athletic";
  if (pct < b.fitness) return "Fitness";
  if (pct < b.average) return "Average";
  return "Above Average";
}
