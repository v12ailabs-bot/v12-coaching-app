// Deterministic progression engine — pure functions, no Supabase, no DOM, no
// LLM. Every number a recommendation contains comes from here. An AI model
// may later *explain* a result; it never produces one.
//
// Every evaluator returns the same shape:
//   { methodId, status: 'increase'|'hold'|'insufficient_data'|'invalid'|'reference_only'|'prescription',
//     recommendedLoad, reasons: [string], missing: [string], calc: {...inputs echoed + intermediate values} }
// `calc` is what gets stored as the immutable record of how the number was
// reached. Nothing here mutates its inputs.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// Default plate/jump increments by equipment (lb). A starting point for the
// coach, always overridable per exercise via config.increment.
export const DEFAULT_INCREMENT_BY_EQUIPMENT = { barbell: 5, dumbbell: 5, machine: 10, cable: 5, kettlebell: 8, other: 5 };

export function resolveIncrement(config = {}) {
  if (config.increment != null) {
    const n = Number(config.increment);
    return isNum(n) && n > 0 ? n : null; // an explicit but invalid increment is NOT silently replaced
  }
  if (config.equipment && DEFAULT_INCREMENT_BY_EQUIPMENT[config.equipment] != null) return DEFAULT_INCREMENT_BY_EQUIPMENT[config.equipment];
  return null;
}

// Working sets only (warm-ups never count), one entry per set number — if a
// set was logged twice the later row wins. Legacy rows with no set_type are
// working sets. Returns { sets, problems } where problems are data defects.
export function workingSets(rows) {
  const problems = [];
  const bySet = new Map();
  (rows || []).forEach((r, i) => {
    if ((r.set_type || "working") !== "working") return;
    const key = r.sets ?? `row${i}`;
    bySet.set(key, r);
  });
  const sets = [...bySet.values()].map((r) => ({
    setNumber: r.sets ?? null,
    reps: toNum(r.reps),
    load: toNum(r.weight ?? r.load),
    rir: toNum(r.rir),
    rpe: toNum(r.rpe),
  }));
  sets.forEach((s) => {
    if (s.reps !== null && (!Number.isInteger(s.reps) || s.reps < 0)) problems.push(`Set ${s.setNumber ?? "?"} has invalid reps (${s.reps}).`);
    if (s.load !== null && (!isNum(s.load) || s.load < 0)) problems.push(`Set ${s.setNumber ?? "?"} has an invalid load (${s.load}).`);
  });
  return { sets, problems };
}

// Most recent session (date) among logged rows for one exercise.
export function latestSessionRows(rows) {
  const dates = (rows || []).map((r) => r.date).filter(Boolean).sort();
  if (!dates.length) return { date: null, rows: [] };
  const date = dates[dates.length - 1];
  return { date, rows: rows.filter((r) => r.date === date) };
}

const result = (methodId, status, extra = {}) => ({ methodId, status, recommendedLoad: null, reasons: [], missing: [], calc: {}, ...extra });

// Shared validation of the config + the session's sets for load-progression
// methods. Returns a finished result when the data can't be evaluated, else null.
function gate(methodId, config, currentLoad, rows, { needsRepRange }) {
  const calc = { config, currentLoad };
  if (!isNum(currentLoad) || currentLoad <= 0) return result(methodId, "invalid", { reasons: ["Current load must be a positive number."], calc });
  const increment = resolveIncrement(config);
  if (increment === null) return result(methodId, "invalid", { reasons: ["No valid load increment is configured for this exercise (set an increment or equipment)."], calc });
  const requiredSets = Number(config.requiredSets);
  if (!Number.isInteger(requiredSets) || requiredSets < 1) return result(methodId, "invalid", { reasons: ["requiredSets must be a whole number of at least 1."], calc });
  if (needsRepRange) {
    const { repMin, repMax } = config;
    if (!Number.isInteger(repMin) || !Number.isInteger(repMax) || repMin < 1 || repMax < repMin) return result(methodId, "invalid", { reasons: ["The rep range must be whole numbers with repMin <= repMax."], calc });
  } else if (!Number.isInteger(config.targetReps) || config.targetReps < 1) {
    return result(methodId, "invalid", { reasons: ["targetReps must be a whole number of at least 1."], calc });
  }
  const { sets, problems } = workingSets(rows);
  calc.sets = sets; calc.increment = increment;
  if (problems.length) return result(methodId, "invalid", { reasons: problems, calc });
  if (sets.length === 0) return result(methodId, "insufficient_data", { missing: ["No working sets logged for this session."], reasons: ["No working sets were logged, so nothing can be evaluated."], calc });
  const incomplete = sets.filter((s) => s.reps === null || s.load === null);
  if (incomplete.length) return result(methodId, "insufficient_data", { missing: incomplete.map((s) => `Set ${s.setNumber ?? "?"}: reps and load are both required.`), reasons: ["One or more working sets are missing reps or load."], calc });
  if (sets.length < requiredSets) return result(methodId, "insufficient_data", { missing: [`Only ${sets.length} of ${requiredSets} required working sets were logged.`], reasons: ["The workout is incomplete."], calc });
  return null;
}

