import { effortCheck } from "./engine.js";

// Density progression — deterministic, no AI. Three separately configured modes:
//   fixed_time     fixed time cap; progress = more QUALITY WORK inside the same cap
//   fixed_work     fixed prescribed work; progress = the same work in LESS TIME
//   fixed_interval fixed work/rest intervals and rounds; progress = more OUTPUT per round
//
// What the app records vs. what this needs (so nothing is assumed):
//  * workout_logs is one row per set/round: reps, weight, `time` (per round),
//    `rest` (per round, grouped blocks only), set_type, rir, rpe.
//  * There is NO per-rep failure/technique flag, so "technique ok" is an explicit
//    coach input (techniqueConfirmed) when config.technique.required — failed or
//    technically invalid reps can't be detected from the logs.
//  * Straight-set sessions have no recorded total time/actual rest: fixed_time
//    uses the prescribed cap as the elapsed time; fixed_work needs logged round
//    times; rest is only checked where rest is prescribed AND logged.
//  * Pain has no field: it is a coach input (painReported).
// Every threshold (minImprovement, increments, limits, tolerances, flag rules)
// is coach-configured; if a required one is missing the config is `invalid`,
// never defaulted.
export const DENSITY_MODES = ["fixed_time", "fixed_work", "fixed_interval"];
export const WORK_UNITS = ["reps", "rounds", "volume_load", "reps_at_load"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// "90", 90, "1:30", "0:45", "1:02:03", "45s", "2m", "2min" -> seconds (>0), else null.
export function parseDuration(v) {
  if (v === null || v === undefined || v === "") return null;
  if (isNum(v)) return v > 0 ? v : null;
  const s = String(v).trim().toLowerCase();
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs)?$/))) return Number(m[1]) > 0 ? Number(m[1]) : null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins)$/))) return Number(m[1]) > 0 ? Number(m[1]) * 60 : null;
  if ((m = s.match(/^(\d+):([0-5]?\d)$/))) { const t = Number(m[1]) * 60 + Number(m[2]); return t > 0 ? t : null; }
  if ((m = s.match(/^(\d+):([0-5]?\d):([0-5]?\d)$/))) { const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); return t > 0 ? t : null; }
  return null;
}

// Group a flat list of workout_logs rows into sessions (by date, newest last).
export function groupSessions(rows) {
  const by = new Map();
  (rows || []).forEach((r) => { if (r.date) (by.get(r.date) || by.set(r.date, []).get(r.date)).push(r); });
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, rs]) => ({ date, rows: rs }));
}

// One session's working rounds. Warm-up rows are excluded unless includeWarmup.
// A set number logged twice keeps the later row. Returns { rounds, problems }.
export function sessionRounds(rows, { includeWarmup = false } = {}) {
  const problems = [];
  const by = new Map();
  (rows || []).forEach((r, i) => {
    if (!includeWarmup && (r.set_type || "working") !== "working") return;
    by.set(r.sets ?? `row${i}`, r);
  });
  const rounds = [...by.entries()].map(([key, r]) => {
    const reps = toNum(r.reps), load = toNum(r.weight ?? r.load);
    if (reps !== null && (!Number.isInteger(reps) || reps < 0)) problems.push(`Round ${key}: invalid reps (${r.reps}).`);
    if (load !== null && (!isNum(load) || load < 0)) problems.push(`Round ${key}: invalid load (${r.weight ?? r.load}).`);
    const timeSec = r.time == null || r.time === "" ? null : parseDuration(r.time);
    if (r.time != null && r.time !== "" && timeSec === null) problems.push(`Round ${key}: time "${r.time}" can't be read as a duration.`);
    const restSec = r.rest == null || r.rest === "" ? null : parseDuration(r.rest);
    if (r.rest != null && r.rest !== "" && restSec === null) problems.push(`Round ${key}: rest "${r.rest}" can't be read as a duration.`);
    return { round: key, reps, load, timeSec, restSec, rir: toNum(r.rir), rpe: toNum(r.rpe), sets: r.sets };
  });
  return { rounds, problems };
}

