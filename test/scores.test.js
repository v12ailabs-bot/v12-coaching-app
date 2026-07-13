import { test } from "node:test";
import assert from "node:assert/strict";
import { toScore } from "../api/_lib/scores.js";

// Regression guard for the "unassessed client shows 1/10" bug.
// The root cause was Number("") -> 0 -> clamped up to 1. These tests exercise
// the real production toScore() used by both initial generation
// (api/generate-program.js) and "Refresh from Notion" (api/sync-client.js).

test("toScore: unassessed values coerce to null, never 1", () => {
  assert.equal(toScore(null), null, "null stays null");
  assert.equal(toScore(undefined), null, "undefined stays null");
  assert.equal(toScore(""), null, "empty string stays null (was the bug: -> 1)");
  assert.equal(toScore("   "), null, "whitespace-only stays null");
  assert.equal(toScore("n/a"), null, "non-numeric text stays null");
  assert.equal(toScore(NaN), null, "NaN stays null");
});

test("toScore: real numeric values are kept and clamped to 1-10", () => {
  assert.equal(toScore(5), 5);
  assert.equal(toScore("7"), 7);
  assert.equal(toScore(7.4), 7, "rounds");
  assert.equal(toScore(0), 1, "clamps up to floor of 1");
  assert.equal(toScore(-3), 1, "clamps negatives up to 1");
  assert.equal(toScore(15), 10, "clamps down to ceiling of 10");
});

// "Refresh from Notion" path — mirrors the exact update-building guard in
// api/sync-client.js. An unassessed client must leave the score columns UNSET
// (so a coach-set value is never overwritten and no phantom 1 is written).
test("Refresh from Notion: unassessed client leaves score columns unset", () => {
  const client = {
    name: "Unassessed Client",
    goal: "Fat loss",
    nervous_system_recruitment: null,
    muscular_density_to_size: "",
    metabolic_work_capacity: undefined,
  };

  const ns = toScore(client.nervous_system_recruitment);
  const ds = toScore(client.muscular_density_to_size);
  const wc = toScore(client.metabolic_work_capacity);

  const update = {};
  if (client.name) update.name = client.name;
  if (client.goal) update.goal = client.goal;
  if (ns != null) update.nervous_system_recruitment = ns;
  if (ds != null) update.muscular_density_to_size = ds;
  if (wc != null) update.metabolic_work_capacity = wc;

  assert.deepEqual(Object.keys(update).sort(), ["goal", "name"], "only name/goal written");
  assert.ok(!("nervous_system_recruitment" in update), "score not written");
  assert.ok(!("muscular_density_to_size" in update), "score not written");
  assert.ok(!("metabolic_work_capacity" in update), "score not written");
});

// Initial generation path — mirrors api/generate-program.js, which writes the
// coerced scores directly. Unassessed values must persist as null, not 1.
test("Initial generation: unassessed assessment persists as null, not 1", () => {
  const assessment = {
    nervous_system_recruitment: "",
    muscular_density_to_size: null,
    metabolic_work_capacity: "  ",
  };

  const persisted = {
    nervous_system_recruitment: toScore(assessment.nervous_system_recruitment),
    muscular_density_to_size: toScore(assessment.muscular_density_to_size),
    metabolic_work_capacity: toScore(assessment.metabolic_work_capacity),
  };

  assert.deepEqual(persisted, {
    nervous_system_recruitment: null,
    muscular_density_to_size: null,
    metabolic_work_capacity: null,
  });
});
