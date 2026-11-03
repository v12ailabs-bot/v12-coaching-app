// Turns a program's chosen progression model into a starting progression method +
// config for each exercise, so a freshly approved program shows up in Workout Review
// already set up instead of "None assigned". Pure (no I/O).
//
// Only what can be derived from the exercise's own prescription is seeded:
//   double_progression -> a rep RANGE ("8-12") + sets on a loaded, straight-set exercise
//   apre               -> a main lift whose rep target is exactly 3, 6 or 10 (the published variants)
// Everything else (percentage-based needs a verified 1RM, conjugate needs a role/lift/wave,
// density/taper are plan-level) is reported as skipped so the coach sets it, never guessed.

const NON_LOADED_SECTIONS = new Set(["warm-up", "activation", "cooldown", "conditioning", "finisher", "power/plyometrics"]);
const APRE_REPS = new Set([3, 6, 10]);

export function parseRepTarget(reps) {
  const s = String(reps ?? "").trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s*(reps?|rm)\s*$/, "");
  let m = s.match(/^(\d{1,3})\s*(?:-|to)\s*(\d{1,3})$/);
  if (m) { const min = Number(m[1]), max = Number(m[2]); return min >= 1 && max >= min ? { min, max } : null; }
  m = s.match(/^(\d{1,3})$/);
  return m && Number(m[1]) >= 1 ? { fixed: Number(m[1]) } : null;
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
  if ((exercise.block_type || "straight_set") !== "straight_set") return { skip: "Superset/circuit blocks are set up by the coach." };
  const sets = Number(exercise.sets);
  if (!Number.isInteger(sets) || sets < 1) return { skip: "No set count." };
  const target = parseRepTarget(exercise.reps);
  const equipment = guessEquipment(exercise.name);

  if (modelKey === "double_progression") {
    if (!target?.max || target.min == null) return { skip: "Needs a rep range (e.g. 8-12) for double progression." };
    return { method: "double_progression", config: { repMin: target.min, repMax: target.max, requiredSets: sets, equipment } };
  }
  if (modelKey === "apre") {
    if (type !== "compound") return { skip: "APRE is seeded on main compound lifts only." };
    if (!target?.fixed || !APRE_REPS.has(target.fixed)) return { skip: "APRE needs a 3, 6 or 10 rep target." };
    return { method: `apre_${target.fixed}`, config: { stepMode: "low", equipment } };
  }
  return { skip: "This model needs coach setup (it can't be derived from the exercise alone)." };
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
