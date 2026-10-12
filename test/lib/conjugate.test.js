import { test } from "node:test";
import assert from "node:assert/strict";
import { dynamicEffortPrescription, maxEffortReview, evaluateConjugate, weeksSince, DE_WAVES } from "../../src/lib/progression/conjugate.js";
import { evaluateProgression } from "../../src/lib/progression/methods.js";

const day = (y, m, d) => new Date(y, m - 1, d);
// wave starts Monday 2026-10-05
const DE = (over = {}, o = {}) => dynamicEffortPrescription({ config: { role: "dynamic_effort", wave: "westside_lower", waveStartDate: "2026-10-05", increment: 5, ...over }, oneRepMax: 400, today: day(2026, 10, 7), ...o });

test("Westside lower wave: 12x2 / 10x2 / 8x2 at 75/80/85% total = 50/55/60% bar + 25% bands, from the 1RM", () => {
  const w1 = DE(), w2 = DE({}, { today: day(2026, 10, 14) }), w3 = DE({}, { today: day(2026, 10, 21) });
  assert.deepEqual([w1.calc.sets, w1.calc.reps, w1.calc.totalPct, w1.calc.barPct, w1.recommendedLoad, w1.calc.bandLoad], [12, 2, 75, 50, 200, 100]);
  assert.deepEqual([w2.calc.sets, w2.calc.totalPct, w2.calc.barPct, w2.recommendedLoad], [10, 80, 55, 220]);
  assert.deepEqual([w3.calc.sets, w3.calc.totalPct, w3.calc.barPct, w3.recommendedLoad], [8, 85, 60, 240]);
  assert.equal(w1.status, "prescription");
  assert.match(w1.reasons[0], /week 1 of 3 \(wave 1\)/);
});

test("the wave restarts every 3 weeks and counts the wave number; before the start date there is no prescription", () => {
  const w4 = DE({}, { today: day(2026, 10, 28) });
  assert.deepEqual([w4.calc.waveWeek, w4.calc.waveNumber, w4.calc.sets], [1, 2, 12]);
  const early = DE({}, { today: day(2026, 10, 1) });
  assert.equal(early.status, "insufficient_data"); assert.match(early.missing[0], /starts 2026-10-05/);
  assert.equal(weeksSince("2026-10-05", day(2026, 10, 11)), 0); assert.equal(weeksSince("2026-10-05", day(2026, 10, 12)), 1);
});

test("rounding to the loadable increment (and a different increment changes the load)", () => {
  assert.equal(DE({ increment: 2.5 }, { oneRepMax: 333 }).recommendedLoad, 167.5, "50% of 333 = 166.5 -> 167.5");
  assert.equal(DE({ increment: 10 }).recommendedLoad, 200);
});

test("upper miniband wave 9x3 at 50/55/60 and the volume squat wave", () => {
  const u = DE({ wave: "westside_upper_miniband" }, { oneRepMax: 300 });
  assert.deepEqual([u.calc.sets, u.calc.reps, u.recommendedLoad], [9, 3, 150]);
  const v = DE({ wave: "volume_squat" }, { oneRepMax: 400, today: day(2026, 10, 21) });
  assert.deepEqual([v.calc.sets, v.calc.reps, v.calc.totalPct, v.recommendedLoad], [10, 2, 80, 320]);
});

test("repeated-effort wave needs the accommodating-resistance answer; without bands the percentages drop by 5", () => {
  assert.equal(DE({ wave: "repeated_effort_upper" }, { oneRepMax: 300 }).status, "insufficient_data");
  const withBands = DE({ wave: "repeated_effort_upper", accommodatingResistance: true }, { oneRepMax: 300 });
  const without = DE({ wave: "repeated_effort_upper", accommodatingResistance: false }, { oneRepMax: 300 });
  assert.equal(withBands.calc.totalPct, 75); assert.equal(without.calc.totalPct, 70);
  assert.ok(withBands.recommendedLoad > without.recommendedLoad);
  assert.match(without.reasons.join(" "), /reduced by 5/);
});

