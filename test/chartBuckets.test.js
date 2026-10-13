import test from "node:test";
import assert from "node:assert/strict";
import { bucketSeries, pickTicks, maxLabelsFor } from "../src/lib/chartBuckets.js";

const TODAY = "2026-10-14"; // Wednesday

test("7D is one point per day and skips empty days", () => {
  const rows = [{ date: "2026-10-12", w: 180 }, { date: "2026-10-13", w: null }, { date: "2026-10-14", w: 182 }, { date: "2026-10-01", w: 999 }];
  const p = bucketSeries(rows, ["w"], "7D", TODAY);
  assert.deepEqual(p.map((x) => [x.label, x.w, x.n_w]), [["10-12", 180, 1], ["10-14", 182, 1]]);
});

test("30D averages per Sunday-start week using only real entries", () => {
  const rows = [{ date: "2026-10-04", w: 100 }, { date: "2026-10-06", w: 110 }, { date: "2026-10-07", w: null }, { date: "2026-10-12", w: 120 }];
  const p = bucketSeries(rows, ["w"], "30D", TODAY);
  assert.equal(p.length, 2);
  assert.equal(p[0].label, "Oct 4-10");
  assert.equal(p[0].w, 105);
  assert.equal(p[0].n_w, 2); // the null day is not a zero
  assert.equal(p[1].label, "Oct 11-17");
});

test("week label spanning months", () => {
  const p = bucketSeries([{ date: "2026-09-30", w: 1 }], ["w"], "30D", TODAY);
  assert.equal(p[0].label, "Sep 27-Oct 3");
});

test("3M and All are monthly", () => {
  const rows = [{ date: "2026-08-02", w: 10 }, { date: "2026-08-20", w: 20 }, { date: "2026-10-01", w: 30 }, { date: "2025-01-05", w: 5 }];
  const m = bucketSeries(rows, ["w"], "3M", TODAY);
  assert.deepEqual(m.map((x) => [x.label, x.w, x.n_w]), [["Aug", 15, 2], ["Oct", 30, 1]]);
  assert.equal(bucketSeries(rows, ["w"], "All", TODAY).length, 3);
});

test("multiple keys keep independent counts", () => {
  const p = bucketSeries([{ date: "2026-10-14", a: 1, b: null }, { date: "2026-10-13", a: 3, b: 4 }], ["a", "b"], "30D", TODAY);
  assert.equal(p[0].n_a, 2); assert.equal(p[0].n_b, 1);
});

test("ticks: at most 6, include ends, none duplicate", () => {
  const pts = Array.from({ length: 365 }, (_, i) => ({ key: "k" + i, label: "Oct" }));
  const t = pickTicks(pts, 6);
  assert.equal(t.length, 6); assert.equal(t[0], "k0"); assert.equal(t[5], "k364");
  assert.equal(pickTicks(pts.slice(0, 4), 6).length, 4);
  assert.ok(maxLabelsFor(300, [{ label: "Sep 27-Oct 3" }]) <= 6);
  assert.ok(maxLabelsFor(300, [{ label: "Sep 27-Oct 3" }]) * (12 * 6.2) < 300);
});
