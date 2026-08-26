// Formula-based macro calculator (Mifflin-St Jeor BMR -> TDEE -> goal-
// adjusted calories -> macro split). Deliberately NOT personalized nutrition:
// no persistence, no AI, no ongoing plan -- a one-shot calculation the
// client runs in the Library, same input/output every time for the same
// inputs. Available to every tier (Starter included); must never be
// confused with or unlock the Program-tier personalized nutrition plan.

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUST = { lose: 0.8, maintain: 1, gain: 1.1 };

export const ACTIVITY_OPTIONS = [
  { key: "sedentary", label: "Sedentary (little to no exercise)" },
  { key: "light", label: "Light (1-3 days/week)" },
  { key: "moderate", label: "Moderate (3-5 days/week)" },
  { key: "active", label: "Active (6-7 days/week)" },
  { key: "very_active", label: "Very active (physical job + training)" },
];

export const GOAL_OPTIONS = [
  { key: "lose", label: "Lose fat" },
  { key: "maintain", label: "Maintain" },
  { key: "gain", label: "Gain muscle" },
];

// All inputs required -- returns null rather than guessing at a partial
// calculation. weightLb/heightIn/age are the client's own numbers, entered
// fresh each time (no read from body-weight tracking, which Starter doesn't
// have access to anyway).
export function calculateMacros({ sex, age, weightLb, heightIn, activity, goal }) {
  if (!sex || !age || !weightLb || !heightIn || !activity || !goal) return null;
  if (!ACTIVITY_MULTIPLIERS[activity] || !GOAL_ADJUST[goal]) return null;

  const weightKg = weightLb * 0.453592;
  const heightCm = heightIn * 2.54;
  const bmr = sex === "male"
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const tdee = bmr * ACTIVITY_MULTIPLIERS[activity];
  const calories = Math.round(tdee * GOAL_ADJUST[goal]);

  const proteinG = Math.round(weightLb * 1); // ~1g per lb bodyweight
  const fatsG = Math.round((calories * 0.27) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatsG * 9) / 4));

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), calories, proteinG, carbsG, fatsG };
}
