import test from "node:test";
import assert from "node:assert/strict";
import { toGrams, parseHouseholdMeasures, unitOptions } from "../src/lib/householdMeasures.js";
import { computeNutrients, sumNutrient } from "../src/lib/foodMath.js";

const quiet = { onWarn: () => {} };

test("mass units convert universally", () => {
  assert.equal(toGrams("100", "g"), "100");
  assert.equal(toGrams("6", "oz"), "170.1");
  assert.equal(toGrams("1", "lb"), "453.59");
  assert.equal(toGrams("0.5", "kg"), "500");
});

test("household measures use each food's own weights", () => {
  const rice = parseHouseholdMeasures("cup=158 g; tbsp=9.9 g");
  const chicken = parseHouseholdMeasures("cup=140 g; oz=28.35 g");
  const pb = parseHouseholdMeasures("tbsp=16 g; tsp=5.3 g");
  assert.equal(toGrams("1.5", "cup", rice), "237");
  assert.equal(toGrams("1.5", "cup", chicken), "210");
  assert.equal(toGrams("2", "tbsp", pb), "32");
  assert.equal(toGrams("1.25", "tbsp", rice), "12.38");
});

test("a missing household conversion never produces a guessed weight", () => {
  assert.equal(toGrams("1", "cup", parseHouseholdMeasures("tbsp=16 g")), "");
  assert.equal(toGrams("1", "cup", {}), "");
  assert.deepEqual(unitOptions({}).map((o) => o.key), ["g", "oz", "lb", "kg"]);
});

test("item sizes parse; malformed and unsupported entries are skipped safely", () => {
  assert.deepEqual(parseHouseholdMeasures("large=50 g; medium=44 g"), { large: 50, medium: 44 });
  assert.deepEqual(parseHouseholdMeasures("cup=abc; bogus=5 g; =3 g; tbsp=16", quiet), { tbsp: 16 });
  assert.deepEqual(parseHouseholdMeasures("cup=158 g; cup=999 g", quiet), { cup: 158 });
  assert.deepEqual(parseHouseholdMeasures("cup=-5 g; tsp=0 g; slice=99999 g", quiet), {});
  assert.deepEqual(parseHouseholdMeasures("  Cup = 158 grams ;; TBSP=9.9", quiet), { cup: 158, tbsp: 9.9 });
  for (const v of [null, undefined, "", 42, {}]) assert.deepEqual(parseHouseholdMeasures(v, quiet), {});
});

test("a food's own oz entry is ignored in favour of the exact factor", () => {
  assert.deepEqual(parseHouseholdMeasures("oz=28.35 g; cup=140 g", quiet), { cup: 140 });
});

test("non-numeric amounts pass through for existing validation", () => {
  assert.equal(toGrams("abc", "oz"), "abc");
  assert.equal(toGrams("", "lb"), "");
  assert.equal(toGrams("-1", "oz"), "-1");
});

test("nutrition uses one converted gram weight for all four macros", () => {
  const per100 = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
  const g = toGrams("150", "g");
  const n = computeNutrients(per100, g);
  assert.equal(n.kcal, 247.5);
  assert.equal(n.protein, 46.5);
  assert.equal(n.fat, 5.4);
  // 1.5 cups at 140 g/cup -> 210 g -> same math
  const c = computeNutrients(per100, toGrams("1.5", "cup", { cup: 140 }));
  assert.equal(c.kcal, 346.5);
  assert.equal(sumNutrient([n.kcal, c.kcal]), 594);
});
