import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";
import { isHabitSatisfied } from "../../lib/scoring.js";

// Read-only "Today's Targets at a glance" preview — the actual toggle/entry
// UI lives only in TodayScreen now. Once habits can be numeric (manual_value)
// or linked to a check-in field, a simple tap-to-toggle widget can no longer
// safely double as the write path, so this just previews status and
// deep-links to Today for any actual entry.
export function HabitSummary({ profile, checkins, setPage }) {
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = todayStr();

  const load = useCallback(async () => {
    const { data: hs } = await supabase.from("habits").select("*").eq("client_id", profile.id).eq("active", true).order("order_index");
    const { data: ls } = await supabase.from("habit_logs").select("*").eq("client_id", profile.id).eq("date", today);
    setHabits(hs || []); setLogs(ls || []); setLoading(false);
  }, [profile.id, today]);
  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (habits.length === 0) return null;

  const todaysCheckin = (checkins || []).find((c) => c.date === today);
  const satisfiedOn = (habit) => {
    const value = habit.type === "linked_check_in_value" ? todaysCheckin?.[habit.linked_field] : logs.find((l) => l.habit_id === habit.id)?.value;
    const done = logs.some((l) => l.habit_id === habit.id && l.done);
    return isHabitSatisfied(habit, { done, value });
  };
  const doneCount = habits.filter(satisfiedOn).length;
  const total = habits.length;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <CardTitle>Today's Targets</CardTitle>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: S.accent }}>{doneCount}/{total} complete</span>
      </div>
      {habits.map((h) => {
        const done = satisfiedOn(h);
        return (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: "1px solid " + S.border }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: done ? S.success : "transparent", color: done ? "#0B0B0D" : S.muted, border: done ? "none" : "1px solid " + S.border }}>
              {done ? "✓" : ""}
            </div>
            <span style={{ fontSize: 13, color: done ? S.text : S.muted }}>{h.name}</span>
          </div>
        );
      })}
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("daily")}>View Today</Btn></div>
    </Card>
  );
}
