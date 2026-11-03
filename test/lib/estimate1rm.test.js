import { test } from "node:test";
import assert from "node:assert/strict";
import { epley, estimateOneRm } from "../../src/lib/estimate1rm.js";

test("Epley and its limits", () => {
  assert.equal(Math.round(epley(200, 5)), 233);
  assert.equal(epley(225, 1), 225);
  for (const [w, r] of [[200, 0], [200, 11], [0, 5], [200, 2.5], [null, 5]]) assert.equal(epley(w, r), null, `${w}x${r}`);
});
test("uses the best recent working set and says what it is based on", () => {
  const r = estimateOneRm([
    { weight: 200, reps: 5, date: "2026-10-12" }, { weight: 215, reps: 3, date: "2026-10-19" },   // 220 vs 236.5
    { weight: 300, reps: 5, date: "2026-10-20", set_type: "warmup" },                            // ignored
    { weight: 100, reps: 20, date: "2026-10-20" },                                                // too many reps
  ], "2026-11-03");
  assert.equal(r.value, 237); assert.deepEqual(r.basedOn, { weight: 215, reps: 3, date: "2026-10-19" }); assert.equal(r.stale, false);
});
test("old sets are only a flagged fallback; nothing usable gives null", () => {
  const old = estimateOneRm([{ weight: 200, reps: 5, date: "2026-01-01" }], "2026-11-03");
  assert.equal(old.stale, true); assert.equal(old.value, 233);
  const recentWins = estimateOneRm([{ weight: 300, reps: 3, date: "2026-01-01" }, { weight: 150, reps: 5, date: "2026-10-30" }], "2026-11-03");
  assert.equal(recentWins.basedOn.weight, 150);
  assert.equal(estimateOneRm([], "2026-11-03"), null);
  assert.equal(estimateOneRm([{ weight: 100, reps: 15, date: "2026-10-30" }], "2026-11-03"), null);
});
