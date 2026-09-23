import { supabaseAdmin } from "./supabaseAdmin.js";

// HC-005 "Event + Task Infrastructure" -- task lifecycle only. No context
// assembly, no rules, no AI reasoning (those are HC-006 onward). Per the
// owner's decision, MVP has no automatic check-in -> task trigger (no
// Postgres trigger, no cron worker): a task is created and immediately
// claimed within one synchronous coach-triggered request, same shape as
// every existing AI action in this app (generatePhaseRecommendation,
// generateRoadmap, etc.). The full QUEUED/CONTEXT_BUILDING/READY/PROCESSING/
// DECISION_READY/ACTION_PENDING/MONITORING/CLOSED/FAILED/RETRYING/ESCALATED
// state machine from head_coach_task_status still applies -- this module
// just doesn't yet have a caller that drives every state (nothing exercises
// PROCESSING/DECISION_READY/ACTION_PENDING/MONITORING/CLOSED/RETRYING/
// ESCALATED until later HC steps build the stages that produce them).

export type TaskStatus =
  | "QUEUED"
  | "CONTEXT_BUILDING"
  | "READY"
  | "PROCESSING"
  | "DECISION_READY"
  | "ACTION_PENDING"
  | "MONITORING"
  | "CLOSED"
  | "FAILED"
  | "RETRYING"
  | "ESCALATED";

export type Actor = "system" | "coach" | "client" | "model";

export interface HeadCoachTask {
  id: string;
  taskType: string;
  clientId: string;
  status: TaskStatus;
  sourceTable: string;
  sourceId: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  completedAt: string | null;
}

function fromRow(row: any): HeadCoachTask {
  return {
    id: row.id,
    taskType: row.task_type,
    clientId: row.client_id,
    status: row.status,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
  };
}

interface AuditEventInput {
  eventType: string;
  taskId?: string | null;
  recommendationId?: string | null;
  clientId?: string | null;
  actor: Actor;
  actorId?: string | null;
  actorLabel?: string | null;
  payload?: Record<string, unknown>;
}

// Fire-and-forget-safe (awaited, but never throws) -- a failure to write an
// audit row must never break the actual task operation it's describing.
// head_coach_audit_events is append-only at the DB level (HC-002 trigger);
// this is the one and only write path into it.
export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    // supabase-js resolves with { data, error } on a DB-level failure -- it
    // does NOT throw -- so the error must be checked explicitly or a failed
    // write silently looks identical to a successful one.
    const { error } = await supabaseAdmin.from("head_coach_audit_events").insert({
      event_type: input.eventType,
      task_id: input.taskId ?? null,
      recommendation_id: input.recommendationId ?? null,
      client_id: input.clientId ?? null,
      actor: input.actor,
      actor_id: input.actorId ?? null,
      actor_label: input.actorLabel ?? null,
      payload: input.payload ?? null,
    });
    if (error) console.error("writeAuditEvent failed (non-fatal):", error, input.eventType);
  } catch (e) {
    console.error("writeAuditEvent failed (non-fatal):", e, input.eventType);
  }
}

interface CreateTaskInput {
  clientId: string;
  taskType: "REVIEW_CHECK_IN";
  sourceTable: "daily_checkins" | "weekly_checkins";
  sourceId: string;
  actor: Actor;
  actorId?: string | null;
  actorLabel?: string | null;
}

