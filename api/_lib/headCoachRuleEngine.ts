import { RULE_REGISTRY_VERSION, rulesFor, type Rule } from "./headCoachRules.ts";
import type { HeadCoachContext } from "./headCoachContextBuilder.ts";

// HC-008 Rule Engine -- actually evaluates HC-007's registry against a real
// context. The registry only defines rules; this is the only place they get
// run. Rules are already priority-sorted safety-first by rulesFor(), so the
// verdict is driven by the highest-priority rule that actually fired (or
// failed to evaluate) -- this is what implements "safety is evaluated
// before normal optimization."
//
// requiredData/failure_behavior are evaluated defensively but are not
// currently reachable in practice: buildReviewCheckInContext (HC-006) is
// all-or-nothing -- if any accessor throws, the whole context build throws
// before a Rule Engine ever sees it, so every field that DOES reach here is
// always fully populated (possibly null as a legitimate business value,
// e.g. objective, but never technically "missing"). This still matters if
// Context Builder ever becomes partial/best-effort later.

export type RuleEngineVerdict = "proceed" | "no_action" | "escalate";

export interface RuleOutcome {
  ruleId: string;
  version: number;
  category: Rule["category"];
  authority: Rule["authority"];
  status: "fired" | "not_fired" | "data_missing" | "condition_error";
  error?: string;
}

export interface RuleEngineResult {
  ruleRegistryVersion: string;
  trigger: Rule["trigger"];
  outcomes: RuleOutcome[]; // every considered active rule, priority order
  verdict: RuleEngineVerdict;
  verdictReason: string;
}

function hasRequiredData(context: HeadCoachContext, path: string): boolean {
  const value = path.split(".").reduce((acc: any, key) => (acc == null ? undefined : acc[key]), context as any);
  return value !== undefined;
}

const asVerdictActions = (rule: Rule, failureBehavior: boolean): string[] =>
  failureBehavior ? [rule.failureBehavior === "escalate" ? "escalate" : "no_action"] : rule.allowedActions;

export function evaluateRules(trigger: Rule["trigger"], context: HeadCoachContext): RuleEngineResult {
  const rules = rulesFor(trigger);
  const outcomes: RuleOutcome[] = [];
  // Priority-ordered (rules already are); only entries that actually
  // matter for the verdict (fired, or failed with a non-proceed
  // failure_behavior) go here.
  const verdictCandidates: { rule: Rule; actions: string[] }[] = [];

  for (const rule of rules) {
    const missing = rule.requiredData.filter((path) => !hasRequiredData(context, path));
    if (missing.length) {
      outcomes.push({ ruleId: rule.ruleId, version: rule.version, category: rule.category, authority: rule.authority, status: "data_missing", error: `missing: ${missing.join(", ")}` });
      if (rule.failureBehavior === "task_failure") {
        throw new Error(`Rule ${rule.ruleId}: required data missing (${missing.join(", ")}) and failure_behavior is task_failure.`);
      }
      verdictCandidates.push({ rule, actions: asVerdictActions(rule, true) });
      continue;
    }

    let fired: boolean;
    try {
      fired = rule.condition(context);
    } catch (e: any) {
      outcomes.push({ ruleId: rule.ruleId, version: rule.version, category: rule.category, authority: rule.authority, status: "condition_error", error: e?.message ?? String(e) });
      if (rule.failureBehavior === "task_failure") {
        throw new Error(`Rule ${rule.ruleId}: condition threw (${e?.message ?? e}) and failure_behavior is task_failure.`);
      }
      verdictCandidates.push({ rule, actions: asVerdictActions(rule, true) });
      continue;
    }

    outcomes.push({ ruleId: rule.ruleId, version: rule.version, category: rule.category, authority: rule.authority, status: fired ? "fired" : "not_fired" });
    if (fired) verdictCandidates.push({ rule, actions: rule.allowedActions });
  }

  if (!verdictCandidates.length) {
    return { ruleRegistryVersion: RULE_REGISTRY_VERSION, trigger, outcomes, verdict: "proceed", verdictReason: "No rules fired." };
  }

  const top = verdictCandidates[0]; // already priority-sorted, so this is the highest-priority match
  let verdict: RuleEngineVerdict = "proceed";
  if (top.actions.includes("escalate")) verdict = "escalate";
  else if (top.actions.length === 1 && top.actions[0] === "no_action") verdict = "no_action";

  return { ruleRegistryVersion: RULE_REGISTRY_VERSION, trigger, outcomes, verdict, verdictReason: `${top.rule.ruleId} (${top.rule.category})` };
}
