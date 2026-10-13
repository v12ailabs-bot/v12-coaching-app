import test from "node:test";
import assert from "node:assert/strict";
import { sessionsOnDate, timeLabel, repeatLabel } from "../src/lib/coachSessions.js";

test("recurring and one-off sessions land on the right day, sorted by time", () => {
  // 2026-10-12 is a Monday
  const s = [
    { id: 1, start_time: "17:00:00", weekdays: [1, 3, 5] },
    { id: 2, start_time: "09:30:00", weekdays: [1] },
    { id: 3, start_time: "08:00:00", session_date: "2026-10-12" },
    { id: 4, start_time: "08:00:00", weekdays: [2] },
    { id: 5, start_time: "07:00:00", session_date: "2026-10-13" },
  ];
  assert.deepEqual(sessionsOnDate(s, "2026-10-12").map((x) => x.id), [3, 2, 1]);
});

test("labels", () => {
  assert.equal(timeLabel("09:30:00"), "9:30 am");
  assert.equal(timeLabel("12:05"), "12:05 pm");
  assert.equal(repeatLabel({ weekdays: [5, 1, 3] }), "Mon/Wed/Fri");
});
