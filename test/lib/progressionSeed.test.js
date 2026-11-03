import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepTarget, guessEquipment, presetFor, planSeed } from "../../src/lib/progression/seed.js";
import { evaluateProgression } from "../../src/lib/progression/methods.js";
import { exerciseKey, describeRecord, memoryLoad } from "../../src/lib/strengthRecords.js";

const ex = (o = {}) => ({ id: "e1", name: "Dumbbell Row", sets: 3, reps: "8-12", section: "Accessories", exercise_type: "Accessory", block_type: "straight_set", is_bodyweight: false, ...o });

test("parseRepTarget reads ranges and single targets, rejects the rest", () => {
  assert.deepEqual(parseRepTarget("8-12"), { min: 8, max: 12 });
  assert.deepEqual(parseRepTarget("8–12 reps"), { min: 8, max: 12 });
  assert.deepEqual(parseRepTarget("10 to 15"), { min: 10, max: 15 });
  assert.deepEqual(parseRepTarget("5"), { fixed: 5 });
  for (const bad of ["AMRAP", "30s", "5x5", "12-8", "", null]) assert.equal(parseRepTarget(bad), null, String(bad));
});

test("double progression seeds a range exercise and the config runs through the real engine", () => {
  const p = presetFor(ex(), "double_progression");
  assert.equal(p.method, "double_progression");
  assert.deepEqual(p.config, { repMin: 8, repMax: 12, requiredSets: 3, equipment: "dumbbell" });
  const sets = [1, 2, 3].map((n) => ({ sets: n, reps: 12, weight: 50 }));
  assert.equal(evaluateProgression(p.method, { config: p.config, currentLoad: 50, sets }).recommendedLoad, 55);
});

test("seeding skips what can't be derived safely", () => {
  assert.match(presetFor(ex({ reps: "10" }), "double_progression").skip, /rep range/);
  assert.match(presetFor(ex({ is_bodyweight: true }), "double_progression").skip, /Bodyweight/);
  assert.match(presetFor(ex({ section: "Warm-Up" }), "double_progression").skip, /Not a loaded/);
  assert.match(presetFor(ex({ block_type: "superset" }), "double_progression").skip, /Superset/);
  assert.match(presetFor(ex({ progression_method: "linear_progression" }), "double_progression").skip, /Already/);
  for (const m of ["percentage_based", "conjugate", "density_progression", "performance_taper"]) assert.match(presetFor(ex(), m).skip, /coach setup/, m);
  assert.match(presetFor(ex(), null).skip, /no progression model/);
});

test("APRE seeds only compound lifts on a published rep target", () => {
  const squat = ex({ name: "Back Squat", exercise_type: "Compound", reps: "6", section: "Main Compound Lift" });
  assert.deepEqual(presetFor(squat, "apre"), { method: "apre_6", config: { stepMode: "low", equipment: "barbell" } });
  assert.match(presetFor({ ...squat, reps: "5" }, "apre").skip, /3, 6 or 10/);
  assert.match(presetFor({ ...squat, exercise_type: "Accessory" }, "apre").skip, /compound/);
});

test("planSeed splits assignments from skips", () => {
  const r = planSeed([ex(), ex({ id: "e2", reps: "AMRAP" })], "double_progression");
  assert.equal(r.assign.length, 1); assert.equal(r.skipped.length, 1);
});

test("equipment guess", () => {
  assert.equal(guessEquipment("Barbell Bench Press"), "barbell");
  assert.equal(guessEquipment("Lat Pulldown"), "cable");
  assert.equal(guessEquipment("Leg Press"), "machine");
  assert.equal(guessEquipment("Plank"), "other");
});

test("strength memory helpers", () => {
  assert.equal(exerciseKey("  Back   Squat "), "back squat");
  const rec = { is_bodyweight: false, best_weight: 225, best_weight_reps: 3, best_weight_date: "2026-09-15", last_weight: 185, last_reps: 8, last_date: "2026-09-22" };
  assert.match(describeRecord(rec), /^Best 225 lb × 3 .*· last 185 lb × 8/);
  assert.equal(memoryLoad(rec), 185);
  assert.equal(memoryLoad({ ...rec, is_bodyweight: true }), null);
  assert.equal(describeRecord(null), null);
  assert.match(describeRecord({ is_bodyweight: true, best_reps: 12, last_reps: 10, last_date: "2026-09-22" }), /Best 12 reps · last 10 reps/);
});
