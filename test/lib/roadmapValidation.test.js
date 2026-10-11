import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRoadmap, suggestNextWeeks } from "../../src/lib/roadmapValidation.js";

const row = (phase, s, e) => ({ phase, week_start: s, week_end: e });

test("clean, contiguous roadmap has no errors or warnings", () => {
  const r = validateRoadmap([row("A", 1, 4), row("B", 5, 8)], { programWeeks: 12 });
  assert.deepEqual(r, { errors: [], warnings: [] });
});

test("overlap is an error and names both phases", () => {
  const r = validateRoadmap([row("A", 1, 4), row("B", 4, 8)]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /overlaps/);
});

test("end before start is an error", () => {
  const r = validateRoadmap([row("A", 5, 2)]);
  assert.match(r.errors[0].message, /before it starts/);
});

test("half-dated phase is an error; undated is only a warning", () => {
  assert.equal(validateRoadmap([row("A", 1, "")]).errors.length, 1);
  const r = validateRoadmap([row("A", "", "")]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 1);
});

test("gap and out-of-order are warnings, beyond-program is a warning", () => {
  assert.match(validateRoadmap([row("A", 1, 2), row("B", 5, 6)]).warnings[0].message, /Gap/);
  assert.match(validateRoadmap([row("A", 5, 6), row("B", 1, 2)]).warnings[0].message, /before/);
  assert.match(validateRoadmap([row("A", 1, 14)], { programWeeks: 12 }).warnings[0].message, /past the program/);
});

test("duplicate names are an error (case-insensitive); blank rows are ignored", () => {
  assert.equal(validateRoadmap([row("Strength", 1, 2), row("strength", 3, 4)]).errors.length, 1);
  assert.deepEqual(validateRoadmap([row("", "", ""), row("A", 1, 2)]), { errors: [], warnings: [] });
});

test("suggestNextWeeks starts after the last end and never mutates", () => {
  const rows = [row("A", 1, 4), row("B", 5, 8)];
  assert.deepEqual(suggestNextWeeks(rows, 4), { week_start: 9, week_end: 12 });
  assert.deepEqual(suggestNextWeeks([], 4), { week_start: 1, week_end: 4 });
});

test("overlap/duplicate are non-blocking conflicts; invalid weeks block", () => {
  assert.equal(validateRoadmap([row("A", 1, 4), row("B", 3, 6)]).errors[0].blocking, false);
  assert.equal(validateRoadmap([row("A", 1, 2), row("a", 3, 4)]).errors[0].blocking, false);
  assert.notEqual(validateRoadmap([row("A", 5, 2)]).errors[0].blocking, false);
});
