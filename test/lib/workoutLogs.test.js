import { test } from "node:test";
import assert from "node:assert/strict";
import { topSetPerDay } from "../../src/lib/workoutLogs.js";

test("a heavier second set on the same day overtakes the first-logged set", () => {
  // Repro: 305 lb logged, then a heavier 325 lb set logged after, same day —
  // the chart must show 325, not the first set entered.
  const logs = [
    { date: "2026-08-20", weight: 305, reps: 5 },
    { date: "2026-08-20", weight: 325, reps: 3 },
  ];
  const result = topSetPerDay(logs, false);
  assert.equal(result.length, 1);
  assert.equal(result[0].weight, 325);
  assert.equal(result[0].reps, 3);
});

test("a lighter set logged after the heaviest one does not overtake it", () => {
  const logs = [
    { date: "2026-08-20", weight: 325, reps: 3 },
    { date: "2026-08-20", weight: 305, reps: 5 },
  ];
  const result = topSetPerDay(logs, false);
  assert.equal(result.length, 1);
  assert.equal(result[0].weight, 325);
});

test("bodyweight moves compare by reps, not weight", () => {
  const logs = [
    { date: "2026-08-20", weight: null, reps: 8 },
    { date: "2026-08-20", weight: null, reps: 12 },
  ];
  const result = topSetPerDay(logs, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].reps, 12);
});

test("multiple dates each keep their own top set, ascending insertion order preserved", () => {
  const logs = [
    { date: "2026-08-18", weight: 300, reps: 5 },
    { date: "2026-08-19", weight: 310, reps: 5 },
    { date: "2026-08-19", weight: 315, reps: 4 },
    { date: "2026-08-20", weight: 305, reps: 5 },
    { date: "2026-08-20", weight: 325, reps: 3 },
  ];
  const result = topSetPerDay(logs, false);
  assert.deepEqual(result.map((r) => r.weight), [300, 315, 325]);
});

test("sets with no usable value for the given mode are skipped, not zeroed", () => {
  const logs = [{ date: "2026-08-20", weight: null, reps: null, time: "01:30" }];
  assert.deepEqual(topSetPerDay(logs, false), []);
});

test("empty/undefined logs return an empty array", () => {
  assert.deepEqual(topSetPerDay([], false), []);
  assert.deepEqual(topSetPerDay(undefined, false), []);
});
