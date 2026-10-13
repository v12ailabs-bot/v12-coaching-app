import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadmapCheckins, suggestReminder, timingText } from "../src/lib/roadmapCheckins.js";

test("merges a client's checkpoint and phase into one row, most overdue first", () => {
  const cps = [{ clientId: "a", label: "Reassessment", daysUntil: -2 }, { clientId: "b", label: "Goal review", daysUntil: 3 }];
  const ph = [{ clientId: "a", phase: "Base", daysUntilEnd: -5, nextPhase: "Build" }];
  const rows = buildRoadmapCheckins(cps, ph);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].clientId, "a");
  assert.equal(rows[0].kind, "both");
  assert.equal(rows[0].days, -5);
  assert.equal(rows[1].kind, "checkpoint");
});

test("a reviewed phase is hidden until the phase changes", () => {
  const ph = [{ clientId: "a", phase: "Base", daysUntilEnd: 1 }];
  assert.equal(buildRoadmapCheckins([], ph, { a: { reviewed_phase: "Base" } }).length, 0);
  assert.equal(buildRoadmapCheckins([], ph, { a: { reviewed_phase: "Foundation" } }).length, 1);
});

test("suggestion and timing text", () => {
  const row = { checkpoints: [{ label: "Reassessment" }], phase: { phase: "Base", nextPhase: "Build" } };
  assert.equal(suggestReminder(row, [{ action: "replace", from: "Leg press", to: "Squat" }]), "Run the Reassessment check; Move to Build (replace Leg press → Squat)");
  assert.equal(timingText(-3), "3d overdue");
  assert.equal(timingText(0, true), "ends today");
});