test("deadlift: the weekly percentages are NOT published, so none are invented — you supply them", () => {
  const none = DE({ wave: "deadlift" }, { oneRepMax: 500 });
  assert.equal(none.status, "insufficient_data"); assert.match(none.missing[0], /not the weekly percentages/);
  assert.equal(none.recommendedLoad, null);
  const ok = DE({ wave: "deadlift", customPercents: [70, 75, 80] }, { oneRepMax: 500 });
  assert.deepEqual([ok.calc.sets, ok.calc.reps, ok.recommendedLoad], [6, 2, 350]);
  assert.equal(DE({ wave: "deadlift", customPercents: [70, 75] }, { oneRepMax: 500 }).status, "invalid");
  assert.equal(DE({ wave: "deadlift", customPercents: [70, 75, 120] }, { oneRepMax: 500 }).status, "invalid");
});

test("custom wave, validation, and what is never defaulted (1RM, start date, increment, wave)", () => {
  const c = DE({ wave: "custom", customWave: [{ sets: 8, reps: 3, totalPct: 60 }, { sets: 6, reps: 3, totalPct: 70 }], accommodationPct: 10 }, { today: day(2026, 10, 14) });
  assert.deepEqual([c.calc.waveWeek, c.calc.sets, c.calc.barPct, c.recommendedLoad], [2, 6, 60, 240]);
  assert.equal(DE({ wave: "custom", customWave: [{ sets: 0, reps: 3, totalPct: 60 }] }).status, "invalid");
  assert.equal(DE({}, { oneRepMax: null }).status, "insufficient_data");
  assert.equal(DE({}, { oneRepMax: -5 }).status, "insufficient_data");
  assert.equal(DE({ waveStartDate: undefined }).status, "insufficient_data");
  assert.equal(DE({ increment: undefined }).status, "invalid");
  assert.equal(DE({ wave: "nope" }).status, "invalid");
  assert.equal(DE({ accommodationPct: 90 }).status, "invalid");
});

