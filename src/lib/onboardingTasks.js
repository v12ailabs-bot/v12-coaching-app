import { supabase } from "../supabaseClient.js";

// Day-0 onboarding gate (client_onboarding_tasks): assessment -> coach
// review -> roadmap confirmed. Only steps with no natural signal of their
// own get a row here -- everything the client already answered (goal,
// experience, activity level) is read straight off profiles/leads by the
// UI instead of duplicated into a task row.
export const ONBOARDING_TASK_DEFS = [
  { key: "assessment", owner: "client", dependsOn: null, clientLabel: "Complete your assessment", coachLabel: "Client completes assessment" },
  { key: "coach_review", owner: "coach", dependsOn: "assessment", coachLabel: "Review assessment & goals" },
  { key: "roadmap_ready", owner: "coach", dependsOn: "coach_review", coachLabel: "Confirm roadmap & program" },
];

const DEF_BY_KEY = Object.fromEntries(ONBOARDING_TASK_DEFS.map((d) => [d.key, d]));

// Creates any missing task rows for a client (idempotent -- unique
// constraint on client_id+task_key means a race just no-ops the loser).
export async function ensureOnboardingTasks(clientId) {
  const { data: existing } = await supabase.from("client_onboarding_tasks").select("task_key").eq("client_id", clientId);
  const have = new Set((existing || []).map((r) => r.task_key));
  const missing = ONBOARDING_TASK_DEFS.filter((d) => !have.has(d.key));
  if (missing.length === 0) return;
  await supabase.from("client_onboarding_tasks").insert(
    missing.map((d) => ({ client_id: clientId, task_key: d.key, owner: d.owner, depends_on_key: d.dependsOn }))
  );
}

export async function fetchOnboardingTasks(clientId) {
  await ensureOnboardingTasks(clientId);
  const { data } = await supabase.from("client_onboarding_tasks").select("*").eq("client_id", clientId);
  return data || [];
}

// A task is active (actionable now) once its dependency, if any, is completed.
export function isTaskActive(task, tasksByKey) {
  if (!task.depends_on_key) return true;
  return tasksByKey[task.depends_on_key]?.status === "completed";
}

export function tasksByKey(tasks) {
  return Object.fromEntries(tasks.map((t) => [t.task_key, t]));
}

export function taskLabel(taskKey, forCoach) {
  const def = DEF_BY_KEY[taskKey];
  return forCoach ? def?.coachLabel : def?.clientLabel;
}

export async function setTaskStatus(clientId, taskKey, status) {
  const now = new Date().toISOString();
  await supabase.from("client_onboarding_tasks").update({
    status, updated_at: now, completed_at: status === "completed" ? now : null,
  }).eq("client_id", clientId).eq("task_key", taskKey);
}

// Whole Day-0 gate is clear once every task is completed (or has no row yet
// -- a client created before this system shipped shouldn't get stuck).
export function onboardingComplete(tasks) {
  if (tasks.length === 0) return true;
  return tasks.every((t) => t.status === "completed");
}
