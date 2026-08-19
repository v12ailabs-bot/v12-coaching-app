import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";

// Compact dashboard version of the full Habits page (App.jsx) — same
// habits/habit_logs data and the same toggle write path, just surfaced
// directly instead of behind an accordion.
export function HabitSummary({ profile, setPage }) {
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

  const doneOn = (habitId) => logs.some((l) => l.habit_id === habitId && l.done);

  const toggle = async (habit) => {
    const existing = logs.find((l) => l.habit_id === habit.id);
    if (existing) {
      setLogs((prev) => prev.filter((l) => l.id !== existing.id));
      await supabase.from("habit_logs").delete().eq("id", existing.id);
    } else {
      const row = { client_id: profile.id, habit_id: habit.id, date: today, done: true };
      const { data } = await supabase.from("habit_logs").insert(row).select().maybeSingle();
      setLogs((prev) => [...prev, data || { ...row, id: `tmp-${habit.id}` }]);
    }
  };

  const doneCount = habits.filter((h) => doneOn(h.id)).length;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <CardTitle>Habits</CardTitle>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: S.accent }}>{doneCount}/{habits.length} completed</span>
      </div>
      {habits.map((h) => {
        const done = doneOn(h.id);
        return (
          <div key={h.id} onClick={() => toggle(h)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: done ? S.success : "transparent", color: done ? "#0B0B0D" : S.muted, border: done ? "none" : "1px solid " + S.border }}>
              {done ? "✓" : ""}
            </div>
            <span style={{ fontSize: 13, color: done ? S.text : S.muted }}>{h.name}</span>
          </div>
        );
      })}
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("habits")}>View All Habits</Btn></div>
    </Card>
  );
}