// Optional effort criteria: config.effort = { metric: 'rir'|'rpe', required: bool, max?: number, min?: number }.
// RIR: lower = harder, so for RIR the "max" is the most reps-in-reserve allowed
// (e.g. progress only if every set was at RIR <= 2). For RPE the "max" is the
// highest effort allowed (RPE <= 9 means don't progress off grinders), the
// same field meaning: the set must be <= max.
function effortCheck(config, sets) {
  const e = config.effort;
  if (!e || !e.metric) return { ok: true, missing: [], reasons: [] };
  if (e.metric !== "rir" && e.metric !== "rpe") return { ok: false, invalid: true, missing: [], reasons: [`Unknown effort metric "${e.metric}".`] };
  const vals = sets.map((s) => s[e.metric]);
  const absent = sets.filter((s) => s[e.metric] === null);
  if (e.required && absent.length) return { ok: false, missing: absent.map((s) => `Set ${s.setNumber ?? "?"}: ${e.metric.toUpperCase()} is required by this exercise's progression rule.`), reasons: [`${e.metric.toUpperCase()} is required but missing on ${absent.length} set(s).`] };
  if (e.max != null) {
    // Sets without a value can't be verified against the cap.
    if (absent.length) return { ok: false, missing: absent.map((s) => `Set ${s.setNumber ?? "?"}: ${e.metric.toUpperCase()} needed to check the ${e.metric.toUpperCase()} <= ${e.max} rule.`), reasons: [`Cannot verify ${e.metric.toUpperCase()} <= ${e.max} without a value on every set.`] };
    const over = sets.filter((s) => s[e.metric] > e.max);
    if (over.length) return { ok: false, missing: [], reasons: [`${e.metric.toUpperCase()} was above ${e.max} on set(s) ${over.map((s) => s.setNumber ?? "?").join(", ")}.`] };
  }
  if (e.min != null && vals.some((v) => v !== null && v < e.min)) return { ok: false, missing: [], reasons: [`${e.metric.toUpperCase()} was below ${e.min} on at least one set.`] };
  return { ok: true, missing: [], reasons: [] };
}

function techniqueCheck(config, input) {
  if (!config.technique?.required) return { ok: true };
  if (input.techniqueConfirmed === true) return { ok: true };
  return { ok: false, missing: ["Coach technique confirmation is required by this exercise's progression rule."], reasons: ["Awaiting coach confirmation that technique was acceptable."] };
}

// ---- Double progression ----------------------------------------------------
// Rep range [repMin, repMax] at a fixed load. Add the increment only when
// EVERY required working set reached repMax at (at least) the current load and
// the optional effort/technique criteria pass. Otherwise hold, with reasons.
export function evaluateDoubleProgression(input) {
  const { config = {}, currentLoad, sets: rows } = input;
  const methodId = "double_progression";
  const stop = gate(methodId, config, currentLoad, rows, { needsRepRange: true });
  if (stop) return stop;
  const { sets } = workingSets(rows);
  const increment = resolveIncrement(config);
  const calc = { config, currentLoad, increment, sets };

  const eff = effortCheck(config, sets);
  if (eff.invalid) return result(methodId, "invalid", { reasons: eff.reasons, calc });
  if (!eff.ok && eff.missing.length) return result(methodId, "insufficient_data", { missing: eff.missing, reasons: eff.reasons, calc });
  const tech = techniqueCheck(config, input);
  if (!tech.ok) return result(methodId, "insufficient_data", { missing: tech.missing, reasons: tech.reasons, calc });

  const reasons = [];
  const under = sets.filter((s) => s.load < currentLoad);
  if (under.length) reasons.push(`Set(s) ${under.map((s) => s.setNumber ?? "?").join(", ")} were performed below the prescribed ${currentLoad} load.`);
  const short = sets.filter((s) => s.reps < config.repMax);
  if (short.length) reasons.push(`Set(s) ${short.map((s) => `${s.setNumber ?? "?"} (${s.reps})`).join(", ")} did not reach the top of the ${config.repMin}-${config.repMax} range.`);
  if (!eff.ok) reasons.push(...eff.reasons);
  if (sets.some((s) => s.reps < config.repMin)) reasons.push(`At least one set fell below the bottom of the range (${config.repMin}); consider whether the load is too high.`);

  if (reasons.length) return result(methodId, "hold", { recommendedLoad: currentLoad, reasons, calc });
  return result(methodId, "increase", {
    recommendedLoad: currentLoad + increment,
    reasons: [`All ${sets.length} working sets reached ${config.repMax} reps at ${currentLoad}; add ${increment}.`],
    calc,
  });
}

