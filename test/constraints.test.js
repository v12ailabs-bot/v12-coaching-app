import { test } from "node:test";
import assert from "node:assert/strict";

// anthropic.js constructs the SDK client at import time; give it a dummy key and
// import dynamically so this unit test never needs a real API key or network.
process.env.ANTHROPIC_API_KEY ||= "test-key";
const { constraintBlock } = await import("../api/_lib/anthropic.js");

test("no flags -> empty block (prompt unchanged for unflagged clients)", () => {
  assert.equal(constraintBlock({}), "");
  assert.equal(constraintBlock({ injury_flags: null, health_flags: "" }), "");
});

test("checked injury -> hard, non-negotiable AVOID rule with substitution", () => {
  const block = constraintBlock({ injury_flags: "Knee" });
  assert.match(block, /NON-NEGOTIABLE/);
  assert.match(block, /OVERRIDES the\s+template/i);
  assert.match(block, /AVOID .*jump squats|box jumps|deep barbell back squats/i);
  assert.match(block, /SUBSTITUTE/);
});

test("multiple flags + label variants (case / suffix) all resolve", () => {
  const block = constraintBlock({
    injury_flags: "knee, Lower back",
    health_flags: "High Blood Pressure",
  });
  assert.match(block, /Injury "knee"/);
  assert.match(block, /Injury "lower back"/);
  assert.match(block, /axial spinal loading/i);          // lower-back rule fired
  assert.match(block, /Health flag "high blood pressure"/);
  assert.match(block, /Valsalva/i);                       // BP rule fired
});

test("unknown flag still becomes a conservative constraint, never passed through blind", () => {
  const block = constraintBlock({ injury_flags: "Tailbone" });
  assert.match(block, /Injury "tailbone"/);
  assert.match(block, /avoid any exercise that loads or aggravates/i);
});
