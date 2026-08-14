import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Fld, Inp, RG, Btn, MetricCard, StatusBadge, Alert, EmptyState } from "../../../components/ui/index.js";
import { computeGoalScore } from "../../../lib/scoring/goalScoring.js";
import { nutritionAdherenceFrom } from "../../../lib/scoring/nutritionAdherence.js";

const CLASSIFICATION_TONE = { "On Track": "green", "Slightly Behind": "amber", "Off Track": "red", "Gathering Data": "neutral" };

// v1 only wires up metric_key 'bodyweight' — every client has daily_checkins.
// The client_goals schema supports other goal_type/metric_key combinations
// (measurements, strength, habits) already; extending this section to fetch
// their series is future work, not a schema change.
const DEFAULT_METRIC_KEY = "bodyweight";

// Opportunistic daily snapshot into client_goal_scores — the data pipeline
// future predictive analytics (plateau detection, churn risk, trend
// forecasting) will read from. One row per goal per calendar day, upserted
// on every view rather than needing a cron job. Skips entirely while the
// goal is still "Gathering Data" — a null score carries no trend signal.
// Fire-and-forget: never surfaces an error to the coach over a background
// row that has zero effect on anything they're looking at.
function recordSnapshot(goal, computed) {
  if (computed.overallScore == null) return;
  const today = new Date().toISOString().split("T")[0];
  supabase.from("client_goal_scores").upsert({
    goal_id: goal.id,
    client_id: goal.client_id,
    date: today,
    overall_score: computed.overallScore,
    classification: computed.classification,
    progress_ratio: computed.progressRatio,
    velocity: computed.velocity,
    eta_date: computed.etaDate ? computed.etaDate.toISOString().split("T")[0] : null,
    components: computed.components,
  }, { onConflict: "goal_id,date" }).then(() => {}, () => {});
}

