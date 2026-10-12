import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPhase, MIN_SCHEDULED_SESSIONS } from "../../src/lib/phaseAssessment.js";

// Phase = weeks 1-4 of a program starting 2026-01-05 -> window 2026-01-05..2026-02-01.
const phase = (criteria = []) => ({ phase: "Foundation", week_start: 1, week_end: 4, exit_criteria: criteria });
const day = (n, w) => ({ date: `2026-01-${String(5 + n).padStart(2, "0")}`, workout: w });
const sessions = (completed, missed) => [...Array.from({ length: completed }, (_, i) => day(i, "completed")), ...Array.from({ length: missed }, (_, i) => day(completed + i, "missed"))];
const crit = (...s) => s.map((status, i) => ({ label: "c" + i, status }));
const A = (over) => assessPhase({ phase: phase(), programStart: "2026-01-05", today: new Date(2026, 0, 20), daily: [], ...over });

test("no dates / no program start -> not assessable, never a guess", () => {
  assert.equal(assessPhase({ phase: { week_start: null }, programStart: "2026-01-05" }).status, "not_assessable");
  assert.equal(A({ programStart: null }).status, "not_assessable");
});

test("before the phase starts -> not_started", () => {
  assert.equal(A({ today: new Date(2026, 0, 1) }).status, "not_started");
});

test("all exit criteria complete -> ready to advance, and says so when it's early", () => {
  const r = A({ phase: phase(crit("complete", "complete")), daily: sessions(8, 0) });
  assert.equal(r.status, "ready_to_advance");
  assert.match(r.reasons.join(" "), /early/);
  assert.equal(r.advisory, true);
});

test("N/A criteria are excluded; an all-N/A or empty set can never be 'complete'", () => {
  assert.equal(A({ phase: phase(crit("complete", "na")), daily: sessions(8, 0) }).status, "ready_to_advance");
  assert.notEqual(A({ phase: phase(crit("na", "na")), daily: sessions(8, 0) }).status, "ready_to_advance");
  assert.notEqual(A({ phase: phase([]), daily: sessions(8, 0) }).status, "ready_to_advance");
});

test("too little training data -> insufficient_data, not a verdict", () => {
  const r = A({ phase: phase(crit("incomplete")), daily: sessions(MIN_SCHEDULED_SESSIONS - 1, 0) });
  assert.equal(r.status, "insufficient_data");
});

test("mid-phase: strong adherence = on_track, middling = watch, low = behind", () => {
  assert.equal(A({ phase: phase(crit("incomplete")), daily: sessions(9, 1) }).status, "on_track");
  assert.equal(A({ phase: phase(crit("incomplete")), daily: sessions(3, 1) }).status, "watch");   // 75%
  assert.equal(A({ phase: phase(crit("incomplete")), daily: sessions(3, 3) }).status, "behind");  // 50%
});

test("phase ended, criteria incomplete: good adherence -> review the programming; poor -> hold", () => {
  const ended = { today: new Date(2026, 1, 10) };
  assert.equal(A({ ...ended, phase: phase(crit("complete", "incomplete")), daily: sessions(9, 1) }).status, "review");
  assert.equal(A({ ...ended, phase: phase(crit("incomplete")), daily: sessions(4, 4) }).status, "hold");
});

test("time passing alone never completes anything; sessions outside the phase window are ignored", () => {
  const outside = [{ date: "2025-12-01", workout: "completed" }, { date: "2026-03-01", workout: "completed" }];
  const r = A({ today: new Date(2026, 1, 10), phase: phase(crit("incomplete")), daily: outside });
  assert.equal(r.status, "insufficient_data");
  assert.equal(r.evidence.criteriaDone, 0);
});

test("evidence is reported alongside the recommendation", () => {
  const r = A({ phase: phase(crit("incomplete")), daily: sessions(9, 1) });
  assert.equal(r.evidence.trainingPct, 90);
  assert.equal(r.evidence.scheduledSessions, 10);
  assert.equal(r.evidence.criteriaTotal, 1);
  assert.match(r.reasons.join(" "), /9 of 10/);
});
