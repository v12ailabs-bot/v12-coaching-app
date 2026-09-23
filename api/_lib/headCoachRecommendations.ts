import { supabaseAdmin } from "./supabaseAdmin.js";
import type { ReviewCheckInGenerationResult } from "./headCoachReviewCheckInPrompt.ts";
import type { ValidationResult } from "./headCoachOutputValidator.ts";
import type { AuthorityDetermination } from "./headCoachAuthorityEngine.ts";

// HC-014 Recommendation Manager -- the first place anything actually gets
// written to head_coach_recommendations (HC-002). Persists ONE row per
// model call, regardless of outcome: a clean recommend/no_action, an
// AI-declared escalate, or output that failed validation even after the
// bounded retry. Every case is worth a permanent record -- "preserve
// historical decisions" doesn't only apply to the good outcomes. Only the
// case with no output at all (pure JSON parse failure) stores a fallback
// payload instead of null, since ai_output is NOT NULL by schema and there
// is no legitimate reason to invent a shape that implies more structure
// than the model actually returned.
//
// Always inserts with status 'pending' -- deciding it (approve/modify/
// reject/defer) is HC-015, Coach Approval, not this module's job. The
// row's ai_output/backend_authority/validation_status are written once
// here and never touched again (HC-002's lock trigger enforces this at the
// DB level regardless of what this code does).

// Maps this module's finer-grained validation stages down to the DB's
// existing 5-value validation_status enum (HC-002) -- not a schema change,
// just choosing the closest existing bucket for each stage per the
// spec's own validation order (json/schema/enums are structural,
// rules/authority are rule-driven, evidence/fabrication are safety-adjacent
// data-quality concerns). 'no_action_fallback' is defined in the schema but
// not produced by any current code path -- this module always escalates
// (via the caller) rather than silently falling back to no_action when
// validation fails, since escalating guarantees a human looks at it.
function mapValidationStatus(validation: ValidationResult, hasOutput: boolean): string {
  if (!hasOutput) return "failed_schema";
  if (validation.valid) return "valid";
  const stages = new Set(validation.issues.map((i) => i.stage));
  if (stages.has("json") || stages.has("schema") || stages.has("enums")) return "failed_schema";
  if (stages.has("rules") || stages.has("authority")) return "failed_rules";
  return "failed_safety"; // evidence / fabrication
}

export interface CreateRecommendationInput {
  taskId: string;
  clientId: string;
  contextSnapshotId: string;
  generation: ReviewCheckInGenerationResult;
  validation: ValidationResult;
  authority: AuthorityDetermination;
}

export async function createRecommendation(input: CreateRecommendationInput): Promise<{ id: string; validationStatus: string }> {
  const hasOutput = !!input.generation.output;
  const aiOutput = input.generation.output ?? { raw: input.generation.raw, parseError: input.generation.parseError };
  const validationStatus = mapValidationStatus(input.validation, hasOutput);

  const { data, error } = await supabaseAdmin
    .from("head_coach_recommendations")
    .insert({
      task_id: input.taskId,
      client_id: input.clientId,
      context_snapshot_id: input.contextSnapshotId,
      model: input.generation.model,
      model_version: input.generation.modelVersion,
      latency_ms: input.generation.latencyMs,
      usage: input.generation.usage,
      ai_output: aiOutput,
      backend_authority: input.authority.backendAuthority,
      validation_status: validationStatus,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("createRecommendation: insert returned no row.");
  return { id: data.id, validationStatus };
}
