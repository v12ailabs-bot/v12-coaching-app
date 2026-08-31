import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS } from "../../theme.jsx";
import { Card, CardTitle, ProgressRing, CollapsibleSection } from "../../components/ui/index.js";
import { adherenceFrom } from "../../lib/scoring.js";
import { computeGoalScore } from "../../lib/scoring/goalScoring.js";
import { ProgramRoadmapPlanner, ProgramVersions } from "./sections/ProgramSection.jsx";
import { fetchOnboardingTasks } from "../../lib/onboardingTasks.js";

function KeyInsightTile({ label, value, unit, color }) {
  return (
    <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: color || S.text }}>{value}{unit || ""}</div>
    </div>
  );
}

// Mobile-only compact Overview: a "Client Overview" module (program/phase/
// progress/last check-in), a Key Insights metric grid, a compact Daily
// Habits icon row, a compact Onboarding summary, a 3-ring V12 Assessment
// summary, and everything less-frequently-used (Program Roadmap, Version
// History) folded into one collapsed-by-default accordion below. Desktop's
// Overview tab (the grid of full-size cards in ClientDetailPage.jsx) is
// completely untouched — this is a separate render path, gated by
// useIsMobile() in the caller.
export function ClientOverviewMobile({ client, trainOwnerId, progTick, loadEx, assess, lastCheckin }) {
  const [phase, setPhase] = useState(null);
  const [programName, setProgramName] = useState(null);
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [goal, setGoal] = useState(null);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [onboardingDone, setOnboardingDone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const cut30 = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split("T")[0]; })();
    const cut56 = (() => { const d = new Date(); d.setDate(d.getDate() - 55); return d.toISOString().split("T")[0]; })();
    Promise.all([
      supabase.from("programs").select("name,phase").eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("daily_checkins").select("date,weight,workout,diet").eq("client_id", client.id).gte("date", cut30).order("date"),
      supabase.from("weekly_checkins").select("date,sleep_quality").eq("client_id", client.id).gte("date", cut56).order("date"),
      supabase.from("client_goals").select("*").eq("client_id", client.id).eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("habits").select("*").eq("client_id", client.id).eq("active", true).order("order_index"),
      supabase.from("habit_logs").select("habit_id,date,done").eq("client_id", client.id).eq("date", new Date().toISOString().slice(0, 10)),
    ]).then(([p, d, w, g, h, hl]) => {
      setProgramName(p.data?.name || null);
      setPhase(p.data?.phase || null);
      setDaily(d.data || []);
      setWeekly(w.data || []);
      setGoal(g.data || null);
      setHabits(h.data || []);
      setHabitLogs(hl.data || []);
      setLoading(false);
    });
  }, [client.id]);

  useEffect(() => {
    fetchOnboardingTasks(client.id).then((tasks) => setOnboardingDone({ done: tasks.filter((t) => t.status === "completed").length, total: tasks.length }));
  }, [client.id]);

  if (loading) return <div className="spinner" style={{ margin: "40px auto" }} />;

  const adh = adherenceFrom(daily, 30);
  const weights = daily.filter((d) => d.weight != null);
  const weightChange = weights.length >= 2 ? weights[weights.length - 1].weight - weights[0].weight : null;
  const goalScore = goal ? computeGoalScore(goal, weights.map((w) => ({ date: w.date, value: w.weight })), {}) : null;
  const checkinRate = Math.round((new Set(daily.map((d) => d.date)).size / 30) * 100);
  const sleepVals = weekly.filter((w) => w.sleep_quality != null).map((w) => w.sleep_quality);
  const avgSleep = sleepVals.length ? (sleepVals.reduce((s, v) => s + v, 0) / sleepVals.length).toFixed(1) : null;

  const doneHabits = habits.filter((h) => habitLogs.some((l) => l.habit_id === h.id && l.done)).length;

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <CardTitle>Client Overview</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Program</div><div style={{ fontSize: 13, fontWeight: 600 }}>{programName || client.goal || "—"}</div></div>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Current Phase</div><div style={{ fontSize: 13, fontWeight: 600, color: S.neon }}>{phase || "Not set"}</div></div>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Progress</div><div style={{ fontSize: 13, fontWeight: 600, color: S.accent2 }}>{goalScore?.overallScore != null ? goalScore.overallScore + "%" : "—"}</div></div>
          <div><div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Last Check-in</div><div style={{ fontSize: 13, fontWeight: 600 }}>{lastCheckin || "None"}</div></div>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>Key Insights</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <KeyInsightTile label="Check-in Rate" value={checkinRate} unit="%" color={S.accent} />
          <KeyInsightTile label="Workout Adherence" value={adh.trainingRate} unit="%" color={S.accent2} />
          <KeyInsightTile label="Weight Change" value={weightChange != null ? (weightChange > 0 ? "+" : "") + weightChange.toFixed(1) : "—"} unit={weightChange != null ? " lb" : ""} />
          <KeyInsightTile label="Avg Sleep" value={avgSleep ?? "—"} unit={avgSleep ? "/10" : ""} />
        </div>
      </Card>

      {habits.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <CardTitle>Daily Habits <span style={{ fontWeight: 400, fontSize: 12, color: S.muted, textTransform: "none", letterSpacing: 0 }}>{doneHabits}/{habits.length} today</span></CardTitle>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            {habits.map((h) => {
              const done = habitLogs.some((l) => l.habit_id === h.id && l.done);
              return (
                <div key={h.id} style={{ textAlign: "center", width: 60 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", margin: "0 auto 4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: done ? "rgba(34,197,94,.16)" : S.surface2, border: "2px solid " + (done ? S.success : S.border) }}>
                    {done ? "✓" : "○"}
                  </div>
                  <div style={{ fontSize: 9, color: S.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {onboardingDone && onboardingDone.done < onboardingDone.total && (
        <Card style={{ marginBottom: 14 }}>
          <CardTitle>Onboarding <span style={{ fontWeight: 400, fontSize: 12, color: S.muted, textTransform: "none", letterSpacing: 0 }}>{onboardingDone.done}/{onboardingDone.total} complete</span></CardTitle>
          <div style={{ height: 6, background: S.surface2, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(onboardingDone.done / onboardingDone.total) * 100}%`, height: "100%", background: S.accent }} />
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>V12 Assessment — 3 Systems</CardTitle>
        <div style={{ display: "flex", justifyContent: "space-around", gap: 10 }}>
          <ProgressRing value={(assess.nervous_system_recruitment || 0) * 10} size={72} strokeWidth={7} color="#8B5CF6" caption="Nervous" />
          <ProgressRing value={(assess.muscular_density_to_size || 0) * 10} size={72} strokeWidth={7} color={S.accent} caption="Density" />
          <ProgressRing value={(assess.metabolic_work_capacity || 0) * 10} size={72} strokeWidth={7} color={S.accent2} caption="Capacity" />
        </div>
      </Card>

      <CollapsibleSection title="More" summary="Roadmap · Version History" expanded={secondaryOpen} onToggle={setSecondaryOpen}>
        <div id="section-program-roadmap" style={{ marginBottom: 16 }}><ProgramRoadmapPlanner clientId={trainOwnerId} /></div>
        <div id="section-program-history"><ProgramVersions clientId={trainOwnerId} refreshKey={progTick} onRestored={() => loadEx(trainOwnerId)} /></div>
      </CollapsibleSection>
    </div>
  );
}
