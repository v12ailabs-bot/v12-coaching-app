import { test } from "node:test";
import assert from "node:assert/strict";
import { METHODS, evaluateProgression, calculatedMethodIds } from "../../src/lib/progression/methods.js";
import { workingSets, latestSessionRows, resolveIncrement } from "../../src/lib/progression/engine.js";
import { decideRecommendation } from "../../src/lib/progression/decisions.js";
import { topSetPerDay } from "../../src/lib/workoutLogs.js";

const cfg = { repMin: 8, repMax: 12, requiredSets: 3, increment: 5 };
const set = (n, reps, weight, extra = {}) => ({ sets: n, reps, weight, ...extra });
const three = (reps, weight = 100) => [set(1, reps, weight), set(2, reps, weight), set(3, reps, weight)];
const dp = (over = {}) => evaluateProgression("double_progression", { config: cfg, currentLoad: 100, sets: three(12), ...over });

// ---- worked examples can't drift from the engine -------------------------------
test("every method's workedExample reproduces through the real engine", () => {
  for (const m of Object.values(METHODS)) {
    if (!m.workedExample) continue;
    const r = evaluateProgression(m.id, m.workedExample.input);
    assert.equal(r.status, m.workedExample.expected.status, m.id);
    assert.equal(r.recommendedLoad, m.workedExample.expected.recommendedLoad, m.id);
  }
});

// ---- double progression ----------------------------------------------------------
test("double progression: all sets at top of range -> increase by increment", () => {
  const r = dp();
  assert.equal(r.status, "increase");
  assert.equal(r.recommendedLoad, 105);
  assert.deepEqual(r.calc.sets.map((s) => s.reps), [12, 12, 12]);
});

test("one set below the top of the range -> hold with the reason, load unchanged", () => {
  const r = dp({ sets: [set(1, 12, 100), set(2, 12, 100), set(3, 10, 100)] });
  assert.equal(r.status, "hold");
  assert.equal(r.recommendedLoad, 100);
  assert.match(r.reasons.join(" "), /3 \(10\)/);
});

test("a set performed below the prescribed load blocks progression", () => {
  const r = dp({ sets: [set(1, 12, 100), set(2, 12, 95), set(3, 12, 100)] });
  assert.equal(r.status, "hold");
  assert.match(r.reasons.join(" "), /below the prescribed/);
});

test("fewer working sets than required -> insufficient data, not a recommendation", () => {
  const r = dp({ sets: [set(1, 12, 100), set(2, 12, 100)] });
  assert.equal(r.status, "insufficient_data");
  assert.equal(r.recommendedLoad, null);
  assert.match(r.missing.join(" "), /2 of 3/);
});

test("no sets at all -> insufficient data", () => {
  assert.equal(dp({ sets: [] }).status, "insufficient_data");
});

test("a set missing reps or load -> insufficient data naming the set", () => {
  const r = dp({ sets: [set(1, 12, 100), set(2, null, 100), set(3, 12, null)] });
  assert.equal(r.status, "insufficient_data");
  assert.match(r.missing.join(" "), /Set 2/);
  assert.match(r.missing.join(" "), /Set 3/);
});

test("invalid loads and reps are rejected, never coerced", () => {
  assert.equal(dp({ currentLoad: 0 }).status, "invalid");
  assert.equal(dp({ currentLoad: "abc" }).status, "invalid");
  assert.equal(dp({ sets: [set(1, -3, 100), set(2, 12, 100), set(3, 12, 100)] }).status, "invalid");
  assert.equal(dp({ sets: [set(1, 12.5, 100), set(2, 12, 100), set(3, 12, 100)] }).status, "invalid");
  assert.equal(dp({ sets: [set(1, 12, -100), set(2, 12, 100), set(3, 12, 100)] }).status, "invalid");
});

test("invalid config is rejected (bad range, bad sets, bad explicit increment)", () => {
  assert.equal(dp({ config: { ...cfg, repMin: 12, repMax: 8 } }).status, "invalid");
  assert.equal(dp({ config: { ...cfg, requiredSets: 0 } }).status, "invalid");
  assert.equal(dp({ config: { ...cfg, increment: -5 } }).status, "invalid");
  assert.equal(dp({ config: { ...cfg, increment: undefined, equipment: undefined } }).status, "invalid", "no increment and no equipment");
});

