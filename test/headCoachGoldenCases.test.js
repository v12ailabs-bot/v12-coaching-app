// HC-021 Golden Cases. Per the spec, initial Golden Cases must include:
// stable client -> NO ACTION; one missed workout -> adapt/continue;
// repeated missed workouts -> investigate; technique limitation -> no
// automatic progression; apparent plateau with insufficient data; confirmed
// plateau; safety signal; missing consequential data; conflicting evidence;
// previous intervention; coach override; stale recommendation; unauthorized
// action; prompt injection; service boundary; no-action stability.
//
// This file automates exactly the subset of those that are genuinely
// deterministic -- testable with a fixed input and one correct output, no
// live model call needed. Several of the spec's named cases are NOT
// deterministic by nature (they require the AI's own qualitative judgment
// from evidence -- "one missed workout -> adapt/continue," "technique
// limitation," "confirmed plateau," "conflicting evidence") and are
// intentionally NOT automated here: a real Golden Case suite for those would
// need either a live model call every test run (expensive, slow, and
// non-deterministic -- inappropriate for `npm test`) or a mocked model,
// which this codebase has no infrastructure for. Those were instead
// exercised informally via real, live API calls during HC-011/012/013
// development (see HANDOFF.md) -- this file documents that gap explicitly
// rather than writing a weak test that doesn't actually prove anything.
// "prompt injection" and "service boundary" (cross-client isolation) were
// each verified with one real, one-time live check instead of an automated
// test, for the same reason (see HANDOFF.md HC-021 entry for the result).
//
// No network calls, no database writes -- pure functions only, same
// convention as every other file in this test/ directory. This also rules
// out testing anything that imports api/_lib/supabaseAdmin.js (createTask,
// applyCoachDecision, recordOutcome, etc.) here: that module constructs its
// Supabase client unconditionally at import time from
// SUPABASE_URL/SUPABASE_SERVICE_KEY, so merely importing it throws under
// plain `npm test` (no .env loaded) regardless of whether any DB call is
// actually made. "coach override" and "stale recommendation" (the guard
// clauses in headCoachApproval.ts) are exactly this shape -- verified via
// real, live testing during HC-015 development instead (see HANDOFF.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRules } from "../api/_lib/headCoachRuleEngine.ts";
import { applySafetyGate } from "../api/_lib/headCoachSafetyGate.ts";
import { validateReviewCheckInOutput } from "../api/_lib/headCoachOutputValidator.ts";
import { determineAuthority } from "../api/_lib/headCoachAuthorityEngine.ts";

function fakeContext(overrides = {}) {
  return {
    builtAt: new Date().toISOString(),
    methodologyVersion: null,
    client: { id: "test-client", name: "Test Client", email: "t@example.com", role: "client", clientType: "coaching", goal: "fat loss", age: null, sex: null, assessment: { nervousSystemRecruitment: null, muscularDensityToSize: null, metabolicWorkCapacity: null } },
    objective: { goal: { id: "g1", direction: "decrease", baseline_value: 200, target_value: 180 }, currentValue: 195, series: [{ date: "2026-09-01", value: 195 }] },
    milestones: [],
    activeProgram: null,
    activePhase: null,
    recentPerformance: { windowDays: 30, strengthTrends: [], trainingConsistencyPct: 90 },
    nutrition: { windowDays: 30, plan: null, adherencePct: 70 },
    recentCheckins: { windowDays: 30, daily: [{ id: "c1", date: "2026-09-20" }], weekly: [] },
    constraints: { programDescription: null, programGoal: null, experienceLevel: null, recentCoachNotes: [] },
    openAlerts: [],
    atRiskLevel: "On Track",
    recentInterventions: [],
    applicableRules: [],
    authority: null,
    ...overrides,
  };
}

const validOutput = () => ({
  status: "recommend", observation: "o", interpretation: "i", recommendation: "r", rationale: "ra",
  authority: "L1", expected_response: "e", review_condition: "c",
  evidence: ["fact"], competing_hypotheses: [], options: [],
  confidence: 0.75, confidence_level: "high",
  limiting_factor: null, client_communication_needed: false, communication_draft: null,
});
const genFor = (output) => ({ output, raw: JSON.stringify(output), parseError: null, model: "test", modelVersion: "test", usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 });

test("Golden Case: stable client -> proceed (no rules fire, gate lets it continue)", () => {
  const result = evaluateRules("REVIEW_CHECK_IN", fakeContext());
  assert.equal(result.verdict, "proceed");
  const gate = applySafetyGate(result);
  assert.equal(gate.decision, "proceed_to_reasoning");
});

test("Golden Case: missing consequential data -> NO ACTION, never reaches AI reasoning", () => {
  const ctx = fakeContext({ recentCheckins: { windowDays: 30, daily: [], weekly: [] } });
  const result = evaluateRules("REVIEW_CHECK_IN", ctx);
  assert.equal(result.verdict, "no_action");
  assert.match(result.verdictReason, /missing_consequential_data/);
  const gate = applySafetyGate(result);
  assert.equal(gate.decision, "close_no_action");
});

