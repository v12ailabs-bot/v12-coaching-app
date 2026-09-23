import { supabaseAdmin } from "./supabaseAdmin.js";
import { closeTaskAfterOutcome, type HeadCoachTask } from "./headCoachTasks.ts";

// HC-017 Outcome Tracker. Per the spec: track expected response, actual
// response, measurement period, outcome, notes -- "use outcomes to evaluate
// interventions" but "do not automatically rewrite methodology based on
// outcomes." That second constraint is a guardrail on FUTURE work: nothing
// here (or anywhere in this effort) feeds outcomes back into HC-007's rule
// registry automatically. Don't build that without an explicit decision.
//
// Coach-initiated only, per the HC-016 decision (no automated executor
// exists, so there's no automatic way to detect an outcome either). Only
// meaningful for a recommendation the coach actually acted on
// (approved/modified) -- recording an "outcome" for a rejected/deferred
// recommendation doesn't mean anything, nothing happened to have an
// outcome. Unlike ai_output/context snapshots, outcomes are NOT locked
// immutable at the DB level (HC-002 deliberately left head_coach_outcomes
// without a lock trigger) -- a coach may reasonably want to add or correct
// notes after more time has passed. This module only implements creation
// for MVP; update/amend can be added later if that need is real.

export type OutcomeValue = "as_expected" | "better_than_expected" | "worse_than_expected" | "inconclusive";
export const OUTCOME_VALUES: OutcomeValue[] = ["as_expected", "better_than_expected", "worse_than_expected", "inconclusive"];

export interface RecordOutcomeInput {
  recommendationId: string;
  actualResponse: string;
  outcome: OutcomeValue;
  expectedResponse?: string | null;
  measurementPeriodStart?: string | null;
  measurementPeriodEnd?: string | null;
  notes?: string | null;
  recordedBy: string;
}

export interface RecordOutcomeResult {
  outcome: Record<string, unknown>;
  taskId: string;
  task: HeadCoachTask | null;
}

export async function recordOutcome(input: RecordOutcomeInput): Promise<RecordOutcomeResult> {
  const { data: rec, error: recErr } = await supabaseAdmin
    .from("head_coach_recommendations")
    .select("id,task_id,client_id,status,ai_output")
    .eq("id", input.recommendationId)
    .maybeSingle();
  if (recErr) throw recErr;
  if (!rec) throw new Error("Recommendation not found.");
  if (!["approved", "modified"].includes(rec.status)) {
    throw new Error(`Cannot record an outcome for a recommendation with status '${rec.status}' -- only an approved/modified recommendation was actually acted on.`);
  }

  // HC-022 replay guard, made atomic (not a separate check-then-insert,
  // which would leave a race window between two concurrent requests):
  // claim the ACTION_PENDING -> CLOSED transition FIRST, via the same
  // compare-and-swap primitive used throughout headCoachTasks.ts. Only the
  // request that wins this claim ever inserts an outcome row -- a
  // double-click or retried request loses the claim and is rejected before
  // touching head_coach_outcomes at all, so it can never create a
  // duplicate. This also enforces one-outcome-per-recommendation, matching
  // the task lifecycle's own one-time ACTION_PENDING -> CLOSED transition.
  const closedTask = await closeTaskAfterOutcome(rec.task_id, rec.client_id, "coach", input.recordedBy);
  if (!closedTask) {
    throw new Error("Cannot record an outcome -- this task is no longer ACTION_PENDING, an outcome was likely already recorded.");
  }

  // Default to the AI's own expected_response (captured at reasoning time,
  // HC-011) rather than making the coach retype it -- still overridable.
  const expectedResponse = input.expectedResponse ?? (rec.ai_output as any)?.expected_response ?? null;

  const { data, error } = await supabaseAdmin
    .from("head_coach_outcomes")
    .insert({
      recommendation_id: input.recommendationId,
      expected_response: expectedResponse,
      actual_response: input.actualResponse,
      measurement_period_start: input.measurementPeriodStart ?? null,
      measurement_period_end: input.measurementPeriodEnd ?? null,
      outcome: input.outcome,
      notes: input.notes ?? null,
      recorded_by: input.recordedBy,
    })
    .select()
    .maybeSingle();
  // The task is already CLOSED at this point even if this insert fails --
  // there's no cross-table transaction primitive in this codebase's
  // established Supabase usage to make this fully atomic end-to-end. This
  // trades a very rare, purely-mechanical insert failure (all inputs are
  // already validated before this point) for eliminating the far more
  // realistic duplicate-submission race -- the right tradeoff, not a fully
  // solved one.
  if (error) throw error;
  if (!data) throw new Error("recordOutcome: insert returned no row.");

  return { outcome: data, taskId: rec.task_id, task: closedTask };
}
