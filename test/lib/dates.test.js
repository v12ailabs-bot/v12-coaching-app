import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinBackdateWindow, weekStartStr, isWithinWeeklyBackdateWindow, rangeStartStr } from "../../src/lib/dates.js";

test("isWithinBackdateWindow: within 7 days back is allowed, beyond is not, future is not", () => {
  assert.equal(isWithinBackdateWindow("2026-09-25", 7, "2026-10-01"), true, "exactly 6 days back");
  assert.equal(isWithinBackdateWindow("2026-09-24", 7, "2026-10-01"), true, "exactly 7 days back");
  assert.equal(isWithinBackdateWindow("2026-09-23", 7, "2026-10-01"), false, "8 days back is outside the window");
  assert.equal(isWithinBackdateWindow("2026-10-01", 7, "2026-10-01"), true, "today is always allowed");
  assert.equal(isWithinBackdateWindow("2026-10-02", 7, "2026-10-01"), false, "future date is never allowed");
});

test("weekStartStr: Sunday of the week containing the given date", () => {
  assert.equal(weekStartStr("2026-10-01"), "2026-09-27", "Thursday Oct 1 2026 -> Sunday Sep 27");
  assert.equal(weekStartStr("2026-09-27"), "2026-09-27", "a Sunday maps to itself");
});

test("isWithinWeeklyBackdateWindow: current or immediately preceding week only", () => {
  const today = "2026-10-01"; // Thursday, current week starts 2026-09-27
  assert.equal(isWithinWeeklyBackdateWindow("2026-09-27", today), true, "current week");
  assert.equal(isWithinWeeklyBackdateWindow("2026-09-20", today), true, "immediately preceding week");
  assert.equal(isWithinWeeklyBackdateWindow("2026-09-13", today), false, "two weeks back is not allowed");
  assert.equal(isWithinWeeklyBackdateWindow("2026-10-04", today), false, "a future week-start is not allowed");
});

test("rangeStartStr: All has no lower bound, named ranges compute a start date", () => {
  assert.equal(rangeStartStr("All", "2026-10-01"), null);
  assert.equal(rangeStartStr("30D", "2026-10-01"), "2026-09-01");
  assert.equal(rangeStartStr("unknown-range", "2026-10-01"), null, "unrecognized range falls back to no bound, not a crash");
});
