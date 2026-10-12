import { milestoneProgress } from "../../src/lib/milestoneProgress.js";
                                                                     

// HC-007 Rule Registry. Per the owner's decision: this is a versioned,
// code-reviewed TS module, not a DB table -- deploy-gated rules are a
// stronger guarantee than a coach-editable table for something nothing
// should modify at runtime. The AI (HC-011, not built yet) may reason
// WITHIN these rules but may never modify them.
//
// Rule content is deliberately narrow. This project's own instructions are
// explicit that V12's actual methodology/Constitution/Safety Rules are
// canonical and owned by the V12 owner, not something an engineering agent
// invents -- and no such document was available to draw from when this was
// built. So every rule below either (a) formalizes something this codebase
// ALREADY computes deterministically elsewhere (assessClientRisk's risk
// classification, milestoneProgress's achieved detection), reading it
// directly from context rather than re-deriving it (so this can never
// silently diverge from what the coach dashboard already shows), or
// (b) restates a principle this Head Coach effort's own spec already stated
// explicitly (never invent missing data, safety overrides optimization).
// No new clinical/coaching thresholds are invented here. Real V12 safety/
// business rules (e.g. concerning check-in language, specific escalation
// criteria) need the owner's actual methodology input before they can be
// added -- adding them without that would be exactly the "redefining
// methodology" this effort was told not to do.
//
// "never diagnose" and similar always-on behavioral constraints are NOT
// modeled as Rules here -- they're not trigger/condition-shaped, they're a
// structural constraint on the AI's output itself, which belongs in the
// Safety Gate (HC-009) / Prompt Architecture (HC-011), not this registry.

                                                                
                                                                  
                                                           
                                                                            

                       
                 
               
                         
                                                                            
                                                                            
                                                          
                   
                             
                                                                            
                                                    
                           
                                
                     
                         
                  
                     
                                       
                      
 

export const RULE_REGISTRY_VERSION = "2026-09-23.1";

export const RULES         = [
  {
    ruleId: "missing_consequential_data",
    name: "No check-in data in window",
    category: "validation",
    priority: 10,
    trigger: "REVIEW_CHECK_IN",
    requiredData: ["recentCheckins"],
    condition: (ctx) => ctx.recentCheckins.daily.length === 0 && ctx.recentCheckins.weekly.length === 0,
    allowedActions: ["no_action"],
    authority: "L0",
    exceptions: "A brand-new client's very first check-in may itself be the only recent row and would not trigger this.",
    dependencies: [],
    version: 1,
    status: "active",
    failureBehavior: "no_action",
    description: "Directly implements this effort's own 'never invent missing data' principle and 'missing consequential data -> NO_ACTION' Golden Case -- there is nothing to assess without any check-in data in the window.",
  },
  {
    ruleId: "no_active_objective",
    name: "No active weight objective set",
    category: "validation",
    priority: 11,
    trigger: "REVIEW_CHECK_IN",
    requiredData: ["objective"],
    condition: (ctx) => ctx.objective === null,
    allowedActions: ["no_action"],
    authority: "L0",
    exceptions: "Program-only/starter tier clients commonly have no coach-set objective by design -- this is not itself a problem, only a constraint on what can be concluded.",
    dependencies: [],
    version: 1,
    status: "active",
    failureBehavior: "no_action",
    description: "Matches GoalsSection's own empty-state handling -- an AI reasoning step must not claim goal progress against an objective that doesn't exist.",
  },
  {
    ruleId: "high_risk_escalate",
    name: "High risk -- escalate rather than optimize",
    category: "safety",
    priority: 1,
    trigger: "REVIEW_CHECK_IN",
    requiredData: ["atRiskLevel", "openAlerts"],
    condition: (ctx) => ctx.atRiskLevel === "High",
    allowedActions: ["escalate"],
    authority: "L1",
    exceptions: "None defined yet -- if a real exception needs to exist (e.g. a client already under active coach follow-up), the owner must add it explicitly, not have it inferred here.",
    dependencies: [],
    version: 1,
    status: "active",
    failureBehavior: "escalate",
    description: "Restates this effort's own explicit 'safety overrides normal coaching optimization' principle, using the coach dashboard's existing risk scale (assessClientRisk, src/lib/scoring.js) rather than a new threshold invented for this rule -- reads atRiskLevel directly from context instead of re-deriving it, so it can never diverge from what the coach dashboard already shows.",
  },
  {
    ruleId: "at_risk_flagged",
    name: "At-risk flag present (Low/Medium)",
    category: "advisory",
    priority: 20,
    trigger: "REVIEW_CHECK_IN",
    requiredData: ["atRiskLevel", "openAlerts"],
    condition: (ctx) => ctx.atRiskLevel !== null && ctx.atRiskLevel !== "On Track" && ctx.atRiskLevel !== "High",
    allowedActions: ["recommend", "no_action"],
    authority: "L1",
    exceptions: "high_risk_escalate (priority 1) takes precedence when both would otherwise apply -- this rule's condition already excludes High so the two never fire on the same context.",
    dependencies: ["high_risk_escalate"],
    version: 1,
    status: "active",
    failureBehavior: "no_action",
    description: "Low/Medium risk per the same assessClientRisk classification the coach dashboard shows -- worth a recommendation, not a forced escalation.",
  },
  {
    ruleId: "milestone_achieved",
    name: "Exercise milestone achieved",
    category: "advisory",
    priority: 21,
    trigger: "REVIEW_CHECK_IN",
    requiredData: ["milestones"],
    condition: (ctx) => (ctx.milestones || []).some((m     ) => milestoneProgress(m, m.current_value).achieved),
    allowedActions: ["recommend", "no_action"],
    authority: "L1",
    exceptions: "None.",
    dependencies: [],
    version: 1,
    status: "active",
    failureBehavior: "no_action",
    description: "Mirrors MilestonesCard/MilestoneAlertsPanel/CoachHome's existing achieved-detection (milestoneProgress) so a milestone hit surfaces here the same way it already does on the coach dashboard.",
  },
];

// Active rules for a given task type, priority-ordered (safety first). This
// is a lookup helper only -- actually evaluating each rule's condition
// against a real context and recording which ones fired is the Rule
// Engine's job (HC-008, not built yet).
export function rulesFor(trigger                 )         {
  return RULES.filter((r) => r.trigger === trigger && r.status === "active").sort((a, b) => a.priority - b.priority);
}
