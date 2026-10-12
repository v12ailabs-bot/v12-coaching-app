import { RULE_REGISTRY_VERSION, rulesFor,           } from "./headCoachRules.js";
                                                                     

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

                                                                     

                              
                 
                  
                             
                               
                                                                     
                 
 

                                   
                              
                           
                                                                          
                             
                        
 

function hasRequiredData(context                  , path        )          {
  const value = path.split(".").reduce((acc     , key) => (acc == null ? undefined : acc[key]), context       );
  return value !== undefined;
}

const asVerdictActions = (rule      , failureBehavior         )           =>
  failureBehavior ? [rule.failureBehavior === "escalate" ? "escalate" : "no_action"] : rule.allowedActions;

export function evaluateRules(trigger                 , context                  )                   {
  const rules = rulesFor(trigger);
  const outcomes                = [];
  // Priority-ordered (rules already are); only entries that actually
  // matter for the verdict (fired, or failed with a non-proceed
  // failure_behavior) go here.
  const verdictCandidates                                      = [];

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

    let fired         ;
    try {
      fired = rule.condition(context);
    } catch (e     ) {
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
  let verdict                    = "proceed";
  if (top.actions.includes("escalate")) verdict = "escalate";
  else if (top.actions.length === 1 && top.actions[0] === "no_action") verdict = "no_action";

  return { ruleRegistryVersion: RULE_REGISTRY_VERSION, trigger, outcomes, verdict, verdictReason: `${top.rule.ruleId} (${top.rule.category})` };
}
