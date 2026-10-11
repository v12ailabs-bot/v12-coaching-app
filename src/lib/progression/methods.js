import {
  evaluateDoubleProgression, evaluateLinearProgression, evaluatePercentageBased, evaluateReferenceOnly,
} from "./engine.js";

// Structured progression-method registry. `status`:
//   calculated     — the engine computes a recommendation from logged data
//   reference-only — documented for the coach, but the app never calculates an
//                    adjustment; `missing` lists exactly what must be verified
//                    first (we do not invent tables or thresholds)
//   not-implemented — no structured rules yet
// Ids line up with progression_models.key where one exists (that table's
// free-text `methodology` still steers AI program generation; this registry is
// the executable/structured side and does not replace it).
//
// workedExample.input is run through the real engine in the tests, so these
// examples can't drift from the calculation.

export const METHODS = {
  double_progression: {
    id: "double_progression",
    name: "Double Progression",
    status: "calculated",
    purpose: "Build reps within a fixed range at a constant load, then add load once the whole range is earned on every working set.",
    requiredInputs: ["Prescribed rep range (repMin-repMax)", "Required number of working sets", "Current load", "Reps and load for every working set of the session", "Load increment (per exercise or equipment)"],
    prescriptionParameters: [
      { key: "repMin", type: "int", required: true, note: "Bottom of the range." },
      { key: "repMax", type: "int", required: true, note: "Top of the range; hitting it on every set triggers a load increase." },
      { key: "requiredSets", type: "int", required: true },
      { key: "increment", type: "number", required: false, note: "Overrides the equipment default. An invalid value is rejected, never replaced." },
      { key: "equipment", type: "barbell|dumbbell|machine|cable|kettlebell|other", required: false },
      { key: "effort", type: "{ metric: 'rir'|'rpe', required: bool, max?: number, min?: number }", required: false },
      { key: "technique", type: "{ required: bool }", required: false, note: "When required, the coach must confirm technique before a recommendation is made." },
    ],
    eligibility: "Increase only when every required working set (warm-ups excluded) was logged with reps and load, was performed at or above the current load, reached repMax, and any configured effort/technique criteria pass.",
    rules: [
      "Fewer working sets logged than required -> insufficient data (no recommendation).",
      "Any working set missing reps or load -> insufficient data.",
      "Any set below the current load, or below repMax -> hold the current load with the reason.",
      "All criteria met -> recommended load = current load + increment.",
      "A recommendation is never applied automatically; the coach approves, edits or rejects it.",
    ],
    validation: ["Load > 0", "repMin <= repMax, whole numbers", "Increment > 0 (explicit invalid values are rejected)", "Reps are whole numbers >= 0, loads >= 0"],
    workedExample: {
      description: "3 sets of 8-12 at 100 lb, increment 5. All three sets reach 12.",
      input: { config: { repMin: 8, repMax: 12, requiredSets: 3, increment: 5 }, currentLoad: 100, sets: [
        { sets: 1, reps: 12, weight: 100 }, { sets: 2, reps: 12, weight: 100 }, { sets: 3, reps: 12, weight: 100 },
      ] },
      expected: { status: "increase", recommendedLoad: 105 },
    },
    evaluate: evaluateDoubleProgression,
  },

  linear_progression: {
    id: "linear_progression",
    name: "Linear Progression",
    status: "calculated",
    purpose: "Add a fixed amount of load each session the full prescription (sets x reps) is completed.",
    requiredInputs: ["Required sets", "Target reps per set", "Current load", "Reps and load for every working set", "Load increment"],
    prescriptionParameters: [
      { key: "requiredSets", type: "int", required: true }, { key: "targetReps", type: "int", required: true },
      { key: "increment", type: "number", required: false }, { key: "equipment", type: "string", required: false },
      { key: "effort", type: "{ metric, required, max?, min? }", required: false }, { key: "technique", type: "{ required: bool }", required: false },
    ],
    eligibility: "Increase only when every required working set hit targetReps at or above the current load and optional effort/technique criteria pass.",
    rules: [
      "Incomplete or missing set data -> insufficient data.",
      "Any set short of targetReps or below the current load -> hold, with the reason.",
      "All sets complete -> recommended load = current load + increment.",
      "No deload/reset rule is defined here: repeated misses are surfaced as holds for the coach to act on, not auto-reduced.",
    ],
    validation: ["Load > 0", "targetReps >= 1", "Increment > 0"],
    workedExample: {
      description: "5x5 at 135 lb, increment 5. All five sets hit 5.",
      input: { config: { requiredSets: 5, targetReps: 5, increment: 5 }, currentLoad: 135, sets: [1, 2, 3, 4, 5].map((n) => ({ sets: n, reps: 5, weight: 135 })) },
      expected: { status: "increase", recommendedLoad: 140 },
    },
    evaluate: evaluateLinearProgression,
  },

  percentage_based: {
    id: "percentage_based",
    name: "Percentage-Based Loading",
    status: "calculated",
    purpose: "Prescribe the working load as a percentage of a verified 1RM.",
    requiredInputs: ["A verified 1RM (never estimated by the engine)", "A percentage, or weeklyPercents plus the week number", "Loadable increment for rounding"],
    prescriptionParameters: [
      { key: "percent", type: "number (0-100]", required: false, note: "Use this OR weeklyPercents." },
      { key: "weeklyPercents", type: "number[]", required: false, note: "Per-week percentages, indexed by week (1-based)." },
      { key: "increment / equipment", type: "number|string", required: true, note: "Result is rounded to the nearest loadable increment." },
    ],
    eligibility: "A prescription needs a verified 1RM; it is a plan for the next session, not an evaluation of the last one.",
    rules: ["No usable 1RM -> insufficient data.", "Load = round(1RM x percent / 100 to the nearest increment).", "Week outside weeklyPercents -> invalid."],
    validation: ["1RM > 0", "0 < percent <= 100", "Increment > 0"],
    workedExample: {
      description: "1RM 200 lb, week 2 of [70, 72.5, 75]%, increment 5.",
      input: { config: { weeklyPercents: [70, 72.5, 75], increment: 5 }, oneRepMax: 200, week: 2 },
      expected: { status: "prescription", recommendedLoad: 145 },
    },
    evaluate: evaluatePercentageBased,
  },

  apre_3: apreVariant(3), apre_6: apreVariant(6), apre_10: apreVariant(10),

  density_progression: {
    id: "density_progression",
    name: "Density Progression",
    status: "reference-only",
    purpose: "Hold load and exercise selection constant; progress by completing more work in the same time window or the same work in less time.",
    requiredInputs: [], prescriptionParameters: [], eligibility: "Not defined.", rules: [], validation: [],
    missing: [
      "The fixed time window (or work block) per exercise.",
      "The rule that decides when to add reps vs. shorten rest, and by how much.",
      "The completion threshold that counts as progress.",
    ],
    workedExample: null,
    evaluate: (input) => evaluateReferenceOnly("density_progression", METHODS.density_progression),
  },

  performance_taper: {
    id: "performance_taper",
    name: "Performance Taper",
    status: "reference-only",
    purpose: "Reduce volume while holding or slightly raising intensity into a testing window.",
    requiredInputs: [], prescriptionParameters: [], eligibility: "Not defined.", rules: [], validation: [],
    missing: [
      "Weekly volume reduction (percent or sets) across the taper.",
      "How intensity changes week to week.",
      "The length of the taper and the testing-window criteria.",
    ],
    workedExample: null,
    evaluate: (input) => evaluateReferenceOnly("performance_taper", METHODS.performance_taper),
  },

  conjugate: {
    id: "conjugate",
    name: "Conjugate (Max/Dynamic Effort)",
    status: "not-implemented",
    purpose: "Rotate max-effort and dynamic-effort days.",
    requiredInputs: [], prescriptionParameters: [], eligibility: "Not defined.", rules: [], validation: [],
    missing: ["No structured rules have been defined for this method."],
    workedExample: null,
    evaluate: (input) => evaluateReferenceOnly("conjugate", METHODS.conjugate),
  },
};

