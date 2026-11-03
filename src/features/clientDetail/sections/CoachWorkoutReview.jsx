import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, useIsMobile } from "../../../theme.jsx";
import { Card, CardTitle, Btn, CollapsibleSection } from "../../../components/ui/index.js";
import { WeightOverTimeChart, TopSetRepsChart, targetRepRange, topSetPerDay, LogEntryList, withinReviewWindow, REVIEW_WINDOW_DAYS } from "../../workouts/WorkoutCharts.jsx";
import { adherenceFrom } from "../../../lib/scoring.js";
import { groupByDay, groupIntoBlocks, BLOCK_TYPE_LABEL } from "../../../lib/constants.js";
import { WorkoutMannequin } from "../../../components/WorkoutMannequin.jsx";
import { METHODS } from "../../../lib/progression/methods.js";
import { seedProgressionForClient } from "../../../lib/progression/data.js";
import { ProgressionPanel } from "./ProgressionPanel.jsx";
import { StrengthRecordEditor } from "./StrengthRecordEditor.jsx";
import { fetchStrengthMemory } from "../../../lib/strengthMemory.js";
import { exerciseKey, describeRecord } from "../../../lib/strengthRecords.js";

// One exercise's own header row + expandable charts/log-entry list — used
// standalone for a straight-set exercise, and once per member for a
// superset/circuit block, so each exercise in a group gets its own best-lift,
// trend, and charts instead of only the block's first member.
function ExerciseRow({ exercise, logs, clientId, memory, onMemoryChanged }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const chartData = topSetPerDay(logs, exercise.is_bodyweight);
  const dataKey = exercise.is_bodyweight ? "reps" : "weight";
  const last = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];
  const trend = last && prev && last[dataKey] != null && prev[dataKey] != null
    ? (last[dataKey] > prev[dataKey] ? "up" : last[dataKey] < prev[dataKey] ? "down" : "flat")
    : null;
  // What this client has proven on this lift — survives the exercise being deleted/replaced,
  // so a freshly generated exercise with no logs yet still shows their history.
  const record = memory?.get(exerciseKey(exercise.name)) || null;
  const recordText = describeRecord(record);
  const lastText = last ? `${last[dataKey]}${dataKey === "weight" ? " lb" : " reps"}` : record ? "Past data" : "No data";
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : "";
  const trendColor = trend === "up" ? S.accent2 : trend === "down" ? S.danger : S.muted;
  const reviewRows = logs
    .filter((l) => withinReviewWindow(l.date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <div style={{ borderBottom: "1px solid " + S.border }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, padding: "12px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <WorkoutMannequin exerciseName={exercise.name} size={isMobile ? 32 : 44} color={S.muted} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {exercise.name}
          </div>
          <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>
            {[exercise.sets != null ? `${exercise.sets} sets` : null, exercise.reps ? `${exercise.reps} reps` : null, Number.isInteger(exercise.rest_seconds) ? `rest ${exercise.rest_seconds}s` : null].filter(Boolean).join(" · ") || "No sets/reps set"}
          </div>
          <div style={{ fontSize: 11, marginTop: 2, color: exercise.progression_method ? S.accent2 : S.muted }}>
            {exercise.progression_method ? `Progression: ${METHODS[exercise.progression_method]?.name || exercise.progression_method}` : "No progression method"}
          </div>
          {isMobile && <div style={{ fontSize: 12, color: S.text, marginTop: 2 }}>{lastText} <span style={{ fontWeight: 700, color: trendColor }}>{trendArrow}</span></div>}
          {recordText && <div style={{ fontSize: 11, color: S.accent2, marginTop: 2 }}>{recordText}</div>}
        </div>
        {!isMobile && <>
          <div style={{ fontSize: 12, color: S.text, textAlign: "right", minWidth: 80, flexShrink: 0 }}>{lastText}</div>
          <div style={{ width: 20, textAlign: "center", fontSize: 13, fontWeight: 700, color: trendColor, flexShrink: 0 }}>{trendArrow}</div>
        </>}
        <span style={{ color: S.muted, fontSize: 11, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 4px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <WeightOverTimeChart chartData={chartData} isBodyweight={exercise.is_bodyweight} />
            <TopSetRepsChart chartData={chartData} targetRange={targetRepRange(exercise.reps)} />
          </div>
          {record && <div style={{ marginBottom: 10 }}><StrengthRecordEditor record={record} exerciseName={exercise.name} clientId={clientId} onChanged={onMemoryChanged}
            others={[...new Set([...memory.values()])].filter((r) => r.id !== record.id)} /></div>}
          <ProgressionPanel exercise={exercise} clientId={clientId} logs={logs} memoryRecord={record} />
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 8 }}>Last {REVIEW_WINDOW_DAYS} Days</div>
          <LogEntryList rows={reviewRows} />
        </div>
      )}
    </div>
  );
}

