import { test } from "node:test";
import assert from "node:assert/strict";
import { METRIC_DEFINITIONS } from "../../src/lib/metricDefinitions.js";

test("every metric definition points at a real exported function and carries its full definition", async () => {
  assert.ok(METRIC_DEFINITIONS.length >= 12);
  const ids = new Set();
  for (const m of METRIC_DEFINITIONS) {
    assert.ok(!ids.has(m.id), "duplicate id " + m.id); ids.add(m.id);
    for (const k of ["name", "definition", "formula", "window", "needs", "missing"]) assert.ok(m[k] && String(m[k]).length > 5, `${m.id}.${k}`);
    assert.ok(m.source?.length, m.id + " has no source");
    for (const s of m.source) {
      const mod = await import("../../" + s.file);
      assert.equal(typeof mod[s.fn], "function", `${m.id}: ${s.file} does not export ${s.fn}`);
    }
  }
});

test("no definition says a missing value counts as zero or success", () => {
  for (const m of METRIC_DEFINITIONS) assert.doesNotMatch(m.missing, /counts? as (a )?(success|hit|on-target)/i, m.id);
});
