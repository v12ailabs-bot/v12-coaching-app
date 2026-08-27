import { useState, useEffect, useCallback } from "react";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn } from "../../../components/ui/index.js";
import { ONBOARDING_TASK_DEFS, fetchOnboardingTasks, isTaskActive, tasksByKey, setTaskStatus } from "../../../lib/onboardingTasks.js";

const STATUS_COLOR = { completed: S.success, requires_review: S.warning, in_progress: S.warning };

// Coach-only Day-0 gate: assessment -> coach review -> roadmap confirmed.
// Client-owned rows are informational here (coach can still mark them done
// if a client completes an assessment outside the app, e.g. in person);
// coach-owned rows get a one-click "Mark done" once their dependency clears.
export function OnboardingChecklist({ clientId }) {
  const [tasks, setTasks] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const load = useCallback(() => {
    fetchOnboardingTasks(clientId).then(setTasks);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (!tasks) return null;
  const byKey = tasksByKey(tasks);
  if (tasks.every((t) => t.status === "completed")) return null;

  const complete = async (key) => {
    setBusyKey(key);
    await setTaskStatus(clientId, key, "completed");
    await load();
    setBusyKey(null);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Onboarding — Day 0</CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
        Assessment → Coach Review → Roadmap Confirmed. Each step unlocks once the one before it is done.
      </div>
      {ONBOARDING_TASK_DEFS.map((def) => {
        const task = byKey[def.key];
        if (!task) return null;
        const active = isTaskActive(task, byKey);
        const done = task.status === "completed";
        return (
          <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid " + S.border, opacity: active || done ? 1 : 0.45 }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
              background: done ? S.success : "transparent", border: "1px solid " + (STATUS_COLOR[task.status] || S.border),
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{def.coachLabel}</div>
              <div style={{ fontSize: 11, color: S.muted, marginTop: 1 }}>
                {done ? "Completed" : active ? "Active" : "Waiting on previous step"}
              </div>
            </div>
            {def.owner === "coach" && !done && active && (
              <Btn sm teal disabled={busyKey === def.key} onClick={() => complete(def.key)}>
                {busyKey === def.key ? "Saving..." : "Mark Done"}
              </Btn>
            )}
            {def.owner === "client" && !done && (
              <Btn sm disabled={busyKey === def.key} onClick={() => complete(def.key)}>
                {busyKey === def.key ? "Saving..." : "Client Completed"}
              </Btn>
            )}
          </div>
        );
      })}
    </Card>
  );
}
