import { test } from "node:test";
import assert from "node:assert/strict";
import { trailingAverage, linregressSlope, computePrimaryProgress, computeGoalScore } from "../../src/lib/scoring/goalScoring.js";

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const asDate = (dateStr) => new Date(dateStr + "T00:00:00Z");

test("trailingAverage: averages only points inside the window, null when empty", () => {
  const today = asDate("2026-02-01");
  assert.equal(trailingAverage([{ date: "2026-01-01", value: 100 }], today, 7), null, "outside window -> null");
  assert.equal(trailingAverage([{ date: "2026-01-30", value: 100 }, { date: "2026-01-31", value: 102 }], today, 7), 101);
  assert.equal(trailingAverage([], today, 7), null);
});

test("linregressSlope: two points reduce to the plain slope; single point -> null", () => {
  assert.equal(linregressSlope([{ date: "2026-01-01", value: 100 }]), null);
  const slope = linregressSlope([{ date: "2026-01-01", value: 100 }, { date: "2026-01-11", value: 110 }]);
  assert.ok(Math.abs(slope - 1) < 1e-9, "10 units over 10 days = 1/day");
});

test("Gathering Data: fewer than 7 days since baseline, regardless of series", () => {
  const goal = { direction: "decrease", baseline_value: 200, baseline_date: "2026-01-01", target_value: 180, target_date: addDays("2026-01-01", 90) };
  const r = computePrimaryProgress(goal, [{ date: "2026-01-02", value: 199 }], asDate("2026-01-03"));
  assert.equal(r.score, null);
  assert.equal(r.classification, "Gathering Data");
});

test("Gathering Data: 30+ days in but no recent logging (stale series)", () => {
  const goal = { direction: "decrease", baseline_value: 200, baseline_date: "2026-01-01", target_value: 180, target_date: addDays("2026-01-01", 90) };
  const r = computePrimaryProgress(goal, [{ date: "2026-01-01", value: 200 }], asDate("2026-02-01"));
  assert.equal(r.score, null, "no data in the trailing window -> null, not a fabricated score");
  assert.equal(r.classification, "Gathering Data");
});

test("On Track: ahead of the required pace, ETA computed from trailing velocity", () => {
  const baseline_date = "2026-01-01";
  const target_date = addDays(baseline_date, 90);
  const today = asDate(addDays(baseline_date, 45));
  const goal = { direction: "decrease", baseline_value: 200, baseline_date, target_value: 180, target_date };
  const series = [
    { date: addDays(baseline_date, 25), value: 194 }, // today-20
    { date: addDays(baseline_date, 43), value: 188 }, // today-2, inside 7d window
  ];
  const r = computePrimaryProgress(goal, series, today);
  // expectedDelta = -10 (halfway to -20), actualDelta = -12 -> ahead of pace
  assert.ok(Math.abs(r.progressRatio - 1.2) < 1e-9);
  assert.equal(r.score, 100, "clamped at 100 even though ratio > 1");
  assert.equal(r.classification, "On Track");
  assert.ok(r.etaDate, "velocity moves toward target -> a real ETA is reported");
});

test("Off Track: velocity moving the wrong direction overrides everything else", () => {
  const baseline_date = "2026-01-01";
  const target_date = addDays(baseline_date, 90);
  const today = asDate(addDays(baseline_date, 45));
  const goal = { direction: "decrease", baseline_value: 200, baseline_date, target_value: 180, target_date };
  const series = [
    { date: addDays(baseline_date, 25), value: 194 },
    { date: addDays(baseline_date, 43), value: 198 }, // trending UP against a fat-loss goal
  ];
  const r = computePrimaryProgress(goal, series, today);
  assert.equal(r.classification, "Off Track");
  assert.equal(r.etaDate, null, "never fabricate a date when the trend is working against the goal");
});

test("maintain-type goal: scores by tolerance band, not progress ratio", () => {
  const baseline_date = "2026-01-01";
  const target_date = addDays(baseline_date, 90);
  const today = asDate(addDays(baseline_date, 45));
  const goal = { direction: "maintain", baseline_value: 100, baseline_date, target_value: 100, target_date };

  const onTarget = computePrimaryProgress(goal, [{ date: addDays(baseline_date, 43), value: 100 }], today);
  assert.equal(onTarget.score, 100);
  assert.equal(onTarget.classification, "On Track");
  assert.equal(onTarget.progressRatio, null, "progress ratio isn't meaningful for maintenance goals");

  const driftedFar = computePrimaryProgress(goal, [{ date: addDays(baseline_date, 43), value: 104 }], today);
  // tolerance = 2% of 100 = 2; deviation = 4 -> score clamps to 0
  assert.equal(driftedFar.score, 0);
  assert.equal(driftedFar.classification, "Off Track");
});

test("computeGoalScore: missing components renormalize instead of counting as 0", () => {
  const baseline_date = "2026-01-01";
  const target_date = addDays(baseline_date, 90);
  const today = asDate(addDays(baseline_date, 45));
  const goal = { direction: "maintain", baseline_value: 100, baseline_date, target_value: 100, target_date };
  const series = [{ date: addDays(baseline_date, 43), value: 100 }]; // score 100

  const onlyNutrition = computeGoalScore(goal, series, { nutrition: 80 }, today);
  // weightSum = 0.4 + 0.2 = 0.6; weighted = 0.4*100 + 0.2*80 = 56 -> 56/0.6 = 93.33 -> 93
  assert.equal(onlyNutrition.overallScore, 93);
  assert.deepEqual(onlyNutrition.components, { nutrition: 80, training: null, recovery: null, habit: null },
    "missing components are echoed back as null, not just dropped from the object");

  const allComponents = computeGoalScore(goal, series, { nutrition: 80, training: 70, recovery: 60, habit: 50 }, today);
  // weightSum = 1.0; weighted = 40+16+10.5+6+7.5 = 80
  assert.equal(allComponents.overallScore, 80);
  assert.deepEqual(allComponents.components, { nutrition: 80, training: 70, recovery: 60, habit: 50 });
});

test("computeGoalScore: no primary data -> overallScore is null even with components present", () => {
  const goal = { direction: "decrease", baseline_value: 200, baseline_date: "2026-01-01", target_value: 180, target_date: addDays("2026-01-01", 90) };
  const r = computeGoalScore(goal, [], { nutrition: 90, training: 90 }, asDate("2026-01-03"));
  assert.equal(r.overallScore, null);
  assert.equal(r.classification, "Gathering Data");
  assert.deepEqual(r.components, { nutrition: 90, training: 90, recovery: null, habit: null },
    "components are still echoed back even on the early-return no-data path");
});
