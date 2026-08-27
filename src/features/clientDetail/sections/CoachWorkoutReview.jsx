import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, CollapsibleSection } from "../../../components/ui/index.js";
import { WeightOverTimeChart, TopSetRepsChart, targetRepRange, topSetPerDay, LogEntryList, withinReviewWindow, REVIEW_WINDOW_DAYS } from "../../workouts/WorkoutCharts.jsx";
import { adherenceFrom } from "../../../lib/scoring.js";
import { groupByDay, groupIntoBlocks, BLOCK_TYPE_LABEL } from "../../../lib/constants.js";
import { WorkoutMannequin } from "../../../components/WorkoutMannequin.jsx";

// One reviewable block (a straight-set exercise, or a merged superset/circuit
// pair) — header row with last value + trend, expands into the charts and the
// 30-day log-entry list. `logsByExercise` covers every member.
function ReviewItem({ item, logsByExercise }) {
  const [open, setOpen] = useState(false);
  const isGroup = item.members.length > 1;
  const allLogs = item.members.flatMap((m) => (logsByExercise[m.id] || []).map((l) => ({ ...l, exerciseName: m.name })));
  const primary = item.members[0];
  const primaryLogs = logsByExercise[primary.id] || [];
  const chartData = topSetPerDay(primaryLogs, primary.is_bodyweight);
  const dataKey = primary.is_bodyweight ? "reps" : "weight";
  const last = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];
  const trend = last && prev && last[dataKey] != null && prev[dataKey] != null
    ? (last[dataKey] > prev[dataKey] ? "up" : last[dataKey] < prev[dataKey] ? "down" : "flat")
    : null;
  const reviewRows = allLogs
    .filter((l) => withinReviewWindow(l.date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((l) => ({ ...l, exerciseName: isGroup ? l.exerciseName : null }));

  return (
    <div style={{ borderBottom: "1px solid " + S.border }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <WorkoutMannequin exerciseName={primary.name} size={44} color={S.muted} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.members.map((m) => m.name).join(" + ")}
          </div>
          {isGroup && <div style={{ fontSize: 10, color: S.accent2 }}>{BLOCK_TYPE_LABEL[item.blockType]}</div>}
        </div>
        <div style={{ fontSize: 12, color: S.text, textAlign: "right", minWidth: 80, flexShrink: 0 }}>
          {last ? `${last[dataKey]}${dataKey === "weight" ? " lb" : " reps"}` : "No data"}
        </div>
        <div style={{ width: 20, textAlign: "center", fontSize: 13, fontWeight: 700, color: trend === "up" ? S.accent2 : trend === "down" ? S.danger : S.muted, flexShrink: 0 }}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : ""}
        </div>
        <span style={{ color: S.muted, fontSize: 11, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 4px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <WeightOverTimeChart chartData={chartData} isBodyweight={primary.is_bodyweight} />
            <TopSetRepsChart chartData={chartData} targetRange={targetRepRange(primary.reps)} />
          </div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 8 }}>Last {REVIEW_WINDOW_DAYS} Days</div>
          <LogEntryList rows={reviewRows} />
        </div>
      )}
    </div>
  );
}

// One training day — closed by default; opens into its blocks (supersets
// merged into one entry, per groupIntoBlocks).
function ReviewDay({ dayGroup, logsByExercise }) {
  const [open, setOpen] = useState(false);
  const items = groupIntoBlocks(dayGroup.exercises);
  return (
    <CollapsibleSection title={dayGroup.label} summary={`${items.length} item${items.length === 1 ? "" : "s"}`} expanded={open} onToggle={setOpen}>
      {items.map((item) => <ReviewItem key={item.id} item={item} logsByExercise={logsByExercise} />)}
    </CollapsibleSection>
  );
}

// Coach's workout review — monitoring/editing, not logging (the client logs
// sets; the coach scans adherence and drills in for detail). Nested dropdowns
// — Workout Review (closed) -> Day (closed) -> exercise/block (closed) -> log
// entries — instead of one long always-visible list, so the coach isn't
// scrolling past every exercise on every visit. Reuses the exact same chart
// components the client sees (WeightOverTimeChart/TopSetRepsChart).
export function CoachWorkoutReview({ clientId, exercises, onGenerateProgram, onEditProgram, onMessageClient }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [phase, setPhase] = useState(null);
  const [daily, setDaily] = useState([]);
  const [logsByExercise, setLogsByExercise] = useState({});

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
      <CollapsibleSection
        title="Workout Review"
        summary={`${phase ? `Phase: ${phase}` : "No phase set"} · Adherence ${adh.trainingRate}% · ${dayGroups.length} day${dayGroups.length === 1 ? "" : "s"}`}
        expanded={reviewOpen} onToggle={setReviewOpen}>
        {dayGroups.map((g) => <ReviewDay key={g.day} dayGroup={g} logsByExercise={logsByExercise} />)}
      </CollapsibleSection>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <Btn onClick={onGenerateProgram}>Generate/Regenerate Workout</Btn>
        <button onClick={onEditProgram} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.text }}>Edit Program</button>
        <button onClick={onMessageClient} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.text }}>Message Client</button>
      </div>
    </Card>
  );
}
