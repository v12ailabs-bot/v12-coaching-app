import type { RuleEngineResult } from "./headCoachRuleEngine.ts";

// HC-009 Safety Gate. Per the pipeline in this effort's own spec, safety
// sits BEFORE the AI reasoning step: "safety must override normal coaching
// optimization" and "meaningful safety uncertainty must escalate rather
// than being optimized around." HC-008's Rule Engine already implements
// "safety evaluated before optimization" internally (safety-category rules
// have the lowest priority numbers and win the verdict); this module is the
// distinct piece that ACTS on that verdict -- deciding whether the task is
// even allowed to continue toward AI reasoning at all.
//
// This is deliberately NOT itself a rule evaluator (that's HC-008) and NOT
// itself the AI reasoning step (that's HC-010/HC-011, not built yet). It's
// the checkpoint: a "no_action" or "escalate" verdict means the task is
// fully resolved right here and NEVER reaches an AI call, "proceed" means
// there is no safety objection and the task is left exactly as HC-008 left
// it (READY), since there is nothing built yet for it to proceed TO.

export type SafetyGateDecision = "close_no_action" | "escalate" | "proceed_to_reasoning";

export interface SafetyGateResult {
  decision: SafetyGateDecision;
  reason: string;
}

export function applySafetyGate(ruleResult: RuleEngineResult): SafetyGateResult {
  if (ruleResult.verdict === "escalate") {
    return { decision: "escalate", reason: ruleResult.verdictReason };
  }
  if (ruleResult.verdict === "no_action") {
    return { decision: "close_no_action", reason: ruleResult.verdictReason };
  }
  return { decision: "proceed_to_reasoning", reason: ruleResult.verdictReason };
}
