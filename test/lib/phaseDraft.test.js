import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPhaseDraft } from "../../src/lib/phaseDraft.js";

const cur = [
  { id: "1", name: "Goblet Squat", day_of_week: "Monday", sets: 3, reps: "8-12", category: "Legs", progression_method: "double_progression", progression_config: { repMin: 8 }, order_index: 0 },
  { id: "2", name: "Bench Press", day_of_week: "Monday", sets: 4, reps: "5", order_index: 1 },
  { id: "3", name: "Row", day_of_week: "Wednesday", sets: 3, reps: "10", order_index: 0 },
];

test("with no planned changes the draft is an exact copy (continuity is the default)", () => {
  const d = buildPhaseDraft(cur, []);
  assert.equal(d.exercises.length, 3);
  assert.deepEqual(d.exercises.map((e) => e.name), ["Goblet Squat", "Bench Press", "Row"]);
  assert.deepEqual(d.unapplied, []);
  assert.equal(d.exercises[0].source_exercise_id, "1");
});

test("replace keeps the slot but drops the old lift's progression assignment", () => {
  const d = buildPhaseDraft(cur, [{ action: "replace", from: " goblet squat ", to: "Back Squat", reason: "ready for load" }]);
  const e = d.exercises[0];
  assert.equal(e.name, "Back Squat");
  assert.equal(e.day_of_week, "Monday");
  assert.equal(e.sets, 3);
  assert.equal(e.progression_method, null);
  assert.deepEqual(e.progression_config, {});
  assert.equal(e.change.reason, "ready for load");
  assert.equal(e.needs_review, true);
});

test("remove drops the exercise; add goes on the lightest day and is flagged for review", () => {
  const d = buildPhaseDraft(cur, [{ action: "remove", from: "Row", reason: "r" }, { action: "add", to: "Pull-up", reason: "new emphasis" }]);
  assert.deepEqual(d.exercises.map((e) => e.name).sort(), ["Bench Press", "Goblet Squat", "Pull-up"]);
  const added = d.exercises.find((e) => e.name === "Pull-up");
  assert.equal(added.day_of_week, "Monday", "Wednesday emptied by the remove, so Monday is the only day with exercises");
  assert.equal(added.needs_review, true);
  assert.equal(added.source_exercise_id, null);
});

test("progress keeps the exercise and annotates it", () => {
  const d = buildPhaseDraft(cur, [{ action: "progress", from: "Bench Press", reason: "add load" }]);
  assert.equal(d.exercises[1].name, "Bench Press");
  assert.equal(d.exercises[1].change.action, "progress");
});

test("changes that can't be applied are reported, never guessed or dropped silently", () => {
  const d = buildPhaseDraft(cur, [
    { action: "replace", from: "Deadlift", to: "Trap Bar", reason: "x" },
    { action: "remove", from: "Nothing", reason: "x" },
    { action: "add", reason: "no name" },
    { action: "teleport", from: "a", to: "b", reason: "x" },
  ]);
  assert.equal(d.exercises.length, 3);
  assert.equal(d.unapplied.length, 4);
  assert.match(d.unapplied[0].reason, /not in the current program/);
});

test("adding to a program with no exercises is reported; inputs are never mutated", () => {
  assert.equal(buildPhaseDraft([], [{ action: "add", to: "Squat", reason: "r" }]).unapplied.length, 1);
  const snap = JSON.stringify(cur);
  buildPhaseDraft(cur, [{ action: "replace", from: "Row", to: "Cable Row", reason: "r" }]);
  assert.equal(JSON.stringify(cur), snap);
});