test("Golden Case: no active objective -> NO ACTION", () => {
  const ctx = fakeContext({ objective: null, recentCheckins: { windowDays: 30, daily: [], weekly: [] } });
  const result = evaluateRules("REVIEW_CHECK_IN", ctx);
  // Both validation rules fire here; missing_consequential_data (priority
  // 10) must win over no_active_objective (priority 11) -- also a
  // regression check on priority ordering, not just this one case.
  assert.equal(result.verdict, "no_action");
  assert.match(result.verdictReason, /missing_consequential_data/);
});

test("Golden Case: safety signal (High risk) -> escalate, never reaches AI reasoning", () => {
  const ctx = fakeContext({ atRiskLevel: "High" });
  const result = evaluateRules("REVIEW_CHECK_IN", ctx);
  assert.equal(result.verdict, "escalate");
  assert.match(result.verdictReason, /high_risk_escalate/);
  const gate = applySafetyGate(result);
  assert.equal(gate.decision, "escalate");
});

test("Golden Case: repeated issues / at-risk flagged (Medium/Low risk) -> surfaced for the coach, not forced escalation", () => {
  const ctx = fakeContext({ atRiskLevel: "Medium", openAlerts: [{ label: "Goal off track", tone: "amber" }] });
  const result = evaluateRules("REVIEW_CHECK_IN", ctx);
  assert.equal(result.verdict, "proceed");
  assert.match(result.verdictReason, /at_risk_flagged/);
});

test("Golden Case: milestone achieved -> surfaced advisory, not forced", () => {
  const ctx = fakeContext({ milestones: [{ baseline_value: 100, target_value: 150, direction: "increase", current_value: 155 }] });
  const result = evaluateRules("REVIEW_CHECK_IN", ctx);
  assert.equal(result.verdict, "proceed");
  assert.match(result.verdictReason, /milestone_achieved/);
});

test("Golden Case: no-action stability -- the same context always produces the same verdict", () => {
  const ctx = fakeContext();
  const first = evaluateRules("REVIEW_CHECK_IN", ctx);
  const second = evaluateRules("REVIEW_CHECK_IN", ctx);
  assert.deepEqual(first.verdict, second.verdict);
  assert.deepEqual(first.outcomes, second.outcomes);
});

test("Golden Case: unauthorized action -- AI attempting to claim more authority than the backend allows is clamped, not trusted", () => {
  const det = determineAuthority("REVIEW_CHECK_IN", [], "L4");
  assert.equal(det.backendAuthority, "L1"); // REVIEW_CHECK_IN's task-type ceiling, MVP has no action executor
  assert.equal(det.overridden, true);
});

test("Golden Case: unauthorized action -- an unknown task type defaults to the most conservative authority", () => {
  const det = determineAuthority("SOME_FUTURE_TASK_TYPE", [], "L1");
  assert.equal(det.backendAuthority, "L0");
});

test("Regression (found during HC-013): multiple simultaneously-fired rules use the MOST restrictive authority ceiling, not the most permissive", () => {
  const mixedFiredRules = [
    { ruleId: "fake_l0_rule", version: 1, category: "validation", authority: "L0", status: "fired" },
    { ruleId: "fake_l1_rule", version: 1, category: "advisory", authority: "L1", status: "fired" },
  ];
  const det = determineAuthority("REVIEW_CHECK_IN", mixedFiredRules, "L1");
  assert.equal(det.backendAuthority, "L0");
});

test("Output Validator: a valid, non-escalating output passes cleanly", () => {
  const result = validateReviewCheckInOutput(genFor(validOutput()), []);
  assert.equal(result.valid, true);
  assert.equal(result.requiresEscalation, false);
});

test("Output Validator: requiresEscalation is tracked independently of overall validity (a clean output that says escalate still requires it)", () => {
  const result = validateReviewCheckInOutput(genFor({ ...validOutput(), status: "escalate" }), []);
  assert.equal(result.valid, true);
  assert.equal(result.requiresEscalation, true);
});

test("Output Validator: a JSON parse failure fails at the json stage, no escalation claim possible", () => {
  const result = validateReviewCheckInOutput({ output: null, raw: "not json", parseError: "Unexpected token", model: "t", modelVersion: "t", usage: {}, latencyMs: 1 }, []);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].stage, "json");
  assert.equal(result.requiresEscalation, false);
});

test("Output Validator: missing a required field fails at the schema stage", () => {
  const result = validateReviewCheckInOutput(genFor({ ...validOutput(), observation: "" }), []);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].stage, "schema");
});

test("Output Validator: an invalid enum value fails at the enums stage", () => {
  const result = validateReviewCheckInOutput(genFor({ ...validOutput(), status: "maybe" }), []);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].stage, "enums");
});

test("Output Validator: a recommend/escalate status with no cited evidence fails at the evidence stage", () => {
  const result = validateReviewCheckInOutput(genFor({ ...validOutput(), evidence: [] }), []);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].stage, "evidence");
});

test("Output Validator: authority exceeding what fired rules permit fails at the rules stage", () => {
  const firedL0Rule = [{ ruleId: "fake_rule", version: 1, category: "validation", authority: "L0", status: "fired" }];
  const result = validateReviewCheckInOutput(genFor({ ...validOutput(), authority: "L1" }), firedL0Rule);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].stage, "rules");
});

test("Output Validator: confidence_level inconsistent with the numeric confidence fails at the fabrication stage", () => {
  const result = validateReviewCheckInOutput(genFor({ ...validOutput(), confidence_level: "high", confidence: 0.2 }), []);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].stage, "fabrication");
});
