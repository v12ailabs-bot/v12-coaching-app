import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isHabitSatisfied,
  habitAdherenceFrom,
  workoutAdherenceFrom,
  avgSleepHoursFrom,
  weightChangeFrom,
  targetStatus,
} from "../../src/lib/scoring.js";

const asOf = new Date("2026-10-01T12:00:00");

test("isHabitSatisfied: completion_button uses done, ignores value", () => {
  assert.equal(isHabitSatisfied({ type: "completion_button" }, { done: true, value: null }), true);
  assert.equal(isHabitSatisfied({ type: "completion_button" }, { done: false }), false);
});

test("isHabitSatisfied: manual_value at_least/at_most thresholds", () => {
  const steps = { type: "manual_value", target_value: 8000, target_direction: "at_least" };
  assert.equal(isHabitSatisfied(steps, { value: 9000 }), true);
  assert.equal(isHabitSatisfied(steps, { value: 7000 }), false);
  assert.equal(isHabitSatisfied(steps, { value: null }), false);

  const calories = { type: "manual_value", target_value: 2500, target_direction: "at_most" };
  assert.equal(isHabitSatisfied(calories, { value: 2400 }), true);
  assert.equal(isHabitSatisfied(calories, { value: 2600 }), false);
});

test("isHabitSatisfied: linked_check_in_value behaves like manual_value once a value is resolved", () => {
  const protein = { type: "linked_check_in_value", linked_field: "protein_g", target_value: 120, target_direction: "at_least" };
  assert.equal(isHabitSatisfied(protein, { value: 128 }), true);
  assert.equal(isHabitSatisfied(protein, { value: 100 }), false);
});

test("habitAdherenceFrom: per-habit % and overall % are derived from the same counts, never contradictory", () => {
  const habits = [
    { id: "h1", type: "completion_button" },
    { id: "h2", type: "manual_value", target_value: 8000, target_direction: "at_least" },
  ];
  const logs = [
    { habit_id: "h1", date: "2026-10-01", done: true },
    { habit_id: "h1", date: "2026-09-30", done: true },
    { habit_id: "h2", date: "2026-10-01", value: 9000 },
    { habit_id: "h2", date: "2026-09-30", value: 5000 },
  ];
  const { overall, perHabit } = habitAdherenceFrom(habits, logs, { days: 4, asOf });
  assert.equal(perHabit.h1.satisfied, 2);
  assert.equal(perHabit.h1.possible, 4);
  assert.equal(perHabit.h2.satisfied, 1);
  const expectedOverall = Math.round(((2 + 1) / (4 + 4)) * 100);
  assert.equal(overall, expectedOverall);
});

test("habitAdherenceFrom: linked_check_in_value reads value from checkinByDate", () => {
  const habits = [{ id: "h1", type: "linked_check_in_value", linked_field: "protein_g", target_value: 120, target_direction: "at_least" }];
  const checkinByDate = {
    "2026-10-01": { protein_g: 128 },
    "2026-09-30": { protein_g: 90 },
  };
  const { perHabit } = habitAdherenceFrom(habits, [], { days: 2, asOf, checkinByDate });
  assert.equal(perHabit.h1.satisfied, 1);
});

test("habitAdherenceFrom: no habits -> overall is null, not NaN/0", () => {
  const { overall } = habitAdherenceFrom([], [], { days: 30, asOf });
  assert.equal(overall, null);
});

test("workoutAdherenceFrom: rest days excluded from both numerator and denominator", () => {
  const checkins = [
    { date: "2026-09-29", workout: "completed" },
    { date: "2026-09-30", workout: "rest" },
    { date: "2026-10-01", workout: "missed" },
  ];
  const { score, completed, scheduled } = workoutAdherenceFrom(checkins, 3, asOf);
  assert.equal(scheduled, 2, "rest day excluded from denominator");
  assert.equal(completed, 1);
  assert.equal(score, 50);
});

test("workoutAdherenceFrom: no scheduled days -> null, not 0", () => {
  const { score } = workoutAdherenceFrom([{ date: "2026-10-01", workout: "rest" }], 3, asOf);
  assert.equal(score, null);
});

test("avgSleepHoursFrom: averages sleep_hours, null on no data", () => {
  const checkins = [
    { date: "2026-10-01", sleep_hours: 7.5 },
    { date: "2026-09-30", sleep_hours: 6.5 },
  ];
  assert.equal(avgSleepHoursFrom(checkins, 2, asOf), 7);
  assert.equal(avgSleepHoursFrom([], 30, asOf), null);
  assert.equal(avgSleepHoursFrom([{ date: "2026-10-01", sleep_hours: null }], 30, asOf), null);
});

test("weightChangeFrom: delta across the window, null when fewer than 2 points", () => {
  const series = [
    { date: "2026-09-02", weight: 220 },
    { date: "2026-10-01", weight: 214.6 },
  ];
  const { delta, days } = weightChangeFrom(series, 30, asOf);
  assert.equal(Math.round(delta * 10) / 10, -5.4);
  assert.equal(days, 30);
  assert.equal(weightChangeFrom([{ date: "2026-10-01", weight: 214.6 }], 30, asOf).delta, null);
  assert.equal(weightChangeFrom([], 30, asOf).delta, null);
});

test("targetStatus: boundary values at exactly 5%/15%", () => {
  assert.equal(targetStatus(126, 120, "at_least"), "On Target", "exactly +5% is still On Target");
  assert.equal(targetStatus(138, 120, "at_least"), "Near Target", "exactly +15% is still Near Target");
  assert.equal(targetStatus(140, 120, "at_least"), "Above Target", "beyond +15% (at_least) is Above Target");
  assert.equal(targetStatus(100, 120, "at_least"), "Under Target", "below -15% (at_least) is Under Target");
  assert.equal(targetStatus(2625, 2500, "at_most"), "On Target", "exactly +5% is still On Target");
  assert.equal(targetStatus(2875, 2500, "at_most"), "Near Target", "exactly +15% is still Near Target");
  assert.equal(targetStatus(3000, 2500, "at_most"), "Over Target", "beyond +15% (at_most) is Over Target");
  assert.equal(targetStatus(null, 120, "at_least"), null);
  assert.equal(targetStatus(100, null, "at_least"), null);
});
