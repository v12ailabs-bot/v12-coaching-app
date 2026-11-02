// Builds the daily_checkins row from the Today form. A field the client never
// answered stays null — a displayed/resting default is never saved as if the
// client had confirmed it, and missing data is never turned into a negative
// answer (e.g. "missed" or "off plan").
const num = (v) => { if (v === "" || v == null) return null; const n = parseFloat(v); return Number.isNaN(n) ? null : n; };
const rating = (v) => (Number.isInteger(v) && v >= 1 && v <= 10 ? v : null);

export const WORKOUT_STATUSES = ["completed", "rest", "missed"];
export const DIET_STATUSES = ["On track", "Mostly clean", "Struggled", "Off plan"];

export function buildDailyCheckinEntry({ form, clientId, date, submittedDate }) {
  return {
    client_id: clientId, date, submitted_date: submittedDate,
    weight: num(form.weight), calories: num(form.calories), protein_g: num(form.protein_g), carbs_g: num(form.carbs_g),
    fats_g: num(form.fats_g), water: num(form.water), sleep_hours: num(form.sleep_hours),
    energy: rating(form.energy), mood: rating(form.mood), steps: num(form.steps),
    diet: DIET_STATUSES.includes(form.diet) ? form.diet : null,
    workout: WORKOUT_STATUSES.includes(form.workout) ? form.workout : null,
  };
}

// True when the client has not answered anything at all.
export function isEmptyCheckin(entry) {
  const keys = ["weight", "calories", "protein_g", "carbs_g", "fats_g", "water", "sleep_hours", "energy", "mood", "steps", "diet", "workout"];
  return keys.every((k) => entry[k] == null);
}