test("variable load increments: explicit increment wins; equipment default otherwise; invalid explicit is not replaced", () => {
  assert.equal(dp({ config: { ...cfg, increment: 2.5 } }).recommendedLoad, 102.5);
  assert.equal(dp({ config: { ...cfg, increment: undefined, equipment: "machine" } }).recommendedLoad, 110);
  assert.equal(dp({ config: { ...cfg, increment: undefined, equipment: "dumbbell" } }).recommendedLoad, 105);
  assert.equal(resolveIncrement({ increment: 0, equipment: "barbell" }), null);
});

test("warm-up sets are ignored; legacy rows with no set_type count as working", () => {
  const rows = [set(1, 5, 45, { set_type: "warmup" }), set(1, 12, 100), set(2, 12, 100), set(3, 12, 100)];
  assert.equal(workingSets(rows).sets.length, 3);
  assert.equal(dp({ sets: rows }).status, "increase");
});

test("a set logged twice uses the later row (no double counting)", () => {
  const rows = [set(1, 6, 100), set(1, 12, 100), set(2, 12, 100), set(3, 12, 100)];
  assert.equal(dp({ sets: rows }).status, "increase");
});

// ---- effort / technique criteria ------------------------------------------------
test("RIR required but missing -> insufficient data, not progression", () => {
  const r = dp({ config: { ...cfg, effort: { metric: "rir", required: true } } });
  assert.equal(r.status, "insufficient_data");
  assert.match(r.missing.join(" "), /RIR is required/);
});

test("RIR optional and absent -> evaluated on reps alone", () => {
  assert.equal(dp({ config: { ...cfg, effort: { metric: "rir", required: false } } }).status, "increase");
});

test("RIR cap: progresses only if every set is within the cap", () => {
  const e = { metric: "rir", required: true, max: 2 };
  const ok = [set(1, 12, 100, { rir: 2 }), set(2, 12, 100, { rir: 1 }), set(3, 12, 100, { rir: 0 })];
  assert.equal(dp({ config: { ...cfg, effort: e }, sets: ok }).status, "increase");
  const bad = [set(1, 12, 100, { rir: 4 }), set(2, 12, 100, { rir: 1 }), set(3, 12, 100, { rir: 0 })];
  const r = dp({ config: { ...cfg, effort: e }, sets: bad });
  assert.equal(r.status, "hold");
  assert.match(r.reasons.join(" "), /above 2/);
});

test("RPE cap with a missing value can't be verified -> insufficient data", () => {
  const sets = [set(1, 12, 100, { rpe: 8 }), set(2, 12, 100), set(3, 12, 100, { rpe: 8 })];
  assert.equal(dp({ config: { ...cfg, effort: { metric: "rpe", required: false, max: 9 } }, sets }).status, "insufficient_data");
});

test("unknown effort metric is invalid", () => {
  assert.equal(dp({ config: { ...cfg, effort: { metric: "vibes" } } }).status, "invalid");
});

test("technique required: held until the coach confirms", () => {
  const c = { ...cfg, technique: { required: true } };
  assert.equal(dp({ config: c }).status, "insufficient_data");
  assert.equal(dp({ config: c, techniqueConfirmed: false }).status, "insufficient_data");
  assert.equal(dp({ config: c, techniqueConfirmed: true }).status, "increase");
});

// ---- linear ------------------------------------------------------------------------
test("linear progression: hit every rep -> add increment; any miss -> hold", () => {
  const c = { requiredSets: 3, targetReps: 5, increment: 5 };
  const ok = evaluateProgression("linear_progression", { config: c, currentLoad: 135, sets: three(5, 135) });
  assert.equal(ok.recommendedLoad, 140);
  const miss = evaluateProgression("linear_progression", { config: c, currentLoad: 135, sets: [set(1, 5, 135), set(2, 5, 135), set(3, 4, 135)] });
  assert.equal(miss.status, "hold");
  assert.equal(miss.recommendedLoad, 135);
});

// ---- percentage-based --------------------------------------------------------------
test("percentage-based: rounds to the increment; needs a verified 1RM; validates week and percent", () => {
  const c = { weeklyPercents: [70, 72.5, 75], increment: 5 };
  assert.equal(evaluateProgression("percentage_based", { config: c, oneRepMax: 200, week: 3 }).recommendedLoad, 150);
  assert.equal(evaluateProgression("percentage_based", { config: c, week: 1 }).status, "insufficient_data");
  assert.equal(evaluateProgression("percentage_based", { config: c, oneRepMax: 200, week: 9 }).status, "invalid");
  assert.equal(evaluateProgression("percentage_based", { config: { percent: 120, increment: 5 }, oneRepMax: 200 }).status, "invalid");
  assert.equal(evaluateProgression("percentage_based", { config: { percent: 70 }, oneRepMax: 200 }).status, "invalid", "no increment configured");
});

