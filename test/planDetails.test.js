import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePlanDetails } from "../api/_lib/planDetails.js";

const phases = [{ phase: "Foundation" }, { phase: "Strength" }];

test("keeps valid details, drops malformed items, never coerces", () => {
  const r = sanitizePlanDetails({ phases: [
    { index: 0, plan_rationale: "  Build base  ", planned_changes: [
      { action: "replace", from: "Goblet Squat", to: "Back Squat", reason: "Ready for load" },
      { action: "teleport", from: "a", to: "b", reason: "x" },
      { action: "add", to: "", from: "", reason: "no exercise named" },
      { action: "remove", from: "Lunge", reason: "" },
    ], checkpoints: [
      { type: "reassessment", label: "Week 4 reassessment", day: 28 },
      { type: "reassessment", label: "dup", day: 28 },
      { type: "bogus", label: "x", day: 5 },
      { type: "nutrition_review", label: "Past program end", day: 400 },
      { type: "goal_review", label: "No day" },
    ] },
    { index: 9, plan_rationale: "out of range index" },
  ] }, phases, 12);
  assert.equal(r[0].plan_rationale, "Build base");
  assert.equal(r[0].planned_changes.length, 1);
  assert.equal(r[0].checkpoints.filter((c) => c.type !== "day90_review").length, 1);
  assert.equal(r[1].plan_rationale, "");
});

test("Day 90 review is added to the final phase deterministically, once, and the model can't supply it", () => {
  const r = sanitizePlanDetails({ phases: [{ index: 1, checkpoints: [{ type: "day90_review", label: "model's own", day: 10 }] }] }, phases, 12);
  const d90 = r[1].checkpoints.filter((c) => c.type === "day90_review");
  assert.equal(d90.length, 1);
  assert.equal(d90[0].day, 90);
  assert.equal(r[0].checkpoints.length, 0);
});

test("garbage or empty AI output still yields a safe structure", () => {
  for (const raw of [null, undefined, "x", {}, { phases: "no" }]) {
    const r = sanitizePlanDetails(raw, phases, 12);
    assert.equal(r.length, 2);
    assert.deepEqual(r[0], { plan_rationale: "", planned_changes: [], checkpoints: [] });
  }
});

test("long strings are truncated", () => {
  const r = sanitizePlanDetails({ phases: [{ index: 0, plan_rationale: "x".repeat(900) }] }, phases, 12);
  assert.equal(r[0].plan_rationale.length, 500);
});
