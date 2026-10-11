import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNutrients, validateQuantityG, sumNutrient, formatKcal, formatMacro } from "../../src/lib/foodMath.js";

const chicken = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };

test("100 g returns the per-100 g values", () => {
  assert.deepEqual(computeNutrients(chicken, 100), { kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
});

test("137.3 g matches the database rounding (half up, 2 dp)", () => {
  // 165*1.373 = 226.545 -> 226.55 ; a float would give 226.54499999...
  assert.deepEqual(computeNutrients(chicken, "137.3"), { kcal: 226.55, protein: 42.56, carbs: 0, fat: 4.94 });
  assert.equal(computeNutrients(chicken, 137.3).kcal, 226.55);
});

test("unknown nutrients stay null, a real zero stays 0", () => {
  const r = computeNutrients({ kcal: 100, protein: 5, carbs: null, fat: 1 }, 50);
  assert.equal(r.carbs, null);
  assert.equal(r.kcal, 50);
  assert.equal(computeNutrients(chicken, 50).carbs, 0);
});

test("invalid quantities are rejected", () => {
  for (const bad of [0, "0", -5, "", null, undefined, "abc", "1.234", "1e3", "12,5"]) {
    assert.ok(validateQuantityG(bad).error, `should reject ${JSON.stringify(bad)}`);
    assert.ok(computeNutrients(chicken, bad).error);
  }
});

test("meal totals sum known values and keep all-unknown as null", () => {
  const a = computeNutrients(chicken, 100), b = computeNutrients(chicken, 137.3);
  assert.equal(sumNutrient([a.kcal, b.kcal]), 391.55);
  assert.equal(sumNutrient([0.1, 0.2]), 0.3); // no float drift
  assert.equal(sumNutrient([null, 80]), 80);
  assert.equal(sumNutrient([null, null]), null);
});

test("display rounding and unknown label", () => {
  assert.equal(formatKcal(226.55), "227");
  assert.equal(formatMacro(42.56), "42.6");
  assert.equal(formatKcal(null), "unknown");
  assert.equal(formatMacro(null), "unknown");
});
