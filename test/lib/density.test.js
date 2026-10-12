import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDensity, parseDuration, sessionRounds, pickSessions } from "../../src/lib/progression/density.js";
import { evaluateProgression } from "../../src/lib/progression/methods.js";

const D1 = "2026-10-01", D2 = "2026-10-08", D3 = "2026-10-15";
const rows = (date, reps, extra = {}) => reps.map((r, i) => ({ date, sets: i + 1, reps: r, ...extra }));
const timed = (date, reps, times, extra = {}) => reps.map((r, i) => ({ date, sets: i + 1, reps: r, time: times[i], ...extra }));

const FT = { mode: "fixed_time", unit: "reps", timeCapSec: 600, minImprovement: 5, increment: 2, maxTarget: 60 };
const FW = { mode: "fixed_work", unit: "reps", workAmount: 50, minImprovementSec: 30, timeStepSec: 15 };
const FI = { mode: "fixed_interval", unit: "reps", workSec: 40, restSec: 20, rounds: 4, minImprovement: 3, increment: 2, maxTarget: 100 };
const ev = (config, rs, over = {}) => evaluateDensity({ config, rows: rs, ...over });

test("parseDuration reads the formats the log screen allows and rejects the rest", () => {
  assert.equal(parseDuration("90"), 90); assert.equal(parseDuration(90), 90); assert.equal(parseDuration("1:30"), 90);
  assert.equal(parseDuration("45s"), 45); assert.equal(parseDuration("2m"), 120); assert.equal(parseDuration("2min"), 120);
  assert.equal(parseDuration("1:02:03"), 3723);
  for (const bad of ["", null, undefined, "abc", "0", 0, -5, "1:75", "-1:00"]) assert.equal(parseDuration(bad), null, String(bad));
});

// ---------------------------------------------------------------- fixed time
test("fixed_time: more reps in the same cap is progress; density numbers are correct", () => {
  const r = ev(FT, [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [12, 12, 11, 11])]);
  assert.equal(r.status, "progress");
  assert.equal(r.baseline.work, 40); assert.equal(r.current.work, 46);
  assert.equal(r.baseline.timeSec, 600);
  assert.equal(r.baseline.density, 4);       // 40 reps / 10 min
  assert.equal(r.current.density, 4.6);
  assert.equal(r.comparison.delta, 6);
  assert.deepEqual([r.proposedAdjustment.type, r.proposedAdjustment.from, r.proposedAdjustment.to], ["increase_target_work", 40, 48]);
  assert.deepEqual(r.proposedAdjustment.configPatch, { targetWork: 48 });
  assert.equal(r.eligible, true);
  assert.ok(r.reasons.length >= 3);
});

test("fixed_time: improvement below your minImprovement holds; maxTarget caps the target", () => {
  const small = ev(FT, [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [10, 10, 10, 12])]);
  assert.equal(small.status, "hold"); assert.equal(small.proposedAdjustment, null); assert.match(small.reasons.join(" "), /Not enough more output/);
  const capped = ev({ ...FT, maxTarget: 46 }, [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [12, 12, 11, 11])]);
  assert.equal(capped.status, "hold"); assert.match(capped.reasons.join(" "), /maximum target/);
});

test("work units: rounds, volume_load and reps_at_load are separate, and load is never silently changed", () => {
  const rd = ev({ ...FT, unit: "rounds", repsPerRound: 10, minImprovement: 1, increment: 1, maxTarget: 100 }, [...rows(D1, [10, 10, 9, 10]), ...rows(D2, [10, 10, 10, 10])]);
  assert.equal(rd.baseline.work, 3); assert.equal(rd.current.work, 4); assert.equal(rd.status, "progress");
  const vl = ev({ ...FT, unit: "volume_load", minImprovement: 100, increment: 50, maxTarget: 100000 }, [...rows(D1, [10, 10], { weight: 100 }), ...rows(D2, [10, 10], { weight: 100 }).map((r) => ({ ...r, reps: 12 }))]);
  assert.equal(vl.baseline.work, 2000); assert.equal(vl.current.work, 2400); assert.equal(vl.status, "progress");
  const off = ev({ ...FT, unit: "reps_at_load", load: 100 }, [...rows(D1, [10, 10], { weight: 100 }), ...rows(D2, [10, 10], { weight: 105 })]);
  assert.equal(off.status, "non_comparable"); assert.match(off.missing.join(" "), /prescribed load/);
  const loadChange = ev(FT, [...rows(D1, [10, 10], { weight: 100 }), ...rows(D2, [12, 12], { weight: 110 })]);
  assert.equal(loadChange.status, "non_comparable"); assert.match(loadChange.missing.join(" "), /Loads differ/);
});

