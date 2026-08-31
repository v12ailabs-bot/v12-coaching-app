import { useState, useEffect } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../../supabaseClient.js";
import { S, TT } from "../../theme.jsx";
import { Card, CardTitle, CC, PageTitle, ProgressRing } from "../../components/ui/index.js";
import { TodayWorkoutPreview } from "./TodayWorkoutPreview.jsx";
import { UpcomingCard } from "./UpcomingCard.jsx";
import { V12RoadmapCard } from "./V12RoadmapCard.jsx";

// V12 Program's Home tab — mirrors what coaching clients get on ClientHome
// without needing to look identical: today's workout, next workout, a
// weight-goal ring, weight/waist trend, and the generic (not coach-authored)
// onboarding roadmap. No check-in rows (this tier has none) and no coach-set
// program-phase roadmap (that's ProgramRoadmapCard, coaching-only) — the
// V12RoadmapCard's universal Day 0-30 journey fills that role here instead.
export function ProgramOnlyHome({ profile, setPage, goToWorkouts }) {
  const [daily, setDaily] = useState([]);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: g }] = await Promise.all([
        supabase.from("daily_checkins").select("date,weight,waist").eq("client_id", profile.id).order("date"),
        supabase.from("client_goals").select("*").eq("client_id", profile.id).eq("status", "active").eq("metric_key", "bodyweight")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setDaily(d || []);
      setGoal(g || null);
      setLoading(false);
    })();
  }, [profile.id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const weightSeries = daily.filter((d) => d.weight != null).map((d) => ({ date: d.date, weight: d.weight }));
  const waistSeries = daily.filter((d) => d.waist != null).map((d) => ({ date: d.date, waist: d.waist }));
  const lastWeight = weightSeries.length ? weightSeries[weightSeries.length - 1].weight : null;
  const tickEvery = (n) => Math.max(1, Math.floor(n / 8));

  // Same percent-to-goal math as ProgramProgressPage's goal card — one
  // source of truth for "how close am I" between Home and Progress.
  const goalDiff = goal && lastWeight != null
    ? Math.round(((goal.direction === "increase" ? lastWeight - goal.baseline_value : goal.baseline_value - lastWeight)) * 10) / 10
    : null;
  const totalNeeded = goal ? Math.abs(goal.target_value - goal.baseline_value) : null;
  const pctToGoal = goal && goalDiff != null && totalNeeded
    ? Math.max(0, Math.min(100, Math.round((goalDiff / totalNeeded) * 100)))
    : null;

  return (
    <div>
      <PageTitle title={"Welcome back, " + ((profile.name || "").split(" ")[0] || "Athlete") + "."} sub={profile.goal || "Keep pushing."} />

      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <TodayWorkoutPreview profile={profile} onViewFull={() => goToWorkouts("today")} />
        <UpcomingCard profile={profile} setPage={setPage} goToWorkouts={goToWorkouts} showCheckins={false} />
      </div>

      <Card style={{ marginBottom: 14, borderLeft: "3px solid " + S.accent2 }}>
        <CardTitle>Goal Progress</CardTitle>
        {goal ? (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <ProgressRing value={pctToGoal ?? 0} size={96} color={S.accent2} caption="TO GOAL" />
            <div style={{ fontSize: 13, color: S.text, maxWidth: 320 }}>
              {pctToGoal != null
                ? <><strong style={{ color: S.accent2 }}>{pctToGoal}%</strong> on track to hit {goal.target_value}{goal.unit} by {goal.target_date}.</>
                : "Log a bodyweight check-in to start tracking your progress toward this goal."}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: S.muted }}>Set a weight goal on your Progress page to track it here.</div>
        )}
      </Card>

      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <CC title="Weight Trend" sub="From your daily log">
          {weightSeries.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: S.muted, fontSize: 13 }}>Log your weight to see this chart</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={tickEvery(weightSeries.length)} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} />
                <Tooltip {...TT} />
                <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CC>
        <CC title="Waist Trend" sub="From your daily log">
          {waistSeries.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: S.muted, fontSize: 13 }}>Log your waist to see this chart</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={waistSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={tickEvery(waistSeries.length)} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} />
                <Tooltip {...TT} />
                <Line type="monotone" dataKey="waist" stroke={S.accent2} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CC>
      </div>

      <V12RoadmapCard profile={profile} setPage={setPage} />
    </div>
  );
}
