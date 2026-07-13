import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY ||= "test-key";
const { clientProfileBlock } = await import("../api/_lib/anthropic.js");

// Verifies the previously-blind intake fields now reach the AI prompt.
test("newly-wired intake fields surface in the client profile block", () => {
  const block = clientProfileBlock({
    name: "Sam",
    goal: "Fat loss",
    age: "34",
    current_weight: "205 lbs",
    target_change: -20,
    activity_level: "mostly seated",
    sleep_hours: "5-6",
    training_tenure: "1-2 years",
    home_equipment: "dumbbells, resistance bands",
    nutrition_consistency: "Inconsistent",
    coaching_style: "Supportive",
    commitment_level: 6,
    confidence: "5",
    past_barriers: "time constraints, consistency",
    past_struggles: "fell off after week 3 before",
    why_now: "wedding in the fall",
  });

  assert.match(block, /Age: 34/);
  assert.match(block, /Current Bodyweight: 205 lbs/);
  assert.match(block, /Target Change: -20 lbs/);
  assert.match(block, /Daily Activity Level.*mostly seated/);
  assert.match(block, /Average Sleep Per Night: 5-6/);
  assert.match(block, /Training Tenure.*1-2 years/);
  assert.match(block, /Home-Gym Equipment.*dumbbells, resistance bands/);
  assert.match(block, /Nutrition Consistency: Inconsistent/);
  assert.match(block, /Coaching Style Preference: Supportive/);
  assert.match(block, /Self-Rated Commitment \(1-10\): 6/);
  assert.match(block, /Confidence to Follow a 12-Week Program \(1-10\): 5/);
  assert.match(block, /Past Barriers to Progress: time constraints, consistency/);
  assert.match(block, /Past Struggles.*fell off after week 3/);
  assert.match(block, /Why Now \/ Motivation: wedding in the fall/);
});

test("missing intake fields degrade gracefully (no undefined/NaN leaks)", () => {
  const block = clientProfileBlock({ name: "Sam", goal: "Strength" });
  assert.doesNotMatch(block, /undefined|NaN|\bnull\b/);
  assert.match(block, /Age: Not specified/);
  assert.match(block, /Target Change: Not specified/);
});
