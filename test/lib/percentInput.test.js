import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePercents } from "../../src/lib/progression/percentInput.js";
import { evaluateProgression } from "../../src/lib/progression/methods.js";
import { verifiedOneRm } from "../../src/lib/strengthRecords.js";

test("parsePercents", () => {
  assert.deepEqual(parsePercents("70, 72.5, 75"), [70, 72.5, 75]);
  assert.deepEqual(parsePercents("70 72.5  75"), [70, 72.5, 75]);
  assert.equal(parsePercents(""), undefined);
  for (const bad of ["70, abc", "0", "120", "-5, 70"]) assert.equal(parsePercents(bad), null, bad);
});
test("a weekly list from the form drives the real calculation", () => {
  const config = { weeklyPercents: parsePercents("70, 72.5, 75"), equipment: "barbell" };
  assert.equal(evaluateProgression("percentage_based", { config, oneRepMax: 200, week: 2 }).recommendedLoad, 145);
});
test("verifiedOneRm only accepts a positive stored number", () => {
  assert.equal(verifiedOneRm({ verified_1rm: "225" }), 225);
  for (const r of [null, {}, { verified_1rm: null }, { verified_1rm: 0 }]) assert.equal(verifiedOneRm(r), null);
});