// Idempotent: if a task already exists for this (task_type, source_table,
// source_id) -- the exact unique constraint HC-002 added for this reason --
// returns the EXISTING row instead of erroring, so a coach double-clicking
// "review" (or a retry after a network blip) can never create two tasks for
// the same check-in.
export async function createTask(input: CreateTaskInput): Promise<HeadCoachTask> {
  const { data: inserted, error } = await supabaseAdmin
    .from("head_coach_tasks")
    .insert({
      task_type: input.taskType,
      client_id: input.clientId,
      source_table: input.sourceTable,
      source_id: input.sourceId,
    })
    .select()
    .maybeSingle();

  if (!error && inserted) {
    await writeAuditEvent({
      eventType: "task_created",
      taskId: inserted.id,
      clientId: input.clientId,
      actor: input.actor,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      payload: { task_type: input.taskType, source_table: input.sourceTable, source_id: input.sourceId },
    });
    return fromRow(inserted);
  }

  // 23505 = unique_violation. Any other error is a real failure -- surface it.
  if (error && error.code !== "23505") throw error;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("head_coach_tasks")
    .select("*")
    .eq("task_type", input.taskType)
    .eq("source_table", input.sourceTable)
    .eq("source_id", input.sourceId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error("createTask: unique_violation but no existing row found -- unexpected.");
  return fromRow(existing);
}

// Compare-and-swap transition: only succeeds if the task is currently in one
// of `allowedFrom`. Returns null (not an error) if the transition wasn't
// valid -- the task was already claimed/advanced/failed by something else.
// This is deliberately the same primitive a future concurrent worker would
// need for safe claiming, even though MVP only ever has one synchronous
// caller.
async function transitionTask(
  taskId: string,
  allowedFrom: TaskStatus[],
  to: TaskStatus,
  extra: Record<string, unknown> = {},
): Promise<HeadCoachTask | null> {
  const { data, error } = await supabaseAdmin
    .from("head_coach_tasks")
    .update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq("id", taskId)
    .in("status", allowedFrom)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function claimTask(taskId: string): Promise<HeadCoachTask | null> {
  const now = new Date().toISOString();
  return transitionTask(taskId, ["QUEUED"], "CONTEXT_BUILDING", {
    locked_by: "goal-insight:review-checkin",
    locked_at: now,
    claimed_at: now,
  });
}

export async function markReady(taskId: string, clientId: string, actor: Actor, actorId?: string | null): Promise<HeadCoachTask | null> {
  const task = await transitionTask(taskId, ["CONTEXT_BUILDING"], "READY");
  if (task) await writeAuditEvent({ eventType: "task_ready", taskId, clientId, actor, actorId });
  return task;
}

// HC-009 Safety Gate outcomes: a task the gate resolves deterministically
// (no_action or escalate) never reaches AI reasoning at all -- it goes
// straight from READY to a terminal/flagged state.
export async function closeTaskNoAction(taskId: string, clientId: string, reason: string, actor: Actor, actorId?: string | null): Promise<HeadCoachTask | null> {
  const task = await transitionTask(taskId, ["READY"], "CLOSED", { completed_at: new Date().toISOString() });
  if (task) await writeAuditEvent({ eventType: "safety_gate_no_action", taskId, clientId, actor, actorId, payload: { reason } });
  return task;
}

export async function escalateTask(taskId: string, clientId: string, reason: string, actor: Actor, actorId?: string | null): Promise<HeadCoachTask | null> {
  const task = await transitionTask(taskId, ["READY"], "ESCALATED", {});
  if (task) await writeAuditEvent({ eventType: "safety_gate_escalated", taskId, clientId, actor, actorId, payload: { reason } });
  return task;
}

// attemptCount is passed in (not read fresh) so the caller doesn't need an
// extra round-trip -- every caller already has the current task row from
// create/claim before it can fail.
export async function failTask(task: HeadCoachTask, errorMessage: string, actor: Actor, actorId?: string | null): Promise<HeadCoachTask | null> {
  const failed = await transitionTask(task.id, [task.status], "FAILED", {
    last_error: errorMessage,
    attempt_count: task.attemptCount + 1,
    completed_at: new Date().toISOString(),
  });
  if (failed) await writeAuditEvent({ eventType: "task_failed", taskId: task.id, clientId: task.clientId, actor, actorId, payload: { error: errorMessage, from_status: task.status } });
  return failed;
}

export async function getTask(taskId: string): Promise<HeadCoachTask | null> {
  const { data } = await supabaseAdmin.from("head_coach_tasks").select("*").eq("id", taskId).maybeSingle();
  return data ? fromRow(data) : null;
}
