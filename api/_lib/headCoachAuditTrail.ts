import { supabaseAdmin } from "./supabaseAdmin.js";

// HC-018 Audit System. Per the spec, it must be possible to reconstruct:
// event, task, context, rules, model, output, decision, recommendation,
// coach action, intervention, outcome, plus methodology/rule versions.
//
// This is deliberately NOT a big new subsystem -- every module since HC-005
// has already been writing head_coach_audit_events, and the real data lives
// in head_coach_tasks/context_snapshots/recommendations/outcomes, all
// already linked by foreign keys. HC-018's actual job is to prove that
// reconstruction genuinely works end to end, not just that the schema looks
// like it should. reconstructTaskHistory() below is both that proof AND
// real, reusable infrastructure -- it's the exact query a future coach
// dashboard "show me the full history of this review" view would need.
//
// What this reconstructs, mapped to the spec's list:
//   event              -> sourceCheckIn (the daily_checkins/weekly_checkins row)
//   task               -> task
//   context             -> contextSnapshots[].snapshot (immutable)
//   rules              -> contextSnapshots[].rule_versions
//   model, output      -> recommendations[].model/model_version/usage/ai_output
//   decision           -> recommendations[].status/coach_decision_note/decided_by/decided_at
//   recommendation     -> recommendations[]
//   coach action        -> auditTrail[].actor/actor_id/actor_label across every step
//   intervention       -> per the HC-016 decision, an approved/modified recommendation
//                         IS the intervention (no separate executor/table exists)
//   outcome            -> outcomes[]
//   methodology version -> contextSnapshots[].methodology_version (always null right
//                         now -- no real V12 methodology document has been provided in
//                         this effort; this is a known, honest gap, not a bug)

export interface TaskHistoryReconstruction {
  task: Record<string, unknown>;
  sourceCheckIn: { table: string; row: Record<string, unknown> | null };
  auditTrail: Record<string, unknown>[];
  contextSnapshots: Record<string, unknown>[];
  recommendations: Record<string, unknown>[];
  outcomes: Record<string, unknown>[];
}

export async function reconstructTaskHistory(taskId: string): Promise<TaskHistoryReconstruction> {
  const { data: task, error: taskErr } = await supabaseAdmin.from("head_coach_tasks").select("*").eq("id", taskId).maybeSingle();
  if (taskErr) throw taskErr;
  if (!task) throw new Error("Task not found.");

  const [{ data: sourceRow }, { data: auditTrail }, { data: snapshots }, { data: recommendations }] = await Promise.all([
    supabaseAdmin.from(task.source_table).select("*").eq("id", task.source_id).maybeSingle(),
    supabaseAdmin.from("head_coach_audit_events").select("*").eq("task_id", taskId).order("created_at"),
    supabaseAdmin.from("head_coach_context_snapshots").select("*").eq("task_id", taskId).order("created_at"),
    supabaseAdmin.from("head_coach_recommendations").select("*").eq("task_id", taskId).order("created_at"),
  ]);

  const recIds = (recommendations || []).map((r: any) => r.id);
  const { data: outcomes } = recIds.length
    ? await supabaseAdmin.from("head_coach_outcomes").select("*").in("recommendation_id", recIds).order("created_at")
    : { data: [] as Record<string, unknown>[] };

  return {
    task,
    sourceCheckIn: { table: task.source_table, row: sourceRow || null },
    auditTrail: auditTrail || [],
    contextSnapshots: snapshots || [],
    recommendations: recommendations || [],
    outcomes: outcomes || [],
  };
}