// ---- Linear progression ------------------------------------------------------
// Fixed prescription (requiredSets x targetReps). Add the increment after a
// session where every working set hit targetReps at the current load.
export function evaluateLinearProgression(input) {
  const { config = {}, currentLoad, sets: rows } = input;
  const methodId = "linear_progression";
  const stop = gate(methodId, config, currentLoad, rows, { needsRepRange: false });
  if (stop) return stop;
  const { sets } = workingSets(rows);
  const increment = resolveIncrement(config);
  const calc = { config, currentLoad, increment, sets };

  const eff = effortCheck(config, sets);
  if (eff.invalid) return result(methodId, "invalid", { reasons: eff.reasons, calc });
  if (!eff.ok && eff.missing.length) return result(methodId, "insufficient_data", { missing: eff.missing, reasons: eff.reasons, calc });
  const tech = techniqueCheck(config, input);
  if (!tech.ok) return result(methodId, "insufficient_data", { missing: tech.missing, reasons: tech.reasons, calc });

  const reasons = [];
  const under = sets.filter((s) => s.load < currentLoad);
  if (under.length) reasons.push(`Set(s) ${under.map((s) => s.setNumber ?? "?").join(", ")} were performed below the prescribed ${currentLoad} load.`);
  const short = sets.filter((s) => s.reps < config.targetReps);
  if (short.length) reasons.push(`Set(s) ${short.map((s) => `${s.setNumber ?? "?"} (${s.reps})`).join(", ")} missed the ${config.targetReps}-rep target.`);
  if (!eff.ok) reasons.push(...eff.reasons);
  if (reasons.length) return result(methodId, "hold", { recommendedLoad: currentLoad, reasons, calc });
  return result(methodId, "increase", { recommendedLoad: currentLoad + increment, reasons: [`Every working set hit ${config.targetReps} reps at ${currentLoad}; add ${increment}.`], calc });
}

// ---- Percentage-based --------------------------------------------------------
// A prescription, not a performance evaluation: load = percent x a VERIFIED
// 1RM, rounded to the loadable increment. Needs a 1RM the coach supplies or
// confirms — never estimated here. config.weeklyPercents (e.g. [70,72.5,75])
// plus `week` picks the week's percent; or pass config.percent directly.
export function evaluatePercentageBased(input) {
  const { config = {}, oneRepMax, week } = input;
  const methodId = "percentage_based";
  const calc = { config, oneRepMax, week };
  if (!isNum(oneRepMax) || oneRepMax <= 0) return result(methodId, "insufficient_data", { missing: ["A verified, positive 1RM is required (this engine does not estimate one)."], reasons: ["No usable 1RM."], calc });
  const increment = resolveIncrement(config);
  if (increment === null) return result(methodId, "invalid", { reasons: ["No valid loadable increment is configured."], calc });
  let percent = config.percent;
  if (config.weeklyPercents) {
    if (!Array.isArray(config.weeklyPercents) || !Number.isInteger(week) || week < 1 || week > config.weeklyPercents.length) {
      return result(methodId, "invalid", { reasons: [`week must be a whole number from 1 to ${Array.isArray(config.weeklyPercents) ? config.weeklyPercents.length : "?"}.`], calc });
    }
    percent = config.weeklyPercents[week - 1];
  }
  if (!isNum(percent) || percent <= 0 || percent > 100) return result(methodId, "invalid", { reasons: ["The percentage must be a number above 0 and at most 100."], calc });
  const raw = (oneRepMax * percent) / 100;
  const load = Math.round(raw / increment) * increment;
  return result(methodId, "prescription", { recommendedLoad: load, reasons: [`${percent}% of ${oneRepMax} = ${raw.toFixed(2)}, rounded to the nearest ${increment} = ${load}.`], calc: { ...calc, percent, increment, rawLoad: raw } });
}

// ---- Reference-only methods ----------------------------------------------------
// Never produce a number. They report exactly what is missing, from methods.js.
export function evaluateReferenceOnly(methodId, method) {
  return result(methodId, "reference_only", { missing: method?.missing || ["Rules for this method have not been defined."], reasons: ["This method is a coach reference only — the app does not calculate its adjustments."], calc: {} });
}
