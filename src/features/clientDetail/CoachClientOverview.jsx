import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS, todayStr } from "../../theme.jsx";
import { Card, CardTitle, StatusBadge, RG, Modal, Btn } from "../../components/ui/index.js";
import {
  adherenceFrom, nutritionScoreFrom, workoutAdherenceFrom, avgSleepHoursFrom,
  weightChangeFrom, programCalendarProgressFrom, habitAdherenceFrom, isHabitSatisfied,
  targetStatus, assessClientRisk,
} from "../../lib/scoring.js";
import { CoachHabits } from "./sections/DailyHabitsSection.jsx";

const MACRO_FIELDS = ["calories", "protein_g", "carbs_g", "fats_g"];
const STATUS_TONE = { "On Target": "green", "Near Target": "amber", "Over Target": "red", "Above Target": "amber", "Under Target": "amber" };

function KeyInsightTile({ label, timeframe, value, unit, color }) {
  return (
    <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: color || S.text }}>{value}{unit || ""}</div>
      <div style={{ fontSize: 10, color: S.muted, marginTop: 2 }}>{timeframe}</div>
    </div>
  );
}

function targetLabel(habit, planTarget) {
  if (habit.type === "linked_check_in_value" && MACRO_FIELDS.includes(habit.linked_field)) return planTarget ?? null;
  return habit.target_value ?? null;
}

