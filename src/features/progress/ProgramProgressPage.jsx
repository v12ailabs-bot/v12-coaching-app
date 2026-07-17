import { useState, useEffect } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../../supabaseClient.js";
import { S, TT } from "../../theme.jsx";
import { Card, CardTitle, PageTitle, Stat, CC } from "../../components/ui/index.js";
import { PROGRAM_HABITS, streakBack } from "../../lib/constants.js";
import { StrengthTab } from "./StrengthTab.jsx";
import { ProgressPhotos } from "./PhotosSection.jsx";

const WD_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Progress page for program-only (no-coach) clients: body/strength/habits/photos
// tabs driven purely by their own daily-check-in self-tracking, no weekly
// check-ins or coach-set assessments involved.
export function ProgramProgress({ profile }) {
  const [tab, setTab] = useState("body");
  const [daily, setDaily] = useState([]);
  const [workoutDates, setWorkoutDates] = useState([]);
  const [scheduledDays, setScheduledDays] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: d } = await supabase.from("daily_checkins")
        .select("date,weight,waist,habit_flags").eq("client_id", profile.id).order("date");
      const { data: logs } = await supabase.from("workout_logs")
        .select("date").eq("client_id", profile.id);
      const { data: exs } = await supabase.from("exercises")
        .select("day_of_week").eq("client_id", profile.id);
      setDaily(d || []);
      setWorkoutDates([...new Set((logs || []).map((l) => l.date))].sort());
      setScheduledDays(new Set((exs || []).map((e) => e.day_of_week).filter(Boolean)));
      setLoading(false);
    })();
  }, [profile.id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const weightSeries = daily.filter((d) => d.weight != null).map((d) => ({ date: d.date, weight: d.weight }));
  const waistSeries = daily.filter((d) => d.waist != null).map((d) => ({ date: d.date, waist: d.waist }));
  const lastWeight = weightSeries.length ? weightSeries[weightSeries.length - 1].weight : null;
  const workoutsCompleted = workoutDates.length;

  const workoutSet = new Set(workoutDates);
  const workoutStreak = streakBack((date) => workoutSet.has(date));

  // Missed sessions: scheduled program days (by weekday) in the last 14 days
  // that have already passed with no matching workout_logs entry.
  const missedSessions = [];
  for (let i = 1; i <= 13; i++) {
    const dt = new Date(); dt.setUTCDate(dt.getUTCDate() - i);
    const dateStr = dt.toISOString().split("T")[0];
    if (scheduledDays.has(WD_NAMES[dt.getUTCDay()]) && !workoutSet.has(dateStr)) missedSessions.push(dateStr);
  }

  const flagsByDate = {}; daily.forEach((r) => { if (r.habit_flags) flagsByDate[r.date] = r.habit_flags; });
  const habitStreak = streakBack((date) => { const f = flagsByDate[date]; return !!f && PROGRAM_HABITS.every((h) => f[h.key]); });

  const flaggedDays = daily.filter((r) => r.habit_flags);
  const habitRate = (key) => (flaggedDays.length ? Math.round((flaggedDays.filter((r) => r.habit_flags[key]).length / 30) * 100) : 0);

  const ts = (id) => ({ padding: "10px 20px", fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600, cursor: "pointer", color: tab === id ? S.accent : S.muted, background: "none", border: "none", borderBottom: tab === id ? "2px solid " + S.accent : "2px solid transparent" });
  const empty = <Card style={{ textAlign: "center", padding: 40, color: S.muted }}>No data yet. Log it on your Daily Habits page.</Card>;

  return (
    <div>
      <PageTitle title="Progress" sub="Your data over time" />
      <Card style={{ borderLeft: "3px solid " + S.neon }}>
        <CardTitle>Progress Summary</CardTitle>
        <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          <Stat label="Recent Weight" value={lastWeight ?? "—"} unit={lastWeight ? "lb" : ""} />
          <Stat label="Workouts Completed" value={workoutsCompleted} unit="" />
          <Stat label="Workout Streak" value={workoutStreak} unit="days" />
          <Stat label="Habit Streak" value={habitStreak} unit="days" />
        </div>
      </Card>
      {missedSessions.length > 0 && (
        <Card style={{ borderLeft: "3px solid #ff6b5b" }}>
          <CardTitle>Missed Sessions</CardTitle>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>Scheduled program days in the last 14 with no logged workout:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {missedSessions.map((d) => (
              <span key={d} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", background: "rgba(255,107,91,.1)", border: "1px solid rgba(255,107,91,.3)", color: "#ff6b5b" }}>{d}</span>
            ))}
          </div>
        </Card>
      )}
      <div style={{ display: "flex", borderBottom: "1px solid " + S.border, margin: "8px 0 24px", flexWrap: "wrap" }}>
        {[["body", "Body"], ["strength", "Strength"], ["habits", "Habits"], ["photos", "Photos"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={ts(id)}>{label}</button>
        ))}
      </div>

      {tab === "body" && (weightSeries.length === 0 && waistSeries.length === 0 ? empty : (
        <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <CC title="Bodyweight Trend" sub="From your daily log">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightSeries.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={6} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} />
                <Tooltip {...TT} />
                <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CC>
          <CC title="Waist Trend" sub="From your daily log">
            {waistSeries.length === 0
              ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: S.muted, fontSize: 13 }}>Log your waist to see this chart</div>
              : <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={waistSeries.slice(-30)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={6} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} />
                    <Tooltip {...TT} />
                    <Line type="monotone" dataKey="waist" stroke={S.accent2} strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>}
          </CC>
        </div>
      ))}

      {tab === "strength" && <StrengthTab profile={profile} />}

      {tab === "habits" && (flaggedDays.length === 0 ? empty : (
        <div className="g3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
          {PROGRAM_HABITS.map((h) => (<Stat key={h.key} label={h.label + " (30d)"} value={habitRate(h.key)} unit="%" />))}
        </div>
      ))}

      {tab === "photos" && <ProgressPhotos profile={profile} />}
    </div>
  );
}