function apreVariant(n) {
  const id = `apre_${n}`;
  return {
    id,
    name: `APRE ${n}`,
    status: "reference-only",
    purpose: `Autoregulated progressive resistance exercise, ${n}RM variant: the client's reps on an AMRAP set set the load for the following set and session.`,
    requiredInputs: [], prescriptionParameters: [], eligibility: "Not enabled: the adjustment rules for this variant have not been verified.", rules: [], validation: [],
    missing: [
      `The verified APRE ${n} adjustment table (reps achieved on the AMRAP set -> load change for the next set and for the next session).`,
      `The verified APRE ${n} set structure (number of sets and each set's rep target / percentage of working weight).`,
      "How the baseline working load is established for this variant.",
      "Loadable rounding rules per equipment.",
    ],
    workedExample: null,
    evaluate: () => evaluateReferenceOnly(id, METHODS[id]),
  };
}

export const calculatedMethodIds = () => Object.values(METHODS).filter((m) => m.status === "calculated").map((m) => m.id);

// Single entry point. Unknown method ids are an error, not a silent no-op.
export function evaluateProgression(methodId, input) {
  const method = METHODS[methodId];
  if (!method) return { methodId, status: "invalid", recommendedLoad: null, reasons: [`Unknown progression method "${methodId}".`], missing: [], calc: {} };
  return method.evaluate(input || {});
}