// The single per-client Overview screen (item 7 of the Today/Coach View
// redesign) — supersedes ClientOverviewMobile.jsx and ProgressSummaryCard.jsx
// (their metrics fold into Key Insights below) and the adherence-display
// half of DailyHabitsPanel.jsx (CoachHabits, the habit *management* UI,
// stays — it's reused here as "Edit client targets"). Program Roadmap/
// History and Onboarding/Assessment stay in ClientDetailPage below this,
// untouched. Every number here is computed from real data (src/lib/scoring.js)
// — never a hardcoded mockup value.
export function CoachClientOverview({ client, onAddNote }) {
  const [program, setProgram] = useState(null);
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [goal, setGoal] = useState(null);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [planTarget, setPlanTarget] = useState({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(14);
  const [showEditTargets, setShowEditTargets] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const cut35 = (() => { const d = new Date(); d.setDate(d.getDate() - 34); return d.toISOString().split("T")[0]; })();
    const cut56 = (() => { const d = new Date(); d.setDate(d.getDate() - 55); return d.toISOString().split("T")[0]; })();
    return Promise.all([
      supabase.from("programs").select("name,phase,start_date,weeks").eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("daily_checkins").select("*").eq("client_id", client.id).gte("date", cut35).order("date"),
      supabase.from("weekly_checkins").select("date,sleep_quality,hydration_quality,bodyweight").eq("client_id", client.id).gte("date", cut56).order("date"),
      supabase.from("client_goals").select("*").eq("client_id", client.id).eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("habits").select("*").eq("client_id", client.id).eq("active", true).order("order_index"),
      supabase.from("habit_logs").select("*").eq("client_id", client.id).gte("date", cut35),
      supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id", client.id).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([p, d, w, g, h, hl, plan]) => {
      setProgram(p.data || null);
      setDaily(d.data || []);
      setWeekly(w.data || []);
      setGoal(g.data || null);
      setHabits(h.data || []);
      setHabitLogs(hl.data || []);
      setPlanTarget(plan.data || {});
      setLoading(false);
    });
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Card style={{ marginBottom: 0 }}><div className="spinner" style={{ margin: "30px auto" }} /></Card>;

  const today = todayStr();
  const todaysCheckin = daily.find((d) => d.date === today) || null;
  const backdated = todaysCheckin && todaysCheckin.submitted_date && todaysCheckin.submitted_date !== todaysCheckin.date;

  // Weight series merges daily.weight + weekly.bodyweight by date (daily
  // wins on a tie) — same rule ProgressPage.jsx/ClientHero.jsx use, so this
  // never disagrees with the client's own Progress tab.
  const weights = (() => {
    const byDate = {};
    daily.forEach((d) => { if (d.weight != null) byDate[d.date] = d.weight; });
    weekly.forEach((w) => { if (w.bodyweight != null && byDate[w.date] == null) byDate[w.date] = w.bodyweight; });
    return Object.entries(byDate).map(([date, weight]) => ({ date, weight })).sort((a, b) => (a.date < b.date ? -1 : 1));
  })();

  const risk = assessClientRisk(client, daily, weekly, goal);
  const topFlag = risk.flags.find((f) => f.tone === "red") || risk.flags[0] || null;

  const checkInRate = adherenceFrom(daily, 30).score;
  const workoutAdh = workoutAdherenceFrom(daily, 30);
  const weightChange = weightChangeFrom(weights, 30);
  const avgSleep = avgSleepHoursFrom(daily, 30);
  const nut = nutritionScoreFrom(daily, 30);
  const progress = programCalendarProgressFrom(program);

  const checkinByDate = {};
  daily.forEach((d) => { checkinByDate[d.date] = d; });
  const { overall: habitOverall, perHabit } = habitAdherenceFrom(habits, habitLogs, { days: period, checkinByDate });
  const windowDates = Array.from({ length: period }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (period - 1 - i)); return d.toISOString().split("T")[0]; });
  const trackedToday = habits.filter((h) => {
    const value = h.type === "linked_check_in_value" ? todaysCheckin?.[h.linked_field] : habitLogs.find((l) => l.habit_id === h.id && l.date === today)?.value;
    const done = habitLogs.some((l) => l.habit_id === h.id && l.date === today && l.done);
    return isHabitSatisfied(h, { done, value });
  }).length;

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <CardTitle>Client Overview</CardTitle>
          <StatusBadge label={!todaysCheckin ? "Not submitted today" : backdated ? "Submitted · Backdated" : "Submitted today"} tone={!todaysCheckin ? "neutral" : backdated ? "amber" : "green"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Program</div><div style={{ fontSize: 13, fontWeight: 600 }}>{program?.name || client.goal || "—"}</div></div>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Current Phase</div><div style={{ fontSize: 13, fontWeight: 600, color: S.neon }}>{program?.phase || "Not set"}</div></div>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Progress</div><div style={{ fontSize: 13, fontWeight: 600, color: S.accent2 }}>{progress ? `${progress.pct}% · wk ${progress.elapsedWeeks} of ${progress.totalWeeks}` : "—"}</div></div>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Last Check-In</div><div style={{ fontSize: 13, fontWeight: 600 }}>{daily.length ? daily[daily.length - 1].date : "None"}</div></div>
        </div>
      </Card>

      <Card style={{ marginBottom: 14, borderLeft: "3px solid " + (topFlag?.tone === "red" ? S.danger : topFlag ? S.warning : S.success) }}>
        <CardTitle>Attention Needed</CardTitle>
        {topFlag ? (
          <>
            <div style={{ fontSize: 13, color: S.text, marginBottom: 6 }}>{topFlag.detail}</div>
            <div style={{ fontSize: 12, color: S.muted }}>Recommendation: {topFlag.action}</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: S.muted }}>On track — no flags this period.</div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>Key Insights</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <KeyInsightTile label="Check-In Rate" timeframe="over the last 30 days" value={checkInRate} unit="%" color={S.accent} />
          <KeyInsightTile label="Workout Adherence" timeframe="scheduled days, last 30 days" value={workoutAdh.score ?? "—"} unit={workoutAdh.score != null ? "%" : ""} color={S.accent2} />
          <KeyInsightTile label="Weight Change" timeframe="over the last 30 days" value={weightChange.delta != null ? (weightChange.delta > 0 ? "+" : "") + weightChange.delta.toFixed(1) : "—"} unit={weightChange.delta != null ? " lb" : ""} />
          <KeyInsightTile label="Avg Sleep" timeframe="over the last 30 days" value={avgSleep ?? "—"} unit={avgSleep != null ? "h" : ""} />
        </div>
      </Card>

      {habits.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
            <CardTitle>Daily Habits</CardTitle>
            <RG options={["14D", "30D"]} value={period === 14 ? "14D" : "30D"} onChange={(v) => setPeriod(v === "14D" ? 14 : 30)} />
          </div>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 14 }}>{trackedToday}/{habits.length} tracked today · {habitOverall ?? 0}% adherence ({period}d)</div>
          {habits.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + S.border }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
              <div style={{ display: "flex", gap: 2, flexShrink: 0, flexWrap: "wrap", maxWidth: 240 }}>
                {windowDates.map((d) => {
                  const value = h.type === "linked_check_in_value" ? checkinByDate[d]?.[h.linked_field] : habitLogs.find((l) => l.habit_id === h.id && l.date === d)?.value;
                  const done = habitLogs.some((l) => l.habit_id === h.id && l.date === d && l.done);
                  const satisfied = isHabitSatisfied(h, { done, value });
                  const isBackdated = checkinByDate[d]?.submitted_date && checkinByDate[d].submitted_date !== d;
                  return <div key={d} title={d} style={{ width: 10, height: 10, borderRadius: 2, background: satisfied ? S.success : S.surface2, border: "1px solid " + (isBackdated ? S.warning : S.border) }} />;
                })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: S.accent2, width: 34, textAlign: "right", flexShrink: 0 }}>{perHabit[h.id]?.pct ?? 0}%</div>
            </div>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>Today's Targets</CardTitle>
        {habits.length === 0 && <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>No habits assigned yet.</div>}
        {habits.map((h) => {
          const target = targetLabel(h, planTarget[h.linked_field]);
          const value = h.type === "linked_check_in_value" ? todaysCheckin?.[h.linked_field] : habitLogs.find((l) => l.habit_id === h.id && l.date === today)?.value;
          const done = habitLogs.some((l) => l.habit_id === h.id && l.date === today && l.done);
          const satisfied = isHabitSatisfied(h, { done, value });
          const status = h.type === "completion_button" ? (satisfied ? "Complete" : "Incomplete") : (value != null ? targetStatus(Number(value), target, h.target_direction) : "Incomplete");
          const inputType = h.type === "completion_button" ? "Completion button" : h.type === "manual_value" ? "Manual value" : `Linked to check-in (${h.linked_field})`;
          return (
            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid " + S.border, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: S.text }}>{h.name}</div>
                <div style={{ fontSize: 10, color: S.muted }}>Input type set by coach · {inputType}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {h.type !== "completion_button" && <span style={{ fontSize: 12, color: S.muted }}>{value ?? "—"} / {target ?? "—"}{h.unit || (MACRO_FIELDS.includes(h.linked_field) ? "g" : "")}</span>}
                <StatusBadge label={status || "Incomplete"} tone={STATUS_TONE[status] || (satisfied ? "green" : "neutral")} />
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid " + S.border }}>
          <div style={{ fontSize: 13, color: S.text }}>Workout</div>
          <StatusBadge label={todaysCheckin?.workout ? todaysCheckin.workout[0].toUpperCase() + todaysCheckin.workout.slice(1) : "Incomplete"} tone={todaysCheckin?.workout === "completed" ? "green" : todaysCheckin?.workout === "missed" ? "red" : "neutral"} />
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>Check-In Values</CardTitle>
        {!todaysCheckin ? <div style={{ fontSize: 12, color: S.muted }}>No check-in submitted today.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
            <div>Weight <strong>{todaysCheckin.weight ?? "—"}{todaysCheckin.weight != null ? " lb" : ""}</strong></div>
            <div>Calories <strong>{todaysCheckin.calories ?? "—"}{todaysCheckin.calories != null ? " kcal" : ""}</strong></div>
            <div>Protein <strong>{todaysCheckin.protein_g ?? "—"}{todaysCheckin.protein_g != null ? " g" : ""}</strong></div>
            <div>Carbs <strong>{todaysCheckin.carbs_g ?? "—"}{todaysCheckin.carbs_g != null ? " g" : ""}</strong></div>
            <div>Fat <strong>{todaysCheckin.fats_g ?? "—"}{todaysCheckin.fats_g != null ? " g" : ""}</strong></div>
            <div>Water <strong>{todaysCheckin.water ?? "—"}{todaysCheckin.water != null ? " glasses" : ""}</strong></div>
            <div>Sleep <strong>{todaysCheckin.sleep_hours ?? "—"}{todaysCheckin.sleep_hours != null ? " hours" : ""}</strong></div>
            <div>Steps <strong>{todaysCheckin.steps ?? "—"}</strong></div>
            <div>Energy <strong>{todaysCheckin.energy ?? "—"}{todaysCheckin.energy != null ? "/10" : ""}</strong></div>
            <div>Mood <strong>{todaysCheckin.mood ?? "—"}{todaysCheckin.mood != null ? "/10" : ""}</strong></div>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>Nutrition Adherence</CardTitle>
        <div style={{ fontSize: 13, color: S.text, marginBottom: 6 }}>Nutrition adherence · <strong>{nut.score != null ? `${nut.score}%` : "No data"}</strong></div>
        <div style={{ fontSize: 12, color: S.muted }}>{nut.score != null ? `Self-rated diet quality has averaged ${nut.score}% across ${nut.n} check-ins in the last 30 days.` : "Not enough recent check-ins to assess."}</div>
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <CardTitle>Coach Actions</CardTitle>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={onAddNote}>Add coaching note</Btn>
          <button onClick={() => setShowEditTargets(true)} style={{ padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.text, borderRadius: RADIUS.md }}>Edit client targets</button>
        </div>
      </Card>

      {showEditTargets && (
        <Modal title="Edit Client Targets" onClose={() => { setShowEditTargets(false); load(); }}>
          <CoachHabits clientId={client.id} onChanged={load} />
        </Modal>
      )}
    </div>
  );
}
