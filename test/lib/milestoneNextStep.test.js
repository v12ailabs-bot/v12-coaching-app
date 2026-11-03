import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNextStep } from "../../src/lib/milestoneNextStep.js";

const up = { direction: "increase", target_value: 325, unit: "lb", exercise_name: "Back Squat" };
const raw = (v, o = {}) => ({ headline: "Nice", next_target: { value: v, weeks: 8, reasoning: "r" }, exercise_plan: { action: "continue", exercise: "Back Squat" }, ...o });

test("a sane next target in the milestone's direction is kept", () => {
  const r = validateNextStep(up, raw(365));
  assert.equal(r.next_target.value, 365); assert.equal(r.next_target.unit, "lb"); assert.equal(r.next_target.weeks, 8);
});
test("wrong direction, no step, or an absurd jump is dropped (coach sets it by hand)", () => {
  for (const v of [300, 325, 3250, 500, "abc", null]) assert.equal(validateNextStep(up, raw(v)).next_target, null, String(v));
});
test("decrease milestones need a lower next target", () => {
  const down = { direction: "decrease", target_value: 20, unit: "reps" };
  assert.equal(validateNextStep(down, raw(18)).next_target.value, 18);
  assert.equal(validateNextStep(down, raw(25)).next_target, null);
});
test("unknown actions fall back to continue; suggested exercise only for variation/swap", () => {
  assert.equal(validateNextStep(up, raw(365, { exercise_plan: { action: "delete everything" } })).exercise_plan.action, "continue");
  const v = validateNextStep(up, raw(365, { exercise_plan: { action: "variation", suggested_exercise: "Pause Squat" } }));
  assert.equal(v.exercise_plan.suggested_exercise, "Pause Squat");
  assert.equal(validateNextStep(up, raw(365, { exercise_plan: { action: "continue", suggested_exercise: "x" } })).exercise_plan.suggested_exercise, null);
});
test("garbage input does not throw", () => assert.equal(validateNextStep(up, "nope").next_target, null));

import { celebrationText } from "../../src/lib/achievements.js";
test("celebration text for a lift milestone and for the weight goal", () => {
  const lift = celebrationText({ exercise_name: "Back Squat", target_value: 325, baseline_value: 225, unit: "lb" }, "Sam");
  assert.match(lift.title, /Sam/); assert.match(lift.body, /Back Squat: you hit 325 lb — up from 225 lb/);
  const w = celebrationText({ metric_key: "bodyweight", target_value: 185, unit: "lb" }, "");
  assert.match(w.body, /goal weight of 185 lb/); assert.doesNotMatch(w.title, /,/);
});