test("fixed_time: round times that exceed the cap make it an invalid same-cap session (held)", () => {
  const r = ev(FT, [...rows(D1, [10, 10]), ...timed(D2, [12, 12], ["6:00", "5:00"])]);
  assert.equal(r.status, "hold"); assert.match(r.reasons.join(" "), /past the 600s cap/);
});

// ----------------------------------------------------------------- fixed work
test("fixed_work: the same work faster is progress and only the target TIME moves", () => {
  const r = ev(FW, [...timed(D1, [10, 10, 10, 10, 10], ["2:24", "2:24", "2:24", "2:24", "2:24"]), ...timed(D2, [10, 10, 10, 10, 10], ["2:12", "2:12", "2:12", "2:12", "2:12"])]);
  assert.equal(r.status, "progress");
  assert.equal(r.baseline.timeSec, 720); assert.equal(r.current.timeSec, 660);
  assert.equal(r.comparison.improvedBy, 60);
  assert.equal(r.proposedAdjustment.type, "reduce_target_time");
  assert.equal(r.proposedAdjustment.to, 645);
  assert.ok(Math.abs(r.current.density - 50 / 11) < 1e-9);
});

test("fixed_work: slower is a regression (recorded, no adjustment, no deload); minTimeSec limits the target", () => {
  const slow = ev(FW, [...timed(D1, [10, 10, 10, 10, 10], Array(5).fill("2:00")), ...timed(D2, [10, 10, 10, 10, 10], Array(5).fill("2:10"))]);
  assert.equal(slow.status, "regression"); assert.equal(slow.proposedAdjustment, null); assert.equal(slow.coachReviewFlag, false);
  assert.match(slow.reasons.join(" "), /nothing is reduced automatically/);
  const lim = ev({ ...FW, minTimeSec: 660 }, [...timed(D1, [10, 10, 10, 10, 10], Array(5).fill("2:24")), ...timed(D2, [10, 10, 10, 10, 10], Array(5).fill("2:12"))]);
  assert.equal(lim.status, "hold"); assert.match(lim.reasons.join(" "), /minimum target time/);
});

test("fixed_work: missing round times, incomplete work and a changed amount are never counted as success", () => {
  const noTime = ev(FW, [...timed(D1, [10, 10, 10, 10, 10], Array(5).fill("2:24")), ...rows(D2, [10, 10, 10, 10, 10])]);
  assert.equal(noTime.status, "insufficient_data"); assert.match(noTime.missing.join(" "), /logged time/);
  const noReps = ev(FW, [...timed(D1, [10, 10, 10, 10, 10], Array(5).fill("2:24")), ...timed(D2, [10, 10, 10, null, 10], Array(5).fill("2:00"))]);
  assert.equal(noReps.status, "insufficient_data"); assert.match(noReps.missing.join(" "), /reps are missing/);
  const diff = ev(FW, [...timed(D1, [10, 10, 10, 10, 10], Array(5).fill("2:24")), ...timed(D2, [10, 10, 10, 10, 8], Array(5).fill("2:00"))]);
  assert.equal(diff.status, "non_comparable"); assert.match(diff.missing.join(" "), /prescribed work is 50/);
});

test("fixed_work: prescribed rest is never rewarded when shortened; unverifiable rest is incomplete; the last round has no rest", () => {
  const cfg = { ...FW, restSec: 60 };
  const mk = (date, t, rest) => timed(date, [10, 10, 10, 10, 10], Array(5).fill(t)).map((r, i) => ({ ...r, rest: rest[i] }));
  const ok = ev(cfg, [...mk(D1, "2:24", ["60", "60", "60", "60", null]), ...mk(D2, "2:12", ["60", "75", "60", "60", null])]);
  assert.equal(ok.status, "progress");
  const short = ev(cfg, [...mk(D1, "2:24", ["60", "60", "60", "60", null]), ...mk(D2, "2:12", ["60", "45", "60", "60", null])]);
  assert.equal(short.status, "hold"); assert.match(short.reasons.join(" "), /rest was shorter than the prescribed 60s/);
  const none = ev(cfg, [...mk(D1, "2:24", ["60", "60", "60", "60", null]), ...mk(D2, "2:12", [null, null, null, null, null])]);
  assert.equal(none.status, "insufficient_data"); assert.match(none.missing.join(" "), /rest was not logged/);
});

