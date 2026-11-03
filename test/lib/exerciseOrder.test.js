import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByDay } from "../../src/lib/constants.js";

// Exercises that tie on phase + order_index used to come out in whatever order the database
// returned them, so the list reshuffled after any row update.
const ex = (id, name, o = {}) => ({ id, name, day_of_week: "Monday", section: "Accessories", order_index: 3, created_at: `2026-10-0${id}T00:00:00Z`, ...o });
const rows = [ex(1, "Curl"), ex(2, "Row"), ex(3, "Fly"), ex(4, "Lunge", { order_index: 1 })];
const names = (list) => groupByDay(list)[0].exercises.map((e) => e.name);

test("tied exercises keep one fixed order regardless of the order rows arrive in", () => {
  const expected = names(rows);
  assert.deepEqual(expected, ["Lunge", "Curl", "Row", "Fly"]);
  for (const shuffled of [[...rows].reverse(), [rows[2], rows[0], rows[3], rows[1]], [rows[1], rows[3], rows[2], rows[0]]]) assert.deepEqual(names(shuffled), expected);
});
test("position and phase still win over the tie-break", () => {
  const out = names([ex(1, "Late", { order_index: 9 }), ex(2, "Early", { order_index: 0 }), ex(3, "Warm", { section: "Warm-Up", order_index: 5 })]);
  assert.deepEqual(out, ["Warm", "Early", "Late"]);
});