// One reviewable block — a straight-set exercise renders as a single
// ExerciseRow; a merged superset/circuit renders a label plus one
// independent ExerciseRow per member, so lat pulldowns and pull-ups done
// together each show their own best lift/weight/reps, same as standalone.
function ReviewItem({ item, logsByExercise, clientId, memory, onMemoryChanged }) {
  const isGroup = item.members.length > 1;
  if (!isGroup) {
    const exercise = item.members[0];
    return <ExerciseRow exercise={exercise} logs={logsByExercise[exercise.id] || []} clientId={clientId} memory={memory} onMemoryChanged={onMemoryChanged} />;
  }
  return (
    <div>
      <div style={{ padding: "10px 4px 2px", fontSize: 10, color: S.accent2, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{BLOCK_TYPE_LABEL[item.blockType]}</div>
      {item.members.map((m) => <ExerciseRow key={m.id} exercise={m} logs={logsByExercise[m.id] || []} clientId={clientId} memory={memory} onMemoryChanged={onMemoryChanged} />)}
    </div>
  );
}

// One training day — closed by default; opens into its blocks (supersets
// merged into one entry, per groupIntoBlocks).
function ReviewDay({ dayGroup, logsByExercise, clientId, memory, onMemoryChanged }) {
  const [open, setOpen] = useState(false);
  const items = groupIntoBlocks(dayGroup.exercises);
  return (
    <CollapsibleSection title={dayGroup.label} summary={`${items.length} item${items.length === 1 ? "" : "s"}`} expanded={open} onToggle={setOpen}>
      {items.map((item) => <ReviewItem key={item.id} item={item} logsByExercise={logsByExercise} clientId={clientId} memory={memory} onMemoryChanged={onMemoryChanged} />)}
    </CollapsibleSection>
  );
}

// Coach's workout review — monitoring/editing, not logging (the client logs
// sets; the coach scans adherence and drills in for detail). Nested dropdowns
// — Workout Review (closed) -> Day (closed) -> exercise/block (closed) -> log
// entries — instead of one long always-visible list, so the coach isn't
// scrolling past every exercise on every visit. Reuses the exact same chart
// components the client sees (WeightOverTimeChart/TopSetRepsChart).
export function CoachWorkoutReview({ clientId, exercises, onGenerateProgram, onEditProgram, onMessageClient, onExercisesChanged }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [phase, setPhase] = useState(null);
  const [modelKey, setModelKey] = useState(null);
  const [seedMsg, setSeedMsg] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [daily, setDaily] = useState([]);
  const [logsByExercise, setLogsByExercise] = useState({});
  const [memory, setMemory] = useState(null);

  const loadMemory = useCallback(() => fetchStrengthMemory(clientId).then(setMemory), [clientId]);
  useEffect(() => { loadMemory(); }, [loadMemory, exercises]);

  useEffect(() => {
    supabase.from("programs").select("phase,progression_model_key").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { setPhase(data?.phase || null); setModelKey(data?.progression_model_key || null); });
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

  const unset = exercises.filter((e) => !e.progression_method).length;
  const seed = async () => {
    setSeeding(true); setSeedMsg(null);
    const r = await seedProgressionForClient({ clientId, modelKey });
    setSeeding(false);
    const why = Object.entries(r.reasons || {}).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n} × ${k.replace(/\.$/, "")}`).join("; ");
    setSeedMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Set ${r.assigned} exercise${r.assigned === 1 ? "" : "s"}${r.skipped ? `; ${r.skipped} left for you — ${why}` : ""}${r.failed ? `; ${r.failed} failed` : ""}.` });
    onExercisesChanged?.();
  };
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
        summary={`${phase ? `Phase: ${phase}` : "No phase set"} · ${dayGroups.length} day${dayGroups.length === 1 ? "" : "s"}`}
        expanded={reviewOpen} onToggle={setReviewOpen}>
        {dayGroups.map((g) => <ReviewDay key={g.day} dayGroup={g} logsByExercise={logsByExercise} clientId={clientId} memory={memory} onMemoryChanged={loadMemory} />)}
      </CollapsibleSection>
      {unset > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: S.muted, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{unset} exercise{unset === 1 ? " has" : "s have"} no progression method{modelKey ? <> · program model: <b>{modelKey}</b></> : " · this program has no progression model"}.</span>
          {modelKey && <Btn sm teal onClick={seed} disabled={seeding}>{seeding ? "Setting up..." : "Auto-set from program model"}</Btn>}
        </div>
      )}
      {seedMsg && <div style={{ marginTop: 6, fontSize: 12, color: seedMsg.ok ? S.accent2 : S.danger }}>{seedMsg.text}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <Btn onClick={onGenerateProgram}>Generate/Regenerate Workout</Btn>
        <button onClick={onEditProgram} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.text }}>Edit Program</button>
        <button onClick={onMessageClient} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.text }}>Message Client</button>
      </div>
    </Card>
  );
}