// -------------------------------------------------------------- fixed interval
test("fixed_interval: more output across the same intervals is progress; rounds must match the prescription", () => {
  const mk = (date, reps) => reps.map((r, i) => ({ date, sets: i + 1, reps: r, rest: i < reps.length - 1 ? "20" : null }));
  const p = ev(FI, [...mk(D1, [10, 10, 9, 9]), ...mk(D2, [11, 11, 10, 10])]);
  assert.equal(p.status, "progress"); assert.equal(p.baseline.timeSec, 240); assert.equal(p.proposedAdjustment.type, "increase_target_output"); assert.equal(p.proposedAdjustment.to, 44);
  const rounds = ev(FI, [...mk(D1, [10, 10, 9, 9]), ...mk(D2, [11, 11, 10])]);
  assert.equal(rounds.status, "non_comparable"); assert.match(rounds.missing.join(" "), /Rounds differ|prescription is 4/);
  const shortRest = ev(FI, [...mk(D1, [10, 10, 9, 9]), ...mk(D2, [11, 11, 10, 10]).map((r, i) => ({ ...r, rest: i === 1 ? "10" : r.rest }))]);
  assert.equal(shortRest.status, "hold"); assert.match(shortRest.reasons.join(" "), /shorter than the prescribed 20s/);
});

// ------------------------------------------------------------------ data rules
test("warm-up rows are excluded unless includeWarmup is set", () => {
  const withWarm = [...rows(D1, [10, 10, 10, 10]), { date: D1, sets: 0, reps: 30, set_type: "warmup" }, ...rows(D2, [12, 12, 11, 11])];
  assert.equal(ev(FT, withWarm).baseline.work, 40);
  assert.equal(ev({ ...FT, includeWarmup: true }, withWarm).baseline.work, 70);
});

test("invalid reps, loads, durations and config are rejected, never coerced", () => {
  for (const bad of [{ reps: -1 }, { reps: 2.5 }, { reps: 10, weight: -5 }, { reps: 10, time: "soon" }, { reps: 10, rest: "x" }]) {
    const r = ev(FT, [...rows(D1, [10, 10]), { date: D2, sets: 1, ...bad }, { date: D2, sets: 2, reps: 10 }]);
    assert.equal(r.status, "invalid", JSON.stringify(bad));
  }
  assert.equal(ev({ ...FT, minImprovement: undefined }, []).status, "invalid", "a missing threshold is never defaulted");
  assert.equal(ev({ ...FT, mode: "chaos" }, []).status, "invalid");
  assert.equal(ev({ ...FT, unit: "furlongs" }, []).status, "invalid");
  assert.equal(ev({ ...FT, unit: "rounds" }, []).status, "invalid", "rounds needs repsPerRound");
  assert.equal(ev({ ...FT, regressionFlagAfter: 1 }, []).status, "invalid");
  assert.equal(ev({ ...FT, increment: 0 }, []).status, "invalid");
});

test("not enough sessions -> incomplete; baseline selection honours baselineDate and effectiveFrom", () => {
  assert.equal(ev(FT, []).status, "insufficient_data");
  assert.equal(ev(FT, rows(D1, [10, 10])).status, "insufficient_data");
  const three = [...rows(D1, [10, 10]), ...rows(D2, [12, 12]), ...rows(D3, [15, 15])];
  assert.equal(pickSessions(three, FT).baseline.date, D2, "default baseline = the session before the current one");
  assert.equal(pickSessions(three, { ...FT, baselineDate: D1 }).baseline.date, D1);
  assert.equal(ev(FT, three, {}).current.date, D3);
  assert.equal(ev({ ...FT, baselineDate: "2026-09-01" }, three).status, "insufficient_data");
  const changed = ev({ ...FT, effectiveFrom: D2 }, three);
  assert.equal(changed.baseline.date, D2, "sessions before the prescription changed never count");
  assert.equal(ev({ ...FT, effectiveFrom: D3 }, three).status, "insufficient_data");
});

// ------------------------------------------------------- eligibility criteria
test("technique: required -> unknown is incomplete, false holds with the reason, true allows progress", () => {
  const cfg = { ...FT, technique: { required: true } }, data = [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [12, 12, 11, 11])];
  assert.equal(ev(cfg, data).status, "insufficient_data");
  const f = ev(cfg, data, { techniqueConfirmed: false }); assert.equal(f.status, "hold"); assert.match(f.reasons.join(" "), /Technique was not confirmed/); assert.equal(f.eligible, false);
  assert.equal(ev(cfg, data, { techniqueConfirmed: true }).status, "progress");
});

