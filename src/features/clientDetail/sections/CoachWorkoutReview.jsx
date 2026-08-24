import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn } from "../../../components/ui/index.js";
import { WeightOverTimeChart, TopSetRepsChart, targetRepRange } from "../../workouts/WorkoutCharts.jsx";
import { adherenceFrom } from "../../../lib/scoring.js";
import { groupByDay } from "../../../lib/constants.js";
import { WorkoutMannequin } from "../../../components/WorkoutMannequin.jsx";

// Coach's workout review — monitoring/editing, not logging (the client logs
// sets; the coach scans adherence and taps in for detail). A scannable
// stacked list rather than the client's swipeable reel, since the coach
// needs to scan every exercise at once. Reuses the exact same chart
// components the client sees (WeightOverTimeChart/TopSetRepsChart) rather
// than building new ones. Works on both mobile and desktop — it's plain
// vertical content, nothing that needs a different layout per breakpoint.
export function CoachWorkoutReview({ clientId, exercises, onGenerateProgram, onEditProgram, onMessageClient }) {
  const [phase, setPhase] = useState(null);
  const [daily, setDaily] = useState([]);
  const [logsByExercise, setLogsByExercise] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    supabase.from("programs").select("phase").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setPhase(data?.phase || null));
    supabase.from("daily_checkins").select("date,workout").eq("client_id", clientId).order("date")
      .then(({ data }) => setDaily(data || []));
  }, [clientId]);

  useEffect(() => {
    if (!exercises.length) { setLogsByExercise({}); return; }
    const ids = exercises.map((e) => e.id);
    supabase.from("workout_logs").select("*").eq("client_id", clientId).in("exercise_id", ids).order("date").then(({ data }) => {
      const byEx = {};
      (data || []).forEach((l) => { (byEx[l.exercise_id] = byEx[l.exercise_id] || []).push(l); });
      setLogsByExercise(byEx);
    });
  }, [clientId, exercises]);

  const adh = adherenceFrom(daily, 30);
  const dayGroups = groupByDay(exercises);
  const dayLabelOf = {};
  dayGroups.forEach((g) => g.exercises.forEach((e) => { dayLabelOf[e.id] = g.label; }));

  if (!exercises.length) {
    return (
      <Card>
        <CardTitle>Workout Review</CardTitle>
        <div style={{ fontSize: 13, color: S.muted }}>No exercises assigned yet.</div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <CardTitle>Workout Review</CardTitle>
        <div style={{ fontSize: 12, color: S.muted }}>{phase ? `Phase: ${phase}` : "No phase set"} · Training adherence {adh.trainingRate}%</div>
      </div>
      <div>
        {exercises.map((ex) => {
          const logs = logsByExercise[ex.id] || [];
          const chartData = logs.reduce((acc, log) => { const e = acc.find((a) => a.date === log.date); if (!e) acc.push({ date: log.date, weight: log.weight, reps: log.reps }); return acc; }, []);
          const dataKey = ex.is_bodyweight ? "reps" : "weight";
          const last = chartData[chartData.length - 1];
          const prev = chartData[chartData.length - 2];
          const trend = last && prev && last[dataKey] != null && prev[dataKey] != null
            ? (last[dataKey] > prev[dataKey] ? "up" : last[dataKey] < prev[dataKey] ? "down" : "flat")
            : null;
          const isOpen = expandedId === ex.id;
          return (
            <div key={ex.id} style={{ borderBottom: "1px solid " + S.border }}>
              <button onClick={() => setExpandedId(isOpen ? null : ex.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                <WorkoutMannequin exerciseName={ex.name} size={28} color={S.muted} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.name}</div>
                  <div style={{ fontSize: 11, color: S.muted }}>{dayLabelOf[ex.id] || "Unscheduled"}</div>
                </div>
                <div style={{ fontSize: 12, color: S.text, textAlign: "right", minWidth: 80, flexShrink: 0 }}>
                  {last ? `${last[dataKey]}${dataKey === "weight" ? " lb" : " reps"}` : "No data"}
                </div>
                <div style={{ width: 20, textAlign: "center", fontSize: 13, fontWeight: 700, color: trend === "up" ? S.accent2 : trend === "down" ? S.danger : S.muted, flexShrink: 0 }}>
                  {trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : ""}
                </div>
                <span style={{ color: S.muted, fontSize: 11, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "4px 4px 16px" }}>
                  <WeightOverTimeChart chartData={chartData} isBodyweight={ex.is_bodyweight} />
                  <TopSetRepsChart chartData={chartData} targetRange={targetRepRange(ex.reps)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
        <Btn onClick={onGenerateProgram}>Generate/Regenerate Workout</Btn>
        <button onClick={onEditProgram} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.text }}>Edit Program</button>
        <button onClick={onMessageClient} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.text }}>Message Client</button>
      </div>
    </Card>
  );
}