function validateConfig(config) {
  const errs = [];
  const mode = config.mode;
  if (!DENSITY_MODES.includes(mode)) errs.push(`mode must be one of ${DENSITY_MODES.join(", ")}.`);
  const pos = (k, label = k) => { if (!isNum(config[k]) || config[k] <= 0) errs.push(`${label} must be a positive number.`); };
  if (!WORK_UNITS.includes(config.unit)) errs.push(`unit must be one of ${WORK_UNITS.join(", ")} — the work unit must be stated so sessions are only compared like for like.`);
  if (config.unit === "rounds") pos("repsPerRound", "repsPerRound (a round only counts when this many reps were completed)");
  if (config.unit === "reps_at_load") pos("load", "load (the prescribed load for reps_at_load)");
  if (mode === "fixed_time") { pos("timeCapSec", "timeCapSec"); pos("minImprovement", "minImprovement (work units that count as real progress)"); pos("increment", "increment (work units added to the target)"); }
  if (mode === "fixed_work") { pos("minImprovementSec", "minImprovementSec"); pos("timeStepSec", "timeStepSec (seconds removed from the target time)"); }
  if (mode === "fixed_interval") {
    pos("workSec", "workSec"); pos("restSec", "restSec"); pos("rounds", "rounds");
    pos("minImprovement", "minImprovement (output units that count as real progress)"); pos("increment", "increment");
  }
  if (config.maxTarget != null && (!isNum(config.maxTarget) || config.maxTarget <= 0)) errs.push("maxTarget must be a positive number when set.");
  if (config.minTimeSec != null && (!isNum(config.minTimeSec) || config.minTimeSec <= 0)) errs.push("minTimeSec must be a positive number when set.");
  if (mode === "fixed_work" && config.restSec != null && (!isNum(config.restSec) || config.restSec < 0)) errs.push("restSec must be zero or more.");
  if (config.regressionTolerance != null && (!isNum(config.regressionTolerance) || config.regressionTolerance < 0)) errs.push("regressionTolerance must be zero or more.");
  if (config.regressionFlagAfter != null && (!Number.isInteger(config.regressionFlagAfter) || config.regressionFlagAfter < 2)) errs.push("regressionFlagAfter must be a whole number of at least 2 (one regression never raises a flag).");
  if (config.readiness && (!["energy", "sleep", "mood"].includes(config.readiness.field) || !isNum(config.readiness.min))) errs.push("readiness needs a field (energy, sleep or mood) and a numeric min.");
  return errs;
}

// Completed work for a session in the configured unit. Returns { work, incomplete[], noncomparable[] }.
function workOf(rounds, config) {
  const incomplete = [], nonComparable = [];
  const unit = config.unit;
  if (rounds.length === 0) return { work: null, incomplete: ["No working rounds were logged."], nonComparable };
  const missingReps = rounds.filter((r) => r.reps === null);
  if (missingReps.length) incomplete.push(...missingReps.map((r) => `Round ${r.round}: reps are missing.`));
  if (unit === "volume_load") {
    const noLoad = rounds.filter((r) => r.load === null);
    if (noLoad.length) incomplete.push(...noLoad.map((r) => `Round ${r.round}: load is required to count volume load.`));
  }
  if (unit === "reps_at_load") {
    const off = rounds.filter((r) => r.load !== null && Math.abs(r.load - config.load) > 1e-9);
    const noLoad = rounds.filter((r) => r.load === null);
    if (noLoad.length) incomplete.push(...noLoad.map((r) => `Round ${r.round}: load is required (the prescription is ${config.load}).`));
    if (off.length) nonComparable.push(`Round(s) ${off.map((r) => r.round).join(", ")} were not at the prescribed load ${config.load}; load is never silently changed, so this session can't count.`);
  }
  if (incomplete.length || nonComparable.length) return { work: null, incomplete, nonComparable };
  let work;
  if (unit === "reps" || unit === "reps_at_load") work = rounds.reduce((s, r) => s + r.reps, 0);
  else if (unit === "rounds") work = rounds.filter((r) => r.reps >= config.repsPerRound).length;
  else work = rounds.reduce((s, r) => s + r.reps * r.load, 0);
  return { work, incomplete, nonComparable };
}

function summarize(rounds, config, work) {
  const mode = config.mode;
  let timeSec = null;
  if (mode === "fixed_time") timeSec = config.timeCapSec;
  else if (mode === "fixed_interval") timeSec = config.rounds * (config.workSec + config.restSec);
  else if (rounds.every((r) => r.timeSec !== null)) timeSec = rounds.reduce((s, r) => s + r.timeSec, 0);
  const density = work != null && timeSec ? (work / timeSec) * 60 : null; // work per minute
  return { work, timeSec, density, rounds: rounds.length, loads: [...new Set(rounds.map((r) => r.load))].sort() };
}

