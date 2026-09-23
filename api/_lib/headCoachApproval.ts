import { supabaseAdmin } from "./supabaseAdmin.js";

// HC-015 Coach Approval. Per the spec: support APPROVE/MODIFY/REJECT/DEFER,
// never overwrite the original AI recommendation, store coach modifications
// separately, require expected-state/version validation before executing.
//
// "Never overwrite the original recommendation" / "store modifications
// separately" are already structural guarantees from HC-002, not something
// this module has to re-implement: ai_output is a separate column from
// coach_modification, and the lock trigger makes ai_output physically
// impossible to change after insert regardless of what this code does.
//
// "Expected state/version validation before executing" is implemented as a
// compare-and-swap on status = 'pending' in the same UPDATE statement, the
// same primitive used throughout headCoachTasks.ts -- if the row has
// already been decided (by a second coach tab, a retry, anything), the
// update matches zero rows and this returns alreadyDecided: true rather
// than either silently overwriting a prior decision or hitting the DB
// lock trigger's exception. This IS the "expected state" check: the
// expectation being validated is "still pending, nobody decided this
// already" -- there's no separate version-number scheme in this app.

export type CoachDecision = "approve" | "modify" | "reject" | "defer";

const DECISION_TO_STATUS: Record<CoachDecision, string> = {
  approve: "approved",
  modify: "modified",
  reject: "rejected",
  defer: "deferred",
};

export interface ApplyCoachDecisionInput {
  recommendationId: string;
  decision: CoachDecision;
  decidedBy: string;
  note?: string | null;
  modification?: Record<string, unknown> | null;
}

export interface ApplyCoachDecisionResult {
  recommendation: Record<string, unknown> | null;
  alreadyDecided: boolean;
}

export async function applyCoachDecision(input: ApplyCoachDecisionInput): Promise<ApplyCoachDecisionResult> {
  if (input.decision === "modify" && !input.modification) {
    throw new Error("A 'modify' decision requires a modification.");
  }

  const { data, error } = await supabaseAdmin
    .from("head_coach_recommendations")
    .update({
      status: DECISION_TO_STATUS[input.decision],
      coach_decision_note: input.note ?? null,
      coach_modification: input.decision === "modify" ? input.modification : null,
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.recommendationId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw error;

  return { recommendation: data, alreadyDecided: !data };
}
