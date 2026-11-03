import { test } from "node:test";
import assert from "node:assert/strict";
import { planCarryOver, applyCarryOver, suggestDay, milestoneLabel } from "../../src/lib/programming/carryOver.js";

const ex = (name, o = {}) => ({ name, sets: 3, reps: "8", section: "Accessories", exercise_type: "Accessory", category: "Bodybuilding", block_type: "straight_set", ...o });
const plan = () => ({ program_name: "P", weekly_split: [
  { day: "Monday", exercises: [ex("Bench Press", { section: "Main Compound Lift", exercise_type: "Compound", category: "Powerlifting" }), ex("Fly")] },
  { day: "Wednesday", exercises: [ex("Deadlift", { section: "Main Compound Lift", exercise_type: "Compound", category: "Powerlifting" }), ex("Row"), ex("Curl")] },
  { day: "Friday", exercises: [ex("Lunge")] },
] });
const squat = { id: "x1", name: "Back Squat", day_of_week: "Tuesday", sets: 5, reps: "5", rest_seconds: 180, section: "Main Compound Lift", exercise_type: "Compound", category: "Powerlifting" };
const ms = (o = {}) => ({ status: "active", category: "strength", exercise_name: "back squat", baseline_value: 225, target_value: 325, unit: "lb", ...o });

test("only an active milestone lift that the draft lacks is offered", () => {
  const cur = [squat, { id: "x2", name: "Cable Curl", sets: 3, reps: "12" }, { id: "x3", name: "Bench Press", sets: 3, reps: "5" }];
  const r = planCarryOver({ current: cur, milestones: [ms(), ms({ exercise_name: "Bench Press" })], plan: plan() });
  assert.deepEqual(r.map((c) => c.exercise.name), ["Back Squat"]);   // bench is already in the draft; curl has no milestone
});

test("achieved / inactive / non-lift milestones and never-programmed lifts offer nothing", () => {
  const cur = [squat];
  for (const m of [ms({ achieved_at: "2026-10-01" }), ms({ status: "achieved" }), ms({ category: "body_composition" }), ms({ exercise_name: "Overhead Press" })])
    assert.equal(planCarryOver({ current: cur, milestones: [m], plan: plan() }).length, 0);
});

test("suggested day: same movement category wins; tie goes to the lighter day", () => {
  assert.equal(suggestDay(plan(), squat), "Monday");   // Monday & Wednesday tie on 1 powerlifting main lift (+ section); Monday is lighter
  assert.equal(suggestDay(plan(), { ...squat, category: "Conditioning", section: "Finisher", day_of_week: "" }), "Friday");
});

test("a carried lift lands in its day in workout-phase order, with its own prescription", () => {
  const [c] = planCarryOver({ current: [squat], milestones: [ms()], plan: plan() });
  const out = applyCarryOver(plan(), [c]);
  const day = out.weekly_split.find((d) => d.day === c.day).exercises;
  assert.equal(day[0].section, "Main Compound Lift");                // squat sorted ahead of accessories, not appended last
  const added = day.find((e) => e.name === "Back Squat");
  assert.equal(added.sets, 5); assert.equal(added.reps, "5"); assert.equal(added.rest_seconds, 180);
  assert.equal(plan().weekly_split.find((d) => d.day === c.day).exercises.length, day.length - 1); // input untouched
});

test("milestone label", () => assert.equal(milestoneLabel(ms()), "back squat: 225 → 325 lb"));
