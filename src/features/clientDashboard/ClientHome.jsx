import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr, localDateStr, useIsMobile } from "../../theme.jsx";
import { PageTitle, Btn, StatusBadge } from "../../components/ui/index.js";
import { CoachMessage, GoalInsightBanner, NewSummaryBanner, InvoiceCard } from "../../components/ClientBanners.jsx";
import { assessClientRisk } from "../../lib/scoring.js";
import { computeGoalScore } from "../../lib/scoring/goalScoring.js";
import { ClientHero } from "./ClientHero.jsx";
import { TodayWorkoutPreview } from "./TodayWorkoutPreview.jsx";
import { HabitSummary } from "./HabitSummary.jsx";
import { NutritionMacroBars } from "./NutritionMacroBars.jsx";
import { CheckInCard } from "./CheckInCard.jsx";
import { ProgressSnapshot } from "./ProgressSnapshot.jsx";
import { ProgressChart } from "./ProgressChart.jsx";
import { UpcomingCard } from "./UpcomingCard.jsx";
import { ProgramRoadmapCard } from "./ProgramRoadmapCard.jsx";

// Composed client dashboard. Each section below is a self-contained,
// self-fetching component (see ./*.jsx) — this file only loads the data
// needed for risk assessment/goal scoring, which several sections share.
export function ClientHome({ profile, setPage }) {
  const isMobile = useIsMobile();
  const [checkins, setCheckins] = useState([]);
  const [weeklyDone, setWeeklyDone] = useState(true);
  const [weeklyRecent, setWeeklyRecent] = useState([]);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riskOpen, setRiskOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: ci } = await supabase.from("daily_checkins").select("*").eq("client_id", profile.id).order("date");
      setCheckins(ci || []);
      const ws = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return localDateStr(d); })();
      const { data: wc } = await supabase.from("weekly_checkins").select("id").eq("client_id", profile.id).eq("date", ws).maybeSingle();
      setWeeklyDone(!!wc);
      // Last 28 days of weekly check-ins, same window CoachHome uses for the
      // recovery-trend flag in assessClientRisk.
      const wcutoff = new Date(); wcutoff.setDate(wcutoff.getDate() - 27);
      const { data: wr } = await supabase.from("weekly_checkins").select("date,sleep_quality,hydration_quality")
        .eq("client_id", profile.id).gte("date", localDateStr(wcutoff)).order("date");
      setWeeklyRecent(wr || []);
      const { data: g } = await supabase.from("client_goals").select("*").eq("client_id", profile.id).eq("status", "active").eq("metric_key", "bodyweight")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      setGoal(g || null);
      setLoading(false);
    })();
  }, [profile.id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const doneToday = checkins.some((c) => c.date === todayStr());
  // Same assessClientRisk the coach's Needs Attention board uses — the client
  // sees the same flags their coach does, phrased as the coach talking to them.
  const risk = assessClientRisk(profile, checkins, weeklyRecent, goal);
  // Same computeGoalScore GoalsSection/Progress use — one source of truth.
  const weightSeries = checkins.filter((c) => c.weight != null).map((c) => ({ date: c.date, value: c.weight }));
  const goalScore = goal ? computeGoalScore(goal, weightSeries, {}) : null;

  const progressBlock = checkins.length > 1 ? (
    <ProgressChart checkins={checkins} goal={goal} />
  ) : (
    <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: 12, textAlign: "center", padding: 48 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, marginBottom: 8 }}>No check-ins yet</div>
      <div style={{ color: S.muted, fontSize: 13, fontWeight: 500, marginBottom: 20 }}>Log your first daily check-in to start tracking.</div>
      <Btn onClick={() => setPage("daily")}>Start Now</Btn>
    </div>
  );

  return (
    <div>
      <PageTitle title={"Welcome back, " + ((profile.name || "").split(" ")[0] || "Athlete") + "."} sub={profile.goal || "Keep pushing."} />
      <CoachMessage profile={profile} />
      <GoalInsightBanner profile={profile} />
      <NewSummaryBanner profile={profile} setPage={setPage} />
      <InvoiceCard profile={profile} />

      {!doneToday && (
        <div style={{ background: "rgba(255,106,0,.09)", border: "1px solid rgba(255,106,0,.25)", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Reminder: Daily check-in not done yet.</span>
          <Btn sm onClick={() => setPage("daily")}>Do it now</Btn>
        </div>
      )}
      {!weeklyDone && (
        <div style={{ background: "rgba(0,201,167,.10)", border: "1px solid rgba(0,201,167,.28)", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Your weekly check-in is due this week — it's how your coach adjusts your plan.</span>
          <Btn sm teal onClick={() => setPage("weekly")}>Start weekly</Btn>
        </div>
      )}

      <div style={{ marginBottom: 14 }}><ClientHero profile={profile} risk={risk} goalScore={goalScore} setPage={setPage} /></div>

      {risk.flags.length > 0 && (
        <div style={{ background: S.surface, border: "1px solid " + S.border, borderLeft: "3px solid " + (risk.severity >= 2 ? S.danger : S.warning), marginBottom: 14, overflow: "hidden" }}>
          <div onClick={() => setRiskOpen((o) => !o)} style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
            <span style={{ fontSize: 11, color: S.accent, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: riskOpen ? "rotate(90deg)" : "none" }}>▶</span>
            <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>How you're tracking</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "60%" }}>
              <StatusBadge label={`${risk.riskLevel} Risk`} tone={risk.riskLevel === "High" ? "red" : risk.riskLevel === "Medium" ? "amber" : "neutral"} />
              {risk.flags.map((f, i) => <StatusBadge key={i} label={f.label} tone={f.tone === "red" ? "red" : "amber"} />)}
            </div>
          </div>
          {riskOpen && (
            <div style={{ padding: "0 18px 16px 43px" }}>
              {risk.flags.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: S.text, fontWeight: 500, padding: "6px 0", borderTop: i === 0 ? "1px solid " + S.border : "none", paddingTop: i === 0 ? 12 : 6 }}>
                  <div><span style={{ fontWeight: 600, color: f.tone === "red" ? S.danger : S.warning }}>{f.label}.</span> {f.clientMessage}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <TodayWorkoutPreview profile={profile} setPage={setPage} />
        <HabitSummary profile={profile} setPage={setPage} />
      </div>

      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <NutritionMacroBars profile={profile} checkins={checkins} setPage={setPage} />
        <CheckInCard doneToday={doneToday} adherenceScore={risk.adh?.score} setPage={setPage} />
      </div>

      {/* Mobile only: Progress Over Time goes right after Nutrition Targets
          instead of after the Program Roadmap, further down. Desktop keeps
          its original spot at the very end (see below) — this is the same
          `progressBlock` rendered in one of two positions, not duplicated. */}
      {isMobile && <div style={{ marginBottom: 14 }}>{progressBlock}</div>}

      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <ProgressSnapshot profile={profile} checkins={checkins} setPage={setPage} />
        <UpcomingCard profile={profile} doneToday={doneToday} weeklyDone={weeklyDone} setPage={setPage} />
      </div>

      <div style={{ marginBottom: 14 }}><ProgramRoadmapCard profile={profile} setPage={setPage} /></div>

      {!isMobile && progressBlock}
    </div>
  );
}