test("rest is only echoed when the coach sets it (Westside doesn't prescribe one); barbell-only on the lower wave is called out", () => {
  assert.doesNotMatch(DE().reasons.join(" "), /Rest:/);
  assert.match(DE({ restSec: 60 }).reasons.join(" "), /Rest: 60s \(your setting/);
  assert.match(DE({ accommodationPct: 0 }).reasons.join(" "), /barbell-only/);
});

// ---------------------------------------------------------------- max effort
const ME = { role: "max_effort", lift: "squat", variations: ["Box squat", "Safety bar squat", "Giant cambered bar squat"], rotationWeeks: 1, rotationStartDate: "2026-10-05" };
const set = (date, reps, weight, extra = {}) => ({ date, sets: 1, reps, weight, ...extra });
const mer = (rows, over = {}, o = {}) => maxEffortReview({ config: { ...ME, ...over }, rows, today: day(2026, 10, 7), exerciseName: "Box squat", ...o });

test("max effort: a new best, a matched best, and a lower day are classified against THIS variation's own history; lower is never a regression", () => {
  const base = [set("2026-09-21", 1, 400), set("2026-09-28", 2, 405)];
  const up = mer([...base, set("2026-10-05", 1, 420)]);
  assert.equal(up.status, "progress"); assert.equal(up.calc.verdict, "new_best"); assert.equal(up.calc.previousBest, 405);
  const same = mer([...base, set("2026-10-05", 1, 405)]);
  assert.equal(same.calc.verdict, "matched"); assert.equal(same.status, "hold");
  const below = mer([...base, set("2026-10-05", 1, 385)]);
  assert.equal(below.calc.verdict, "below"); assert.equal(below.status, "hold"); assert.notEqual(below.status, "regression");
  assert.match(below.reasons[0], /not a failure/);
});

test("max effort: first session is a baseline; only 1-3 rep WORKING sets count; warm-ups and bad rows are ignored", () => {
  const first = mer([set("2026-10-05", 3, 380)]);
  assert.equal(first.calc.verdict, "baseline"); assert.equal(first.status, "hold");
  const noTop = mer([set("2026-10-05", 5, 300), set("2026-10-05", 1, 500, { set_type: "warmup" }), set("2026-10-05", null, 300), set("2026-10-05", 1, null)]);
  assert.equal(noTop.status, "insufficient_data"); assert.match(noTop.missing[0], /1-3 rep/);
  assert.equal(mer([set("2026-10-05", 5, 300)], { repRange: [1, 5] }).status, "hold", "the coach can widen the rep range");
  assert.equal(mer([], {}).status, "insufficient_data");
  assert.equal(mer([set("2026-10-05", 1, 400)], { repRange: [3, 1] }).status, "invalid");
});

test("rotation: the scheduled variation and the next one come from the pool, length and start date; a mismatch is pointed out; long cycles are warned about", () => {
  const rows = [set("2026-10-05", 1, 400)];
  const w1 = mer(rows, {}, { today: day(2026, 10, 7), exerciseName: "Box squat" });
  assert.equal(w1.calc.scheduledVariation, "Box squat"); assert.equal(w1.calc.nextVariation, "Safety bar squat");
  const w2 = mer(rows, {}, { today: day(2026, 10, 14), exerciseName: "Box squat" });
  assert.equal(w2.calc.scheduledVariation, "Safety bar squat"); assert.match(w2.reasons.join(" "), /isn't the scheduled variation/);
  const wrap = mer(rows, {}, { today: day(2026, 10, 26) });
  assert.equal(wrap.calc.scheduledVariation, "Box squat", "the cycle wraps around the pool");
  const two = mer(rows, { rotationWeeks: 2 }, { today: day(2026, 10, 14) });
  assert.equal(two.calc.scheduledVariation, "Box squat", "2-week rotation: still week 2 of the first variation");
  assert.equal(two.calc.weekInRotation, 2);
  assert.match(two.reasons.join(" "), /6 weeks to come back/);
  assert.equal(mer(rows, { rotationWeeks: 9 }).status, "invalid");
  assert.match(mer(rows, { rotationStartDate: undefined }).reasons.join(" "), /rotation start date/);
});

test("fatigue watch: more than 3 consecutive weeks with a top set at 90%+ of the 1RM flags the coach; it needs a 1RM and never invents one", () => {
  const sib = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"].map((d) => set(d, 1, 380, { exercise: "x" }));  // 95% of 400
  const flagged = mer(sib, {}, { siblingRows: sib, oneRepMax: 400 });
  assert.equal(flagged.coachReviewFlag, true); assert.equal(flagged.calc.weeksAtHighIntensity, 4); assert.match(flagged.reasons.join(" "), /central-nervous-system/);
  const three = sib.slice(1);
  assert.equal(mer(three, {}, { siblingRows: three, oneRepMax: 400 }).coachReviewFlag, false, "exactly 3 weeks is within the limit");
  const broken = [...sib.slice(0, 3), set("2026-10-05", 1, 340, { exercise: "x" })];
  assert.equal(mer(broken, {}, { siblingRows: broken, oneRepMax: 400 }).calc.weeksAtHighIntensity, 0, "the latest week was below 90%");
  assert.match(mer(sib, {}, {}).reasons.join(" "), /Enter the lift's 1RM/);
  assert.equal(mer(sib, { maxWeeksAtHighIntensity: 5 }, { siblingRows: sib, oneRepMax: 400 }).coachReviewFlag, false, "the limit is configurable");
});

test("entry point: role is required; routing works through the registry; ME result is non-load (acknowledge only)", () => {
  assert.equal(evaluateConjugate({ config: {} }).status, "invalid");
  assert.equal(evaluateProgression("conjugate", { config: { role: "dynamic_effort", wave: "westside_lower", waveStartDate: "2026-10-05", increment: 5 }, oneRepMax: 400, today: day(2026, 10, 7) }).recommendedLoad, 200);
  const me = evaluateProgression("conjugate", { config: ME, allRows: [set("2026-10-05", 1, 400)], exerciseName: "Box squat", today: day(2026, 10, 7) });
  assert.equal(me.calc.nonLoad, true); assert.equal(me.recommendedLoad, null);
  assert.equal(Object.keys(DE_WAVES).length, 5);
});

test("inputs are never mutated", () => {
  const input = { config: { ...ME }, rows: [set("2026-10-05", 1, 400)] };
  const snap = JSON.stringify(input);
  maxEffortReview({ ...input, today: day(2026, 10, 7) });
  assert.equal(JSON.stringify(input), snap);
});