// ---- reference-only: never a number -------------------------------------------------
test("APRE 3/6/10, density, taper and conjugate are not calculated and say what is missing", () => {
  for (const id of ["apre_3", "apre_6", "apre_10", "density_progression", "performance_taper", "conjugate"]) {
    const r = evaluateProgression(id, { config: cfg, currentLoad: 100, sets: three(12) });
    assert.equal(r.status, "reference_only", id);
    assert.equal(r.recommendedLoad, null, id + " must not produce a load");
    assert.ok(r.missing.length > 0, id);
  }
  for (const id of ["apre_3", "apre_6", "apre_10"]) assert.match(METHODS[id].missing[0], /verified/i);
});

test("only the three verified-rule methods are marked calculated", () => {
  assert.deepEqual(calculatedMethodIds().sort(), ["double_progression", "linear_progression", "percentage_based"]);
});

test("unknown method id is invalid, not a silent success", () => {
  assert.equal(evaluateProgression("nope", {}).status, "invalid");
});

test("evaluating never mutates its inputs", () => {
  const input = { config: { ...cfg }, currentLoad: 100, sets: three(12) };
  const snap = JSON.stringify(input);
  evaluateProgression("double_progression", input);
  assert.equal(JSON.stringify(input), snap);
});

// ---- latest session ----------------------------------------------------------------
test("latestSessionRows picks only the newest date", () => {
  const rows = [{ date: "2026-01-01", sets: 1 }, { date: "2026-01-08", sets: 1 }, { date: "2026-01-08", sets: 2 }];
  const s = latestSessionRows(rows);
  assert.equal(s.date, "2026-01-08");
  assert.equal(s.rows.length, 2);
  assert.deepEqual(latestSessionRows([]), { date: null, rows: [] });
});

// ---- coach decisions / overrides ----------------------------------------------------
const rec = (over = {}) => ({ status: "pending", calc_result: { status: "increase", recommendedLoad: 105 }, ...over });

test("approve keeps the calculated load and records its source", () => {
  const d = decideRecommendation(rec(), { decision: "approve" });
  assert.equal(d.status, "approved");
  assert.deepEqual(d.approvedPrescription, { load: 105, source: "calculated" });
});

test("modify stores the override separately and preserves the original calculation", () => {
  const r = rec();
  const before = JSON.stringify(r);
  const d = decideRecommendation(r, { decision: "modify", modifiedLoad: 102.5, note: "joint tweak" });
  assert.equal(d.status, "modified");
  assert.deepEqual(d.approvedPrescription, { load: 102.5, source: "coach_override", calculatedLoad: 105 });
  assert.equal(d.original, 105);
  assert.equal(JSON.stringify(r), before, "the recommendation object is untouched");
});

test("modify needs a positive load; reject approves nothing; decided/unknown/no-load cases are refused", () => {
  assert.equal(decideRecommendation(rec(), { decision: "modify" }).ok, false);
  assert.equal(decideRecommendation(rec(), { decision: "modify", modifiedLoad: -5 }).ok, false);
  const rj = decideRecommendation(rec(), { decision: "reject" });
  assert.equal(rj.status, "rejected");
  assert.equal(rj.approvedPrescription, null);
  assert.equal(decideRecommendation(rec({ status: "approved" }), { decision: "approve" }).ok, false);
  assert.equal(decideRecommendation(rec(), { decision: "yolo" }).ok, false);
  assert.equal(decideRecommendation(rec({ calc_result: { recommendedLoad: null } }), { decision: "approve" }).ok, false, "can't approve a missing calculation");
  assert.equal(decideRecommendation(null, { decision: "approve" }).ok, false);
});

// ---- existing workout logging is untouched (regression) -------------------------------
test("existing top-set logic still works on rows that gained the new nullable columns", () => {
  const logs = [
    { date: "2026-08-20", weight: 305, reps: 5, set_type: "working", rir: null, rpe: null, prescribed_reps: null },
    { date: "2026-08-20", weight: 325, reps: 3 },
  ];
  assert.equal(topSetPerDay(logs, false)[0].weight, 325);
});
