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

import { planSnapshot, checkpointWhen } from "../../src/lib/planCheckpoints.js";

test("planSnapshot normalizes blanks so identical content compares equal; checkpointWhen formats days", () => {
  const a = planSnapshot([{ phase: "A", week_start: "1", week_end: "4", exit_criteria: [] }]);
  const b = planSnapshot([{ phase: "A", week_start: 1, week_end: 4, exit_criteria: [], checkpoints: [], planned_changes: [], note: "" }]);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(checkpointWhen({ day: 28 }, null), "Day 28");
  assert.match(checkpointWhen({ day: 28 }, "2026-10-01"), /^Day 28 · /);
  assert.equal(checkpointWhen({}, null), "");
});

import { canonicalJson } from "../../src/lib/planCheckpoints.js";
test("canonicalJson ignores key order (jsonb round-trip) but not values", () => {
  assert.equal(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] }), canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
  assert.notEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
});

import { roadmapStats } from "../../src/lib/roadmapStats.js";
test("roadmapStats: phase week, training, attendance and protein come from the phase window only; no data -> nulls", () => {
  const ph = { week_start: 1, week_end: 4 };
  const daily = [
    { date: "2026-01-05", workout: "completed", protein_g: 100 }, { date: "2026-01-06", workout: "missed", protein_g: 140 },
    { date: "2026-01-07", workout: "completed" }, { date: "2025-12-01", workout: "completed", protein_g: 999 },
  ];
  const r = roadmapStats({ phase: ph, programStart: "2026-01-05", daily, today: new Date(2026, 0, 12) });
  assert.equal(r.phaseWeek, 2);
  assert.equal(r.phaseWeeks, 4);
  assert.equal(r.completed, 2);
  assert.equal(r.scheduled, 3);
  assert.equal(r.attendancePct, 67);
  assert.equal(r.proteinAvg, 120, "average of the two logged days, the out-of-window 999 ignored");
  const empty = roadmapStats({ phase: ph, programStart: "2026-01-05", daily: [], today: new Date(2026, 0, 12) });
  assert.equal(empty.completed, null);
  assert.equal(empty.proteinAvg, null);
  assert.equal(roadmapStats({ phase: ph, programStart: "2026-01-05", daily, today: new Date(2025, 11, 1) }), null, "before the phase starts");
  assert.equal(roadmapStats({ phase: {}, programStart: null, daily }), null);
});

import { mapGeneratedPhases } from "../../src/lib/roadmapMap.js";
test("mapGeneratedPhases: AI phases become editable rows; criteria start incomplete; nothing is assumed", () => {
  const rows = mapGeneratedPhases([{ phase: "Foundation", week_start: 1, week_end: 4, exit_criteria: ["Attendance ≥ 80%", "Technique"] }, {}]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].exit_criteria, [{ label: "Attendance ≥ 80%", status: "incomplete" }, { label: "Technique", status: "incomplete" }]);
  assert.deepEqual([rows[1].phase, rows[1].week_start, rows[1].exit_criteria, rows[1].checkpoints], ["", "", [], []]);
  assert.deepEqual(mapGeneratedPhases(null), []);
});