// Picks the current (newest) and baseline sessions. Baseline = config.baselineDate
// if set, otherwise the session immediately before the current one. Sessions
// before config.effectiveFrom (when the prescription last changed) never count.
export function pickSessions(allRows, config) {
  const eff = config.effectiveFrom;
  const sessions = groupSessions(allRows).filter((s) => !eff || s.date >= eff);
  if (!sessions.length) return { current: null, baseline: null, reason: eff ? `No sessions on or after the prescription's effective date ${eff}.` : "No logged sessions." };
  const current = sessions[sessions.length - 1];
  let baseline = null;
  if (config.baselineDate) baseline = sessions.find((s) => s.date === config.baselineDate) || null;
  else if (sessions.length > 1) baseline = sessions[sessions.length - 2];
  return { current, baseline, reason: baseline ? null : (config.baselineDate ? `No session logged on the baseline date ${config.baselineDate}.` : "Only one session is logged; a baseline needs an earlier comparable session.") };
}

const res = (status, extra = {}) => ({ methodId: "density_progression", status, recommendedLoad: null, eligible: false, baseline: null, current: null, comparison: null, proposedAdjustment: null, coachReviewFlag: false, reasons: [], missing: [], calc: { nonLoad: true }, ...extra });

// input: { config, rows (all workout_logs rows for the exercise), history: [prior statuses newest first],
//          techniqueConfirmed, painReported, readiness: { energy, sleep, mood } }
export function evaluateDensity(input) {
  const { config = {}, rows = [], history = [], techniqueConfirmed, painReported, readiness } = input;
  const calcBase = { nonLoad: true, config };
  const cfgErrs = validateConfig(config);
  if (cfgErrs.length) return res("invalid", { reasons: cfgErrs, calc: calcBase });
  const includeWarmup = config.includeWarmup === true;

  const { current: cur, baseline: base, reason } = pickSessions(rows, config);
  if (!cur) return res("insufficient_data", { missing: [reason], reasons: ["No session to evaluate."], calc: calcBase });
  const curR = sessionRounds(cur.rows, { includeWarmup });
  if (curR.problems.length) return res("invalid", { reasons: curR.problems, calc: { ...calcBase, currentDate: cur.date } });
  if (!base) return res("insufficient_data", { missing: [reason], reasons: ["A baseline session is required before density can be compared."], calc: { ...calcBase, currentDate: cur.date } });
  const baseR = sessionRounds(base.rows, { includeWarmup });
  if (baseR.problems.length) return res("invalid", { reasons: baseR.problems.map((p) => "Baseline — " + p), calc: { ...calcBase, baselineDate: base.date } });

  const cw = workOf(curR.rounds, config), bw = workOf(baseR.rounds, config);
  const where = { currentDate: cur.date, baselineDate: base.date };
  if (cw.nonComparable.length || bw.nonComparable.length) return res("non_comparable", { reasons: ["The sessions can't be counted together."], missing: [...cw.nonComparable.map((m) => "Current: " + m), ...bw.nonComparable.map((m) => "Baseline: " + m)], calc: { ...calcBase, ...where } });
  if (cw.incomplete.length || bw.incomplete.length) return res("insufficient_data", { reasons: ["The logged data is incomplete."], missing: [...cw.incomplete.map((m) => "Current session — " + m), ...bw.incomplete.map((m) => "Baseline session — " + m)], calc: { ...calcBase, ...where } });

  const current = { date: cur.date, ...summarize(curR.rounds, config, cw.work) };
  const baseline = { date: base.date, ...summarize(baseR.rounds, config, bw.work) };
  const calc = { ...calcBase, ...where, current, baseline };
  const mode = config.mode;

  // Structural comparability (same prescription shape in both sessions).
  const nc = [];
  if (JSON.stringify(current.loads) !== JSON.stringify(baseline.loads)) nc.push(`Loads differ (baseline ${baseline.loads.join("/") || "none"}, current ${current.loads.join("/") || "none"}); load is not changed to make a session look better, so the sessions aren't comparable.`);
  if ((mode === "fixed_work" || mode === "fixed_interval") && current.rounds !== baseline.rounds) nc.push(`Rounds differ (baseline ${baseline.rounds}, current ${current.rounds}).`);
  if (mode === "fixed_interval" && current.rounds !== config.rounds) nc.push(`The prescription is ${config.rounds} rounds but ${current.rounds} were logged.`);
  if (mode === "fixed_work" && config.workAmount != null && (current.work !== config.workAmount || baseline.work !== config.workAmount)) nc.push(`The prescribed work is ${config.workAmount} ${config.unit} but the sessions logged ${baseline.work} and ${current.work}.`);
  if (nc.length) return res("non_comparable", { baseline, current, reasons: ["The sessions don't describe the same work."], missing: nc, calc });

  // Mode-specific completeness / timing / rest.
  const missing = [], holds = [];
  if (mode === "fixed_work") {
    const noTime = [...curR.rounds, ...baseR.rounds].filter((r) => r.timeSec === null);
    if (noTime.length) missing.push("Every round needs a logged time to measure completion time (current and baseline).");
  }
  if (mode === "fixed_time") {
    const over = curR.rounds.reduce((s, r) => s + (r.timeSec || 0), 0);
    if (over > config.timeCapSec) holds.push(`Logged round times add up to ${over}s, past the ${config.timeCapSec}s cap, so this isn't a valid same-cap session.`);
  }
  const restPrescribed = mode === "fixed_interval" ? config.restSec : (mode === "fixed_work" ? config.restSec : null);
  if (restPrescribed != null) {
    const check = (rs, label) => {
      const inner = rs.slice(0, -1); // the last round has no rest after it
      if (inner.some((r) => r.restSec === null)) missing.push(`${label}: actual rest was not logged for every round, so prescribed rest can't be verified.`);
      else if (inner.some((r) => r.restSec < restPrescribed)) holds.push(`${label}: rest was shorter than the prescribed ${restPrescribed}s; shorter rest is never rewarded.`);
    };
    check(curR.rounds, "Current session"); check(baseR.rounds, "Baseline session");
  }
  if (missing.length) return res("insufficient_data", { baseline, current, missing, reasons: ["Not enough logged data to compare these sessions."], calc });

  // Eligibility criteria (technique / pain / effort / readiness).
  if (config.technique?.required) {
    if (techniqueConfirmed === true) { /* ok */ }
    else if (techniqueConfirmed === false) holds.push("Technique was not confirmed as acceptable.");
    else return res("insufficient_data", { baseline, current, missing: ["Coach technique confirmation is required by this exercise's rule."], reasons: ["Technique has not been confirmed."], calc });
  }
  if (painReported === true && config.holdOnPain !== false) holds.push("Pain was reported; progression is held.");
  if (config.requirePainCheck && painReported !== true && painReported !== false) return res("insufficient_data", { baseline, current, missing: ["A pain check (yes/no) is required before progressing."], reasons: ["Pain status unknown."], calc });
  const eff = effortCheck(config, curR.rounds.map((r) => ({ setNumber: r.round, rir: r.rir, rpe: r.rpe })));
  if (eff.invalid) return res("invalid", { baseline, current, reasons: eff.reasons, calc });
  if (!eff.ok && eff.missing.length) return res("insufficient_data", { baseline, current, missing: eff.missing, reasons: eff.reasons, calc });
  if (!eff.ok) holds.push(...eff.reasons);
  if (config.readiness) {
    const v = readiness ? toNum(readiness[config.readiness.field]) : null;
    if (v === null) { if (config.readiness.required) return res("insufficient_data", { baseline, current, missing: [`Readiness (${config.readiness.field}) for the session date is required but not available.`], reasons: ["Readiness is unknown."], calc }); }
    else if (v < config.readiness.min) holds.push(`${config.readiness.field} was ${v}, below the required ${config.readiness.min}.`);
  }

  // Comparison.
  const fmtWork = (w) => `${Math.round(w * 100) / 100} ${config.unit}`;
  const lines = [];
  let delta, better, worse, comparison;
  if (mode === "fixed_work") {
    delta = baseline.timeSec - current.timeSec; // positive = faster
    better = delta >= config.minImprovementSec;
    worse = delta < -(config.regressionTolerance ?? 0);
    comparison = { metric: "completion_time_sec", baseline: baseline.timeSec, current: current.timeSec, delta: -delta, improvedBy: delta, densityBaseline: baseline.density, densityCurrent: current.density };
    lines.push(`Baseline (${baseline.date}): ${fmtWork(baseline.work)} in ${baseline.timeSec}s = ${baseline.density.toFixed(2)}/min.`);
    lines.push(`Current (${current.date}): ${fmtWork(current.work)} in ${current.timeSec}s = ${current.density.toFixed(2)}/min.`);
    lines.push(delta > 0 ? `Same work ${delta}s faster.` : delta < 0 ? `Same work ${-delta}s slower.` : "Same time.");
  } else {
    delta = current.work - baseline.work; // positive = more output
    better = delta >= config.minImprovement;
    worse = delta < -(config.regressionTolerance ?? 0);
    comparison = { metric: "work_in_same_time", baseline: baseline.work, current: current.work, delta, densityBaseline: baseline.density, densityCurrent: current.density };
    lines.push(`Baseline (${baseline.date}): ${fmtWork(baseline.work)} in ${baseline.timeSec}s = ${baseline.density.toFixed(2)}/min.`);
    lines.push(`Current (${current.date}): ${fmtWork(current.work)} in ${current.timeSec}s = ${current.density.toFixed(2)}/min.`);
    lines.push(delta > 0 ? `${fmtWork(delta)} more in the same time.` : delta < 0 ? `${fmtWork(-delta)} less in the same time.` : "No change in output.");
  }

  // Regression handling: record + evaluate; never an automatic deload. A flag only if the coach configured one.
  let consecutive = 0, coachReviewFlag = false;
  if (worse) {
    consecutive = 1; for (const h of history) { if (h === "regression") consecutive++; else break; }
    if (config.regressionFlagAfter && consecutive >= config.regressionFlagAfter) coachReviewFlag = true;
  }
  const calcOut = { ...calc, comparison, consecutiveRegressions: consecutive };
  const base_ = { baseline, current, comparison, coachReviewFlag, calc: calcOut };

  if (worse) {
    const rl = [...lines, `This is a regression${consecutive > 1 ? ` (${consecutive} in a row)` : ""}. It is recorded for review; nothing is reduced automatically.`];
    if (coachReviewFlag) rl.push(`Flagged for coach review: ${consecutive} consecutive regressions (your rule: ${config.regressionFlagAfter}).`);
    return res("regression", { ...base_, eligible: holds.length === 0, reasons: rl, missing: [] });
  }
  if (holds.length) return res("hold", { ...base_, eligible: false, reasons: [...lines, ...holds.map((h) => "Held: " + h)] });
  if (!better) return res("hold", { ...base_, eligible: true, reasons: [...lines, mode === "fixed_work" ? `Not enough faster (needs ${config.minImprovementSec}s) — hold the current target.` : `Not enough more output (needs ${config.minImprovement} ${config.unit}) — hold the current target.`] });

  // Proposed adjustment — only the target the coach's rule moves; load/exercise/range of motion untouched.
  let adj;
  if (mode === "fixed_work") {
    const from = config.targetTimeSec ?? current.timeSec;
    const to = Math.max(from - config.timeStepSec, config.minTimeSec ?? 0);
    if (to >= from) return res("hold", { ...base_, eligible: true, reasons: [...lines, `Already at the minimum target time (${config.minTimeSec}s) — limit reached.`] });
    adj = { type: "reduce_target_time", from, to, step: config.timeStepSec, unit: "sec", configPatch: { targetTimeSec: to } };
  } else {
    const from = config.targetWork ?? baseline.work;
    const to = Math.min(current.work + config.increment, config.maxTarget ?? Infinity);
    if (to <= current.work) return res("hold", { ...base_, eligible: true, reasons: [...lines, `Already at the maximum target (${config.maxTarget}) — limit reached.`] });
    adj = { type: mode === "fixed_interval" ? "increase_target_output" : "increase_target_work", from, to, step: config.increment, unit: config.unit, configPatch: { targetWork: to } };
  }
  return res("progress", { ...base_, eligible: true, proposedAdjustment: adj, reasons: [...lines, `Eligible: ${adj.type.replace(/_/g, " ")} from ${adj.from} to ${adj.to} ${adj.unit}.`] });
}
