import test from "node:test";
import assert from "node:assert/strict";
import { toGrams } from "../src/lib/foodMath.js";

test("oz and lb convert to grams with at most 2 decimals", () => {
  assert.equal(toGrams("4", "oz"), "113.4");
  assert.equal(toGrams("1", "lb"), "453.59");
  assert.equal(toGrams("150", "g"), "150");
});

test("non-numeric input passes through for the existing validation", () => {
  assert.equal(toGrams("abc", "oz"), "abc");
  assert.equal(toGrams("", "lb"), "");
});
