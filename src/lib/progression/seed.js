// Turns a program's chosen progression model into a starting progression method +
// config for each exercise, so a freshly approved program shows up in Workout Review
// already set up instead of "None assigned". Pure (no I/O).
//
// Only what can be derived from the exercise's own prescription is seeded:
//   double_progression -> a rep RANGE ("8-12") + sets on a loaded, straight-set exercise
//   apre               -> a main compound lift; the 3/6/10RM variant is picked from its rep text
// Accessories with a rep range get double progression whatever the model. Percentage-based needs a
// verified 1RM, conjugate a role/lift/wave, density/taper are plan-level: those main lifts are reported
// as skipped so the coach sets them, never guessed.

const NON_LOADED_SECTIONS = new Set(["warm-up", "activation", "cooldown", "conditioning", "finisher", "power/plyometrics"]);
const APRE_REPS = new Set([3, 6, 10]);

export function parseRepTarget(reps) {
  const s = String(reps ?? "").trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s*(reps?|rm)\s*$/, "");
  let m = s.match(/^(\d{1,3})\s*(?:-|to)\s*(\d{1,3})$/);
  if (m) { const min = Number(m[1]), max = Number(m[2]); return min >= 1 && max >= min ? { min, max } : null; }
  m = s.match(/^(\d{1,3})$/);
  return m && Number(m[1]) >= 1 ? { fixed: Number(m[1]) } : null;
}

// APRE comes in 3RM / 6RM / 10RM variants. Real prescriptions are messy ("10-12", "8, 8, AMRAP",
// "Set 1-2: 3 reps, Set 3: AMRAP"), so take the working rep numbers in the text (ignoring AMRAP / sets
// labels) and pick the variant whose band they fall in: <=4 -> 3RM, 5-8 -> 6RM, 9+ -> 10RM.
export function apreVariantFor(reps) {
  const text = String(reps ?? "").toLowerCase().replace(/set\s*\d+(\s*[-–]\s*\d+)?\s*:/g, " ");
  const nums = (text.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= 30);
  if (!nums.length) return null;
  const rep = nums.length >= 2 && /-|–|to/.test(text) && nums.length === 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  return rep <= 4 ? 3 : rep <= 8 ? 6 : 10;
}

// A starting point only — the coach can change it in the Progression panel.
export function guessEquipment(name) {
  const n = String(name || "").toLowerCase();
  if (/dumbbell|\bdb\b/.test(n)) return "dumbbell";
  if (/kettlebell|\bkb\b/.test(n)) return "kettlebell";
  if (/cable|pulldown|pushdown|face pull/.test(n)) return "cable";
  if (/machine|leg press|leg extension|leg curl|hack squat|pec deck|smith/.test(n)) return "machine";
  if (/barbell|\bbb\b|squat|deadlift|bench press|overhead press|\bohp\b|\brdl\b|romanian|hip thrust|good morning|clean|snatch/.test(n)) return "barbell";
  return "other";
}

export function presetFor(exercise, modelKey) {
  if (!modelKey) return { skip: "The program has no progression model." };
  if (exercise.progression_method) return { skip: "Already has a progression method." };
  const section = String(exercise.section || "").trim().toLowerCase();
  const type = String(exercise.exercise_type || "").trim().toLowerCase();
  if (exercise.is_bodyweight) return { skip: "Bodyweight exercise (no load to progress)." };
  if (type === "warmup" || type === "circuit" || NON_LOADED_SECTIONS.has(section)) return { skip: "Not a loaded working exercise." };
  // Each member of a superset progresses on its own load; timed/for-time circuits have no load to progress.
  if (!["straight_set", "superset"].includes(exercise.block_type || "straight_set")) return { skip: "Timed/for-time circuits have no load to progress." };
  const sets = Number(exercise.sets);
  if (!Number.isInteger(sets) || sets < 1) return { skip: "No set count." };
  const target = parseRepTarget(exercise.reps);
  const equipment = guessEquipment(exercise.name);

  const doubleProgression = () => ({ method: "double_progression", config: { repMin: target.min, repMax: target.max, requiredSets: sets, equipment } });
  const hasRange = !!(target?.max && target.min != null);

  // Main compound lifts follow the program's model where it can be derived.
  if (type === "compound" && modelKey === "apre") {
    const n = apreVariantFor(exercise.reps);
    return n ? { method: `apre_${n}`, config: { stepMode: "low", equipment } } : { skip: "Couldn't read a rep target for APRE." };
  }
  if (modelKey === "double_progression" || type === "accessory") {
    return hasRange ? doubleProgression() : { skip: "Needs a rep range (e.g. 8-12) for double progression." };
  }
  return { skip: "This model needs coach setup for main lifts (1RM, role or wave can't be derived from the exercise)." };
}

export function planSeed(exercises, modelKey) {
  const assign = [], skipped = [];
  (exercises || []).forEach((exercise) => {
    const p = presetFor(exercise, modelKey);
    if (p.method) assign.push({ exercise, method: p.method, config: p.config });
    else skipped.push({ exercise, reason: p.skip });
  });
  return { assign, skipped };
}
