import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldLabel } from "../../src/lib/chartLabels.js";

const labelled = (n) => Array.from({ length: n }, (_, i) => i).filter((i) => shouldLabel(i, n));

test("short histories label every point", () => assert.equal(labelled(6).length, 6));
test("long histories are thinned, never overlap the last label, and always include the latest", () => {
  const l = labelled(30);
  assert.ok(l.length <= 9 && l.length >= 5, String(l.length));
  assert.ok(l.includes(29));
  const gaps = l.slice(1).map((v, i) => v - l[i]);
  assert.ok(Math.min(...gaps) >= 2, JSON.stringify(l));
});
