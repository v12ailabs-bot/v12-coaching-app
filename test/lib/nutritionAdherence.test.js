import { test } from "node:test";
import assert from "node:assert/strict";
import { nutritionAdherenceFrom } from "../../src/lib/scoring/nutritionAdherence.js";

const today = new Date("2026-01-10T00:00:00Z");
const dateAt = (n) => `2026-01-${String(n).padStart(2, "0")}`;
const days = (n, factory) => Array.from({ length: n }, (_, i) => factory(dateAt(i + 1)));

test("no nutrition plan -> null score, loggingRate still reported", () => {
  const checkins = days(10, d => ({ date: d, calories: 2000, protein_g: 150 }));
  const r = nutritionAdherenceFrom(checkins, null, 10, today);
  assert.equal(r.score, null);
  assert.equal(r.loggingRate, 1);
});

test("nothing logged -> null score, loggingRate 0", () => {
  const r = nutritionAdherenceFrom([], { calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 60 }, 10, today);
  assert.equal(r.score, null);
  assert.equal(r.loggingRate, 0);
});

test("perfect macros, full logging -> 100", () => {
  const targets = { calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 60 };
  const checkins = days(10, d => ({ date: d, ...targets }));
  const r = nutritionAdherenceFrom(checkins, targets, 10, today);
  assert.equal(r.score, 100);
  assert.equal(r.loggingRate, 1);
});

test("perfect macros but only half the days logged -> score scaled by loggingRate, not 100", () => {
  const targets = { calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 60 };
  const checkins = days(5, d => ({ date: d, ...targets })); // only days 1-5 of a 10-day window
  const r = nutritionAdherenceFrom(checkins, targets, 10, today);
  assert.equal(r.loggingRate, 0.5);
  assert.equal(r.score, 50, "silence isn't success — logging rate drags the score down");
});

test("missing target for one macro renormalizes weights among the rest", () => {
  const targets = { calories: 2000, protein_g: 150, carbs_g: null, fats_g: 60 };
  const checkins = days(10, d => ({ date: d, calories: 2000, protein_g: 150, fats_g: 60 }));
  const r = nutritionAdherenceFrom(checkins, targets, 10, today);
  assert.equal(r.score, 100, "perfect on all 3 tracked macros still averages to 100 after renormalizing");
});

test("off-target protein lowers the score proportionally", () => {
  const targets = { calories: null, protein_g: 150, carbs_g: null, fats_g: null };
  const checkins = days(10, d => ({ date: d, protein_g: 120 })); // 20% under target
  const r = nutritionAdherenceFrom(checkins, targets, 10, today);
  assert.equal(r.score, 80);
});

test("meal_logs alone count as logged days and are scored against targets", () => {
  const targets = { calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 60 };
  const meals = days(10, d => ({ date: d, calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 60 }));
  const r = nutritionAdherenceFrom([], targets, 10, today, meals);
  assert.equal(r.loggingRate, 1);
  assert.equal(r.score, 100);
});

test("meal_logs on the same day sum across meals and add to check-in macros, never overwrite", () => {
  const targets = { calories: null, protein_g: 150, carbs_g: null, fats_g: null };
  const checkins = [{ date: dateAt(1), protein_g: 50 }];
  const meals = [{ date: dateAt(1), protein_g: 60 }, { date: dateAt(1), protein_g: 40 }];
  const r = nutritionAdherenceFrom(checkins, targets, 1, new Date("2026-01-01T00:00:00Z"), meals);
  assert.equal(r.score, 100, "50 + 60 + 40 = 150 = target");
});

test("a macro nobody reported stays unknown, not 0", () => {
  const targets = { calories: 2000, protein_g: 150, carbs_g: null, fats_g: null };
  const meals = [{ date: dateAt(1), protein_g: 150 }];
  const r = nutritionAdherenceFrom([], targets, 1, new Date("2026-01-01T00:00:00Z"), meals);
  assert.equal(r.score, 100, "calories unreported is dropped and weights renormalize, not scored as 0 kcal");
});
