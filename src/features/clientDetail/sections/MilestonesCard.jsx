import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Fld, Inp, RG, Btn, Alert, EmptyState } from "../../../components/ui/index.js";
import { MILESTONE_CATEGORY_LABELS, fetchMilestones, currentExerciseValue, milestoneProgress, markMilestoneAchieved, recordAchievement } from "../../../lib/milestones.js";

const CATEGORY_OPTIONS = Object.keys(MILESTONE_CATEGORY_LABELS);
const blankForm = () => ({ category: "strength", exercise_name: "", direction: "increase", unit: "lb", baseline_value: "", target_value: "", target_date: "", priority: "secondary" });

function MilestoneRow({ goal, onAchieved, onNextTarget }) {
  const [current, setCurrent] = useState(undefined);

  useEffect(() => {
    if (["strength", "rep_performance", "exercise_progression"].includes(goal.category) && goal.exercise_name) {
      currentExerciseValue(goal.client_id, goal.exercise_name, goal.unit === "reps").then(setCurrent);
    } else {
      setCurrent(null);
    }
  }, [goal.id]);

  useEffect(() => {
    if (current == null) return;
    const { achieved } = milestoneProgress(goal, current);
    if (achieved && !goal.achieved_at) recordAchievement(goal.id);
  }, [current, goal.id, goal.achieved_at]);

  if (current === undefined) return null;
  const { progressPct, achieved } = milestoneProgress(goal, current);
  const isPrimary = goal.priority === "primary";

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid " + S.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div>
          {isPrimary && <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.accent, fontWeight: 700, marginRight: 8 }}>Primary</span>}
          <span style={{ fontSize: 14, fontWeight: 700, color: S.text }}>{goal.exercise_name || MILESTONE_CATEGORY_LABELS[goal.category]}</span>
        </div>
        <span style={{ fontSize: 12, color: S.muted }}>{goal.baseline_value}{goal.unit} → {goal.target_value}{goal.unit}</span>
      </div>
      {progressPct != null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 4, background: S.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: progressPct + "%", background: achieved ? S.success : S.accent, borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>
            Current: {current}{goal.unit} · {progressPct}%
            {achieved && <span style={{ color: S.success, fontWeight: 700, marginLeft: 8 }}>ACHIEVED</span>}
          </div>
        </div>
      )}
      {achieved && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Btn sm onClick={() => onAchieved(goal.id)}>Mark Achieved</Btn>
          <Btn sm teal onClick={() => onNextTarget(goal)}>Set Next Target</Btn>
        </div>
      )}
    </div>
  );
}

// Exercise-based milestones, additive alongside the existing bodyweight
// GoalsSection -- see add_milestone_fields.sql for why these are kept
// separate instead of merged into that flow.
export function MilestonesCard({ client }) {
  const [milestones, setMilestones] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [nextTargetOf, setNextTargetOf] = useState(null);
  const [nextTargetValue, setNextTargetValue] = useState("");

  const load = useCallback(() => { fetchMilestones(client.id).then(setMilestones); }, [client.id]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.exercise_name || form.baseline_value === "" || form.target_value === "") return;
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("client_goals").insert({
      client_id: client.id, goal_type: "strength", metric_key: `exercise:${form.exercise_name.trim().toLowerCase()}`,
      category: form.category, exercise_name: form.exercise_name.trim(), priority: form.priority,
      direction: form.direction, unit: form.unit, baseline_value: Number(form.baseline_value), baseline_date: new Date().toISOString().slice(0, 10),
      target_value: Number(form.target_value), target_date: form.target_date || null,
    });
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setForm(blankForm()); setShowForm(false); load();
  };

  const achieve = async (id) => { await markMilestoneAchieved(id); load(); };

  const saveNextTarget = async () => {
    if (!nextTargetOf || nextTargetValue === "") return;
    await markMilestoneAchieved(nextTargetOf.id);
    await supabase.from("client_goals").insert({
      client_id: client.id, goal_type: nextTargetOf.goal_type, metric_key: nextTargetOf.metric_key,
      category: nextTargetOf.category, exercise_name: nextTargetOf.exercise_name, priority: nextTargetOf.priority,
      direction: nextTargetOf.direction, unit: nextTargetOf.unit, baseline_value: nextTargetOf.target_value, baseline_date: new Date().toISOString().slice(0, 10),
      target_value: Number(nextTargetValue), target_date: nextTargetOf.target_date,
    });
    setNextTargetOf(null); setNextTargetValue(""); load();
  };

  if (!milestones) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <CardTitle>Milestones</CardTitle>
        <Btn sm onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Add Milestone"}</Btn>
      </div>
      {milestones.length === 0 && !showForm && <EmptyState title="No milestones yet" sub="Add a strength, rep, or conditioning target to track alongside this client's phase." />}
      {milestones.map((g) => <MilestoneRow key={g.id} goal={g} onAchieved={achieve} onNextTarget={(g2) => { setNextTargetOf(g2); setNextTargetValue(""); }} />)}

      {showForm && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + S.border }}>
          <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Fld label="Category">
              <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 13, outline: "none" }}>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{MILESTONE_CATEGORY_LABELS[c]}</option>)}
              </select>
            </Fld>
            <Fld label="Exercise / Metric Name"><Inp value={form.exercise_name} onChange={(e) => setForm((p) => ({ ...p, exercise_name: e.target.value }))} placeholder="e.g. Bench Press" /></Fld>
            <Fld label="Priority"><RG options={["primary", "secondary"]} value={form.priority} onChange={(v) => setForm((p) => ({ ...p, priority: v }))} cap /></Fld>
            <Fld label="Direction"><RG options={["increase", "decrease"]} value={form.direction} onChange={(v) => setForm((p) => ({ ...p, direction: v }))} cap /></Fld>
            <Fld label="Unit"><Inp value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} placeholder="lb / reps" /></Fld>
            <Fld label="Target Date"><Inp type="date" value={form.target_date} onChange={(e) => setForm((p) => ({ ...p, target_date: e.target.value }))} /></Fld>
            <Fld label="Starting Value"><Inp type="number" value={form.baseline_value} onChange={(e) => setForm((p) => ({ ...p, baseline_value: e.target.value }))} /></Fld>
            <Fld label="Target Value"><Inp type="number" value={form.target_value} onChange={(e) => setForm((p) => ({ ...p, target_value: e.target.value }))} /></Fld>
          </div>
          <Btn onClick={create} disabled={saving}>{saving ? "Saving..." : "Save Milestone"}</Btn>
          <Alert variant={msg?.ok === false ? "error" : "success"}>{msg?.text}</Alert>
        </div>
      )}

      {nextTargetOf && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + S.border }}>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>Next target for {nextTargetOf.exercise_name} (starting from {nextTargetOf.target_value}{nextTargetOf.unit}):</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Inp type="number" value={nextTargetValue} onChange={(e) => setNextTargetValue(e.target.value)} placeholder="New target" />
            <Btn onClick={saveNextTarget}>Save</Btn>
            <button onClick={() => setNextTargetOf(null)} style={{ padding: "7px 14px", fontSize: 10, background: "transparent", color: S.text, border: "1px solid " + S.border, cursor: "pointer", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}
