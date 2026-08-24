import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Card, CardTitle } from "../../../components/ui/index.js";
import { HabitsProgress } from "../../progress/SharedProgressViews.jsx";
import { CoachHabits } from "./DailyHabitsSection.jsx";

// Full-width Overview row: habit management (define/remove habits, left)
// next to the same habit-adherence grid the client's own Progress page and
// the old Client Insights card showed (right) — reusing HabitsProgress
// rather than duplicating its logic.
export function DailyHabitsPanel({ clientId }) {
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);

  const loadProgress = useCallback(() => {
    supabase.from("habits").select("*").eq("client_id", clientId).eq("active", true).order("order_index").then(({ data }) => setHabits(data || []));
    const cut = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split("T")[0]; })();
    supabase.from("habit_logs").select("*").eq("client_id", clientId).gte("date", cut).then(({ data }) => setHabitLogs(data || []));
  }, [clientId]);
  useEffect(() => { loadProgress(); }, [loadProgress]);

  return (
    <Card style={{ marginBottom: 0 }}>
      <CardTitle>Daily Habits</CardTitle>
      <div className="daily-habits-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,320px) minmax(0,1fr)", gap: 20 }}>
        {/* onAdd/onRemove refresh the adherence grid too, so a habit added
            just now shows up in the "Last 14 days" table without a reload. */}
        <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 16 }}>
          <CoachHabits clientId={clientId} onChanged={loadProgress} />
        </div>
        <div style={{ minWidth: 0 }}>
          <HabitsProgress habits={habits} logs={habitLogs} />
        </div>
      </div>
    </Card>
  );
}