export function GoalsSection({ client }) {
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [insight, setInsight] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState(null);
  const [form, setForm] = useState({ direction: "decrease", target_value: "", target_date: "" });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ direction: "decrease", target_value: "", target_date: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMsg, setEditMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 44);
    const cut = cutoff.toISOString().split("T")[0];
    const [{ data: goals }, { data: daily }, { data: weekly }, { data: nutPlan }, { data: habits }, { data: habitLogs }, { data: insights }] = await Promise.all([
      supabase.from("client_goals").select("*").eq("client_id", client.id).eq("status", "active").order("created_at", { ascending: false }).limit(1),
      supabase.from("daily_checkins").select("date,weight,calories,protein_g,carbs_g,fats_g,workout").eq("client_id", client.id).gte("date", cut).order("date"),
      supabase.from("weekly_checkins").select("date,bodyweight,sleep_quality,hydration_quality").eq("client_id", client.id).gte("date", cut).order("date"),
      supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id", client.id).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("habits").select("id").eq("client_id", client.id).eq("active", true),
      supabase.from("habit_logs").select("habit_id,date,done").eq("client_id", client.id).gte("date", cut),
      supabase.from("client_goal_insights").select("*").eq("client_id", client.id).order("created_at", { ascending: false }).limit(1),
    ]);

    const g = goals?.[0] || null;
    setGoal(g);
    setInsight(insights?.[0] || null);

    if (g) {
      const byDate = {};
      (daily || []).forEach(d => { if (d.weight != null) byDate[d.date] = d.weight; });
      (weekly || []).forEach(w => { if (w.bodyweight != null && byDate[w.date] == null) byDate[w.date] = w.bodyweight; });
      const series = Object.entries(byDate).map(([date, value]) => ({ date, value })).sort((a, b) => a.date < b.date ? -1 : 1);

      const nutrition = nutritionAdherenceFrom(daily || [], nutPlan || null, 30).score;

      const thirtyCut = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split("T")[0]; })();
      const recentDaily = (daily || []).filter(d => d.date >= thirtyCut);
      const training = recentDaily.length ? Math.round((recentDaily.filter(d => d.workout === "completed").length / recentDaily.length) * 100) : null;

      const recentWeekly = (weekly || []).slice(-4).filter(w => w.sleep_quality != null || w.hydration_quality != null);
      const recovery = recentWeekly.length
        ? Math.round((recentWeekly.reduce((s, w) => s + ((w.sleep_quality || 0) + (w.hydration_quality || 0)) / 2, 0) / recentWeekly.length) * 10)
        : null;

      const habitCount = (habits || []).length;
      const habit = habitCount ? Math.round(((habitLogs || []).filter(l => l.done).length / (habitCount * 30)) * 100) : null;

      const computed = computeGoalScore(g, series, { nutrition, training, recovery, habit });
      setScoreData(computed);
      recordSnapshot(g, computed);
    } else {
      setScoreData(null);
    }
    setLoading(false);
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  const createGoal = async () => {
    if (!form.target_value || !form.target_date) return;
    setCreating(true); setCreateMsg(null);
    // Baseline = the most recent logged weight (today's, if the client has one).
    const { data: latest } = await supabase.from("daily_checkins").select("date,weight").eq("client_id", client.id).not("weight", "is", null).order("date", { ascending: false }).limit(1).maybeSingle();
    if (!latest?.weight) {
      setCreating(false);
      setCreateMsg({ ok: false, text: "This client has no logged weight yet — they need at least one daily check-in with weight before a goal can be set." });
      return;
    }
    const { error } = await supabase.from("client_goals").insert({
      client_id: client.id,
      goal_type: "weight",
      metric_key: DEFAULT_METRIC_KEY,
      direction: form.direction,
      unit: "lb",
      baseline_value: latest.weight,
      baseline_date: latest.date,
      target_value: Number(form.target_value),
      target_date: form.target_date,
    });
    setCreating(false);
    if (error) { setCreateMsg({ ok: false, text: error.message }); return; }
    setForm({ direction: "decrease", target_value: "", target_date: "" });
    await load();
  };

  const startEdit = () => {
    setEditForm({ direction: goal.direction, target_value: String(goal.target_value), target_date: goal.target_date });
    setEditMsg(null);
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!editForm.target_value || !editForm.target_date) return;
    setSavingEdit(true); setEditMsg(null);
    const { error } = await supabase.from("client_goals").update({
      direction: editForm.direction,
      target_value: Number(editForm.target_value),
      target_date: editForm.target_date,
    }).eq("id", goal.id);
    setSavingEdit(false);
    if (error) { setEditMsg({ ok: false, text: error.message }); return; }
    setEditing(false);
    await load();
  };

  const generateInsight = async () => {
    setGenerating(true); setGenErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/goal-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ goal_id: goal.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate an insight.");
      setInsight(json.insight);
    } catch (e) { setGenErr(e.message); }
    finally { setGenerating(false); }
  };

  if (loading) return <div className="spinner" style={{ margin: "20px auto" }} />;

  if (!goal) {
    return (
      <Card>
        <CardTitle>Goal</CardTitle>
        <EmptyState title="No goal set yet" sub="Set a weight target below to start tracking real progress instead of a self-rated guess." />
        <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 8 }}>
          <Fld label="Direction"><RG options={["decrease", "increase", "maintain"]} value={form.direction} onChange={v => setForm(p => ({ ...p, direction: v }))} cap /></Fld>
          <Fld label="Target Weight (lb)"><Inp type="number" value={form.target_value} onChange={e => setForm(p => ({ ...p, target_value: e.target.value }))} placeholder="e.g. 180" /></Fld>
          <Fld label="Target Date"><Inp type="date" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))} /></Fld>
        </div>
        <Btn onClick={createGoal} disabled={creating}>{creating ? "Saving..." : "Set Goal"}</Btn>
        <Alert variant={createMsg?.ok ? "success" : "error"}>{createMsg?.text}</Alert>
      </Card>
    );
  }

  const s = scoreData || {};
  const etaText = s.etaDate ? s.etaDate.toISOString?.().slice(0, 10) || String(s.etaDate).slice(0, 10) : "—";

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <CardTitle>Goal — {goal.direction} to {goal.target_value}{goal.unit} by {goal.target_date}</CardTitle>
            <div style={{ fontSize: 11, color: S.muted }}>Baseline {goal.baseline_value}{goal.unit} on {goal.baseline_date}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {s.classification && <StatusBadge label={s.classification} tone={CLASSIFICATION_TONE[s.classification] || "neutral"} />}
            {!editing && <Btn sm onClick={startEdit}>Edit</Btn>}
          </div>
        </div>
        {editing ? (
          <>
            <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 8 }}>
              <Fld label="Direction"><RG options={["decrease", "increase", "maintain"]} value={editForm.direction} onChange={v => setEditForm(p => ({ ...p, direction: v }))} cap /></Fld>
              <Fld label="Target Weight (lb)"><Inp type="number" value={editForm.target_value} onChange={e => setEditForm(p => ({ ...p, target_value: e.target.value }))} placeholder="e.g. 180" /></Fld>
              <Fld label="Target Date"><Inp type="date" value={editForm.target_date} onChange={e => setEditForm(p => ({ ...p, target_date: e.target.value }))} /></Fld>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Btn onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving..." : "Save Changes"}</Btn>
              <button onClick={() => setEditing(false)} style={{ padding: "7px 14px", fontSize: 10, background: "transparent", color: S.text, border: "1px solid " + S.border, cursor: "pointer", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>Cancel</button>
            </div>
            <Alert variant={editMsg?.ok ? "success" : "error"}>{editMsg?.text}</Alert>
          </>
        ) : (
          <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            <MetricCard label="Goal Score" value={s.overallScore ?? "—"} unit={s.overallScore != null ? "/100" : ""} />
            <MetricCard label="Est. Completion" value={etaText} unit="" />
            <MetricCard label="Nutrition" value={s.components?.nutrition ?? "—"} unit={s.components?.nutrition != null ? "%" : ""} />
            <MetricCard label="Training" value={s.components?.training ?? "—"} unit={s.components?.training != null ? "%" : ""} />
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <CardTitle>AI Coaching Insight</CardTitle>
          <Btn sm teal onClick={generateInsight} disabled={generating || s.overallScore == null}>{generating ? "Generating..." : "Generate insight"}</Btn>
        </div>
        {s.overallScore == null && <div style={{ fontSize: 13, color: S.muted }}>Still gathering data — an insight needs at least a week of logging since the baseline date.</div>}
        <Alert variant="error">{genErr}</Alert>
        {insight ? (
          <div style={{ fontSize: 13.5, color: S.text, opacity: 0.92, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{insight.insight_text}</div>
        ) : (
          s.overallScore != null && <div style={{ fontSize: 13, color: S.muted }}>No insight generated yet.</div>
        )}
      </Card>
    </>
  );
}
