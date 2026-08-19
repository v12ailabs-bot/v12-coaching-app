import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";
import { phaseRankOf } from "../../lib/constants.js";

const todayWeekday = () => new Date().toLocaleDateString("en-US", { weekday: "long" });

// Slim preview of today's exercises, pulled from the same `exercises` rows
// the full Workout Log reads — no separate "today's workout" data anywhere.
export function TodayWorkoutPreview({ profile, onViewFull }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("exercises").select("*").eq("client_id", trainingOwnerId(profile))
      .then(({ data }) => { setExercises(data || []); setLoading(false); });
  }, [profile.id, profile.shared_program_owner_id]);

  if (loading) return null;

  const today = todayWeekday();
  const todays = exercises.filter((e) => e.day_of_week === today)
    .sort((a, b) => phaseRankOf(a) - phaseRankOf(b) || (a.order_index ?? 0) - (b.order_index ?? 0));

  return (
    <Card>
      <CardTitle>Today · {today}</CardTitle>
      {exercises.length === 0 ? (
        <div style={{ fontSize: 13, color: S.muted }}>Your coach will assign your program. Check back soon.</div>
      ) : todays.length === 0 ? (
        <div style={{ fontSize: 13, color: S.muted }}>No workout scheduled today — rest up.</div>
      ) : (
        <>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, marginBottom: 12 }}>{todays[0].category || "Today's Workout"}</div>
          {todays.slice(0, 5).map((ex) => (
            <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid " + S.border, fontSize: 13 }}>
              <span>{ex.name}</span>
              <span style={{ color: S.muted }}>{ex.sets ?? "—"} x {ex.reps ?? "—"}</span>
            </div>
          ))}
          {todays.length > 5 && <div style={{ fontSize: 11, color: S.muted, marginTop: 8 }}>+{todays.length - 5} more</div>}
          <div style={{ marginTop: 16 }}><Btn sm onClick={onViewFull}>View Full Workout</Btn></div>
        </>
      )}
    </Card>
  );
}
