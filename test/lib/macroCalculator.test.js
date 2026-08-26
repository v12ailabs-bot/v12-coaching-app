import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateMacros } from "../../src/lib/macroCalculator.js";

test("missing any required input returns null, never a guessed result", () => {
  assert.equal(calculateMacros({}), null);
  assert.equal(calculateMacros({ sex: "male", age: 30, weightLb: 180, heightIn: 70, activity: "moderate" }), null);
});

test("male, moderate activity, maintain -> reasonable BMR/TDEE/calories", () => {
  const r = calculateMacros({ sex: "male", age: 30, weightLb: 180, heightIn: 70, activity: "moderate", goal: "maintain" });
  assert.ok(r);
  // Mifflin-St Jeor by hand: weightKg=81.65, heightCm=177.8
  // BMR = 10*81.65 + 6.25*177.8 - 5*30 + 5 = 816.5 + 1111.25 - 150 + 5 = 1782.75
  assert.equal(r.bmr, 1783);
  assert.equal(r.tdee, Math.round(1782.75 * 1.55));
  assert.equal(r.calories, r.tdee); // maintain -> no adjustment
});

test("goal adjusts calories down for lose, up for gain, relative to maintain", () => {
  const base = { sex: "female", age: 28, weightLb: 150, heightIn: 65, activity: "light" };
  const maintain = calculateMacros({ ...base, goal: "maintain" });
  const lose = calculateMacros({ ...base, goal: "lose" });
  const gain = calculateMacros({ ...base, goal: "gain" });
  assert.ok(lose.calories < maintain.calories);
  assert.ok(gain.calories > maintain.calories);
});

test("macros: protein ~1g/lb bodyweight, fat/carbs derived and non-negative", () => {
  const r = calculateMacros({ sex: "male", age: 25, weightLb: 200, heightIn: 72, activity: "active", goal: "gain" });
  assert.equal(r.proteinG, 200);
  assert.ok(r.fatsG > 0);
  assert.ok(r.carbsG >= 0);
  // Macro calories should roughly reconcile with total calories (within rounding).
  const macroCals = r.proteinG * 4 + r.carbsG * 4 + r.fatsG * 9;
  assert.ok(Math.abs(macroCals - r.calories) <= 4);
});

test("unrecognized activity/goal key returns null instead of silently defaulting", () => {
  const base = { sex: "male", age: 30, weightLb: 180, heightIn: 70 };
  assert.equal(calculateMacros({ ...base, activity: "not_a_real_level", goal: "maintain" }), null);
  assert.equal(calculateMacros({ ...base, activity: "moderate", goal: "not_a_real_goal" }), null);
});