test("pain holds progression; a required pain check that wasn't answered is incomplete", () => {
  const data = [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [12, 12, 11, 11])];
  const p = ev(FT, data, { painReported: true }); assert.equal(p.status, "hold"); assert.match(p.reasons.join(" "), /Pain was reported/);
  assert.equal(ev(FT, data, { painReported: false }).status, "progress");
  assert.equal(ev({ ...FT, requirePainCheck: true }, data).status, "insufficient_data");
});

test("effort constraints (RIR cap, required values) and readiness thresholds are honoured", () => {
  const data = (rir) => [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [12, 12, 11, 11]).map((r, i) => ({ ...r, rir: rir[i] }))];
  const cfg = { ...FT, effort: { metric: "rir", required: true, max: 2 } };
  assert.equal(ev(cfg, data([1, 1, 2, 2])).status, "progress");
  const over = ev(cfg, data([1, 4, 2, 2])); assert.equal(over.status, "hold"); assert.match(over.reasons.join(" "), /RIR was above 2/);
  assert.equal(ev(cfg, data([1, 1, null, 2])).status, "insufficient_data");
  const rd = { ...FT, readiness: { field: "energy", min: 6 } }, d = data([null, null, null, null]);
  assert.equal(ev(rd, d, { readiness: { energy: 4 } }).status, "hold");
  assert.equal(ev(rd, d, { readiness: { energy: 8 } }).status, "progress");
  assert.equal(ev(rd, d).status, "progress", "no reading and not required: not assumed bad");
  assert.equal(ev({ ...rd, readiness: { ...rd.readiness, required: true } }, d).status, "insufficient_data");
});

// ------------------------------------------------------------------ regression
test("one regression is recorded, never a deload; a flag needs YOUR configured rule", () => {
  const reg = [...rows(D1, [12, 12, 12, 12]), ...rows(D2, [10, 10, 10, 10])];
  const one = ev({ ...FT, regressionFlagAfter: 2 }, reg);
  assert.equal(one.status, "regression"); assert.equal(one.proposedAdjustment, null); assert.equal(one.coachReviewFlag, false); assert.equal(one.calc.consecutiveRegressions, 1);
  const two = ev({ ...FT, regressionFlagAfter: 2 }, reg, { history: ["regression", "progress"] });
  assert.equal(two.coachReviewFlag, true); assert.equal(two.calc.consecutiveRegressions, 2); assert.match(two.reasons.join(" "), /Flagged for coach review/);
  assert.equal(ev(FT, reg, { history: ["regression", "regression", "regression"] }).coachReviewFlag, false, "no rule configured -> no flag");
  const broken = ev({ ...FT, regressionFlagAfter: 3 }, reg, { history: ["regression", "hold", "regression"] });
  assert.equal(broken.coachReviewFlag, false, "the run was broken by a non-regression");
  const tol = ev({ ...FT, regressionTolerance: 3 }, [...rows(D1, [12, 12, 12, 12]), ...rows(D2, [12, 12, 12, 10])]);
  assert.equal(tol.status, "hold", "a dip within your tolerance isn't a regression");
});

test("every evaluated result carries baseline, current, comparison, eligibility, adjustment and reasons; inputs are not mutated", () => {
  const input = { config: { ...FT }, rows: [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [12, 12, 11, 11])] };
  const snap = JSON.stringify(input);
  const r = evaluateDensity(input);
  for (const k of ["baseline", "current", "comparison", "eligible", "proposedAdjustment", "reasons"]) assert.ok(k in r, k);
  assert.equal(JSON.stringify(input), snap);
  assert.equal(r.recommendedLoad, null, "density never recommends a load change");
  assert.equal(r.calc.nonLoad, true);
});

test("through the registry entry point", () => {
  const r = evaluateProgression("density_progression", { config: FT, allRows: [...rows(D1, [10, 10, 10, 10]), ...rows(D2, [12, 12, 11, 11])] });
  assert.equal(r.status, "progress");
});

test("sessionRounds: a set logged twice keeps the later row", () => {
  const { rounds } = sessionRounds([{ sets: 1, reps: 5 }, { sets: 1, reps: 9 }, { sets: 2, reps: 7 }]);
  assert.deepEqual(rounds.map((r) => r.reps), [9, 7]);
});
