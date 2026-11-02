import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPreviousProgramBriefing } from "../api/_lib/previousProgram.js";

const tables = {
  programs: { id: "pg", name: "Foundation", start_date: "2026-10-01", weeks: 12 },
  exercises: [{ id: "e1", name: "Squat", day_of_week: "Monday", sets: 4, reps: "5", is_bodyweight: false }],
  workout_logs: [{ exercise_id: "e1", date: "2026-10-05", weight: 150, reps: 5, sets: 1, set_type: "working" }, { exercise_id: "e1", date: "2026-10-12", weight: 160, reps: 5, sets: 1, set_type: "working" }],
  daily_checkins: [], weekly_checkins: [{ date: "2026-10-26", felt_weaker: "knee ache" }], workout_completions: [], scheduled_workouts: [],
};
const db = (t) => ({ from(name) {
  const q = { select: () => q, eq: () => q, is: () => q, gte: () => q, order: () => q, limit: () => q,
    maybeSingle: () => Promise.resolve({ data: t[name] }),
    then: (res, rej) => Promise.resolve({ data: t[name] }).then(res, rej) };
  return q;
} });

test("loader assembles the briefing from the client's rows", async () => {
  const r = await loadPreviousProgramBriefing(db(tables), { trainingOwnerId: "o", profileId: "c", today: "2026-11-02" });
  assert.equal(r.hasHistory, true);
  assert.match(r.text, /Squat.*150 lb × 5 → 160 lb × 5/);
  assert.match(r.text, /knee ache/);
});

test("loader never throws — a failing query just means no briefing", async () => {
  const broken = { from() { throw new Error("db down"); } };
  const r = await loadPreviousProgramBriefing(broken, { trainingOwnerId: "o", profileId: "c" });
  assert.deepEqual(r, { hasHistory: false, text: null, stats: null });
});
