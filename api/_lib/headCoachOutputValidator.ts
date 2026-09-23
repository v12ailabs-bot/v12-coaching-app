import type { ReviewCheckInGenerationResult, ReviewCheckInAiOutput } from "./headCoachReviewCheckInPrompt.ts";
import type { RuleOutcome } from "./headCoachRuleEngine.ts";

// HC-012 Output Validator. Runs the validation order from the spec: JSON ->
// schema -> enums -> evidence -> rules -> fabrication -> authority -> safety.
// Stops at the first stage with issues (later stages assume earlier ones
// passed -- there's no point checking enum values on a field that's the
// wrong type).
//
// Honest scope note on "fabrication": genuine fact-checking (verifying each
// evidence claim actually traces to a real number in the context) would
// need either a second LLM-based critic call or real NLP, neither of which
// exists here. What's implemented instead is a narrow, deterministic
// coherence check -- confidence_level text must be consistent with the
// numeric confidence, and a recommend/escalate status must cite at least
// one evidence item. This catches a model being internally inconsistent or
// making an unsupported claim; it does NOT verify the evidence is true.
// That gap is real and should be revisited if this ever needs stronger
// guarantees than "reasonably grounded."

const AUTHORITY_RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

export interface ValidationIssue {
  stage: "json" | "schema" | "enums" | "evidence" | "rules" | "fabrication" | "authority";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  // True whenever the (possibly still-invalid) output's own status is
  // "escalate" -- per "meaningful uncertainty must escalate rather than
  // being optimized around," this is checked independently of whether the
  // rest of the output validated, and callers must act on it regardless.
  requiresEscalation: boolean;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateReviewCheckInOutput(
  generation: ReviewCheckInGenerationResult,
  ruleOutcomes: RuleOutcome[],
): ValidationResult {
  // 1. JSON
  if (generation.parseError || !generation.output) {
    return { valid: false, issues: [{ stage: "json", message: generation.parseError || "No output returned from the model." }], requiresEscalation: false };
  }
  const o = generation.output as ReviewCheckInAiOutput;
  const requiresEscalation = o.status === "escalate";

  // 2. schema
  const issues: ValidationIssue[] = [];
  const requiredStrings: (keyof ReviewCheckInAiOutput)[] = [
    "status", "observation", "interpretation", "recommendation", "rationale", "authority", "expected_response", "review_condition",
  ];
  for (const field of requiredStrings) {
    if (!isNonEmptyString(o[field] as unknown)) issues.push({ stage: "schema", message: `Missing or empty required field: ${field}` });
  }
  if (!Array.isArray(o.evidence)) issues.push({ stage: "schema", message: "evidence must be an array" });
  if (!Array.isArray(o.competing_hypotheses)) issues.push({ stage: "schema", message: "competing_hypotheses must be an array" });
  if (!Array.isArray(o.options)) issues.push({ stage: "schema", message: "options must be an array" });
  if (typeof o.confidence !== "number" || Number.isNaN(o.confidence) || o.confidence < 0 || o.confidence > 1) {
    issues.push({ stage: "schema", message: "confidence must be a number between 0 and 1" });
  }
  if (typeof o.client_communication_needed !== "boolean") issues.push({ stage: "schema", message: "client_communication_needed must be a boolean" });
  if (o.limiting_factor !== null && !isNonEmptyString(o.limiting_factor as unknown)) issues.push({ stage: "schema", message: "limiting_factor must be a non-empty string or null" });
  if (o.communication_draft !== null && !isNonEmptyString(o.communication_draft as unknown)) issues.push({ stage: "schema", message: "communication_draft must be a non-empty string or null" });
  if (issues.length) return { valid: false, issues, requiresEscalation };

  // 3. enums
  if (!["recommend", "no_action", "escalate"].includes(o.status)) issues.push({ stage: "enums", message: `Invalid status: ${o.status}` });
  if (!["low", "medium", "high"].includes(o.confidence_level)) issues.push({ stage: "enums", message: `Invalid confidence_level: ${o.confidence_level}` });
  if (!(o.authority in AUTHORITY_RANK)) issues.push({ stage: "enums", message: `Invalid authority: ${o.authority}` });
  if (issues.length) return { valid: false, issues, requiresEscalation };

  // 4. evidence
  if (o.evidence.length === 0) issues.push({ stage: "evidence", message: "evidence array must not be empty" });
  if (o.evidence.some((e) => !isNonEmptyString(e))) issues.push({ stage: "evidence", message: "every evidence entry must be a non-empty string" });
  if (issues.length) return { valid: false, issues, requiresEscalation };

  // 5. rules -- authority must not exceed what any fired rule permits. By
  // construction this is only ever reached after a Safety Gate "proceed"
  // (HC-009), so any fired rule here is advisory-category; the check is
  // still fully data-driven (reads rule.authority, doesn't hardcode "L1")
  // so it stays correct if a future rule with a different ceiling is added.
  const fired = ruleOutcomes.filter((r) => r.status === "fired");
  const maxAllowedRank = fired.length ? Math.max(...fired.map((r) => AUTHORITY_RANK[r.authority] ?? 0)) : AUTHORITY_RANK.L1;
  if (AUTHORITY_RANK[o.authority] > maxAllowedRank) {
    issues.push({ stage: "rules", message: `authority ${o.authority} exceeds the ceiling set by fired rules (max allowed rank ${maxAllowedRank})` });
  }
  if (issues.length) return { valid: false, issues, requiresEscalation };

  // 6. fabrication (narrow coherence check, see file header)
  if (o.confidence_level === "high" && o.confidence < 0.7) issues.push({ stage: "fabrication", message: "confidence_level 'high' is inconsistent with a numeric confidence below 0.7" });
  if (o.confidence_level === "low" && o.confidence > 0.5) issues.push({ stage: "fabrication", message: "confidence_level 'low' is inconsistent with a numeric confidence above 0.5" });
  if ((o.status === "recommend" || o.status === "escalate") && o.evidence.length < 1) {
    issues.push({ stage: "fabrication", message: `status '${o.status}' must cite at least one evidence item` });
  }
  if (issues.length) return { valid: false, issues, requiresEscalation };

  // 7. authority -- already fully checked above (enum membership + rules ceiling).
  // 8. safety -- requiresEscalation is computed from o.status independent of
  // everything above and returned regardless of `valid`, so a caller can
  // never accidentally ignore an AI-declared escalation just because the
  // rest of the output happened to validate cleanly.

  return { valid: true, issues: [], requiresEscalation };
}
