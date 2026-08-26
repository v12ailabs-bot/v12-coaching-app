import { useState, useEffect } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../../supabaseClient.js";
import { S, TT } from "../../theme.jsx";
import { Card, CardTitle, PageTitle, Stat, CC, Fld, Inp, RG, Btn, Alert, ProgressRing } from "../../components/ui/index.js";
import { PROGRAM_HABITS, streakBack } from "../../lib/constants.js";
import { StrengthTab } from "./StrengthTab.jsx";
import { ProgressPhotos } from "./PhotosSection.jsx";

const WD_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Friendlier phrasing than the raw client_goals.direction enum value.
const DIRECTION_VERB = { decrease: "Lose to", increase: "Gain to", maintain: "Maintain at" };
const DIFF_LABEL = { decrease: "Total Lost", increase: "Total Gained", maintain: "Change" };

// Progress page for program-only (no-coach) clients: body/strength/habits/photos
// tabs driven purely by their own daily-check-in self-tracking, no weekly
// check-ins or coach-set assessments involved.
export function ProgramProgress({ profile }) {
  const [tab, setTab] = useState("body");
  const [daily, setDaily] = useState([]);
  const [workoutDates, setWorkoutDates] = useState([]);
  const [scheduledDays, setScheduledDays] = useState(new Set());
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ direction: "decrease", target_value: "", target_date: "" });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: d } = await supabase.from("daily_checkins")
        .select("date,weight,waist,habit_flags").eq("client_id", profile.id).order("date");
      const { data: logs } = await supabase.from("workout_logs")
        .select("date").eq("client_id", profile.id);
      const { data: exs } = await supabase.from("exercises")
        .select("day_of_week").eq("client_id", profile.id);
      // The client's single active bodyweight goal — same client_goals row
      // GoalsSection/ProgressPage read, computed here without AI so it never
      // costs a generation credit just to view it.
      const { data: g } = await supabase.from("client_goals")
        .select("*").eq("client_id", profile.id).eq("status", "active").eq("metric_key", "bodyweight")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      setDaily(d || []);
      setWorkoutDates([...new Set((logs || []).map((l) => l.date))].sort());
      setScheduledDays(new Set((exs || []).map((e) => e.day_of_week).filter(Boolean)));
      setGoal(g || null);
      setLoading(false);
    })();
  }, [profile.id]);

  // Self-service goal creation — program-only clients have no coach touchpoint
  // to set this for them (the coach's Goals section is hidden for this client
  // type), so it has to be settable from their own Progress page instead.
  // Baseline is their latest already-logged daily-checkin weight — no new query.
  const createGoal = async () => {
    if (!form.target_value || !form.target_date) return;
    const latest = daily.filter((d) => d.weight != null).slice(-1)[0];
    if (!latest) { setCreateMsg({ ok: false, text: "Log at least one daily check-in with your weight first, then come back to set a goal." }); return; }
    setCreating(true); setCreateMsg(null);
    const { error } = await supabase.from("client_goals").insert({
      client_id: profile.id, goal_type: "weight", metric_key: "bodyweight",
      direction: form.direction, unit: "lb", baseline_value: latest.weight, baseline_date: latest.date,
      target_value: Number(form.target_value), target_date: form.target_date,
    });
    setCreating(false);
    if (error) { setCreateMsg({ ok: false, text: error.message }); return; }
    setForm({ direction: "decrease", target_value: "", target_date: "" });
    const { data: g } = await supabase.from("client_goals").select("*").eq("client_id", profile.id)
      .eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setGoal(g || null);
  };

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const weightSeries = daily.filter((d) => d.weight != null).map((d) => ({ date: d.date, weight: d.weight }));
  const waistSeries = daily.filter((d) => d.waist != null).map((d) => ({ date: d.date, waist: d.waist }));
  const lastWeight = weightSeries.length ? weightSeries[weightSeries.length - 1].weight : null;
  const workoutsCompleted = workoutDates.length;
  const tickEvery = (n) => Math.max(1, Math.floor(n / 8));

  const workoutSet = new Set(workoutDates);
  const workoutStreak = streakBack((date) => workoutSet.has(date));

  // Goal progress card fields — plain arithmetic off already-loaded data, no
  // AI generation involved.
  const goalWorkouts = goal ? workoutDates.filter((d) => d >= goal.baseline_date).length : 0;
  const goalDiff = goal && lastWeight != null
    ? Math.round(((goal.direction === "increase" ? lastWeight - goal.baseline_value : goal.baseline_value - lastWeight)) * 10) / 10
    : null;
  // Percent-to-goal, from real logged data only — never a placeholder. Null
  // (not 0) until there's at least one weight log to compute against, so the
  // ring can tell "0% progress" apart from "no data yet".
  const totalNeeded = goal ? Math.abs(goal.target_value - goal.baseline_value) : null;
  const pctToGoal = goal && goalDiff != null && totalNeeded
    ? Math.max(0, Math.min(100, Math.round((goalDiff / totalNeeded) * 100)))
    : null;

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
      {goal ? (
        <Card style={{ borderLeft: "3px solid " + S.accent2 }}>
          <CardTitle>Goal — {DIRECTION_VERB[goal.direction] || goal.direction} {goal.target_value}{goal.unit} by {goal.target_date}</CardTitle>
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>Started {goal.baseline_date} at {goal.baseline_value}{goal.unit}</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <ProgressRing value={pctToGoal ?? 0} size={96} color={S.accent2} caption="TO GOAL" />
            <div style={{ fontSize: 13, color: S.text, maxWidth: 320 }}>
              {pctToGoal != null
                ? <><strong style={{ color: S.accent2 }}>{pctToGoal}%</strong> on track to hit your target by {goal.target_date}.</>
                : "Log a bodyweight check-in to start tracking your progress toward this goal."}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 16 }}>
            <Stat label="Starting Point" value={goal.baseline_value} unit={goal.unit} />
            <Stat label="Current Weight" value={lastWeight ?? "—"} unit={lastWeight != null ? goal.unit : ""} />
            <Stat label={DIFF_LABEL[goal.direction] || "Change"} value={goalDiff ?? "—"} unit={goalDiff != null ? goal.unit : ""} />
            <Stat label="Workouts Since Start" value={goalWorkouts} unit="" />
            <Stat label="Current Streak" value={workoutStreak} unit="days" />
          </div>
        </Card>
      ) : (
        <Card>
          <CardTitle>Set a Goal</CardTitle>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 12 }}>Set a weight target to start tracking real progress here.</div>
          <div className="g3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 16, marginBottom: 8 }}>
            <Fld label="Direction"><RG options={["decrease", "increase", "maintain"]} value={form.direction} onChange={(v) => setForm((p) => ({ ...p, direction: v }))} cap /></Fld>
            <Fld label="Target Weight (lb)"><Inp type="number" value={form.target_value} onChange={(e) => setForm((p) => ({ ...p, target_value: e.target.value }))} placeholder="e.g. 180" /></Fld>
            <Fld label="Target Date"><Inp type="date" value={form.target_date} onChange={(e) => setForm((p) => ({ ...p, target_date: e.target.value }))} /></Fld>
          </div>
          <Btn onClick={createGoal} disabled={creating}>{creating ? "Saving..." : "Set Goal"}</Btn>
          <Alert variant={createMsg?.ok ? "success" : "error"}>{createMsg?.text}</Alert>
        </Card>
      )}
      {missedSessions.length > 0 && (
        <Card style={{ borderLeft: "3px solid " + S.danger }}>
          <CardTitle>Missed Sessions</CardTitle>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>Scheduled program days in the last 14 with no logged workout:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {missedSessions.map((d) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: S.surface2, border: "1px solid " + S.border }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: S.danger, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: S.text }}>
                  {new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
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
              <LineChart data={weightSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={tickEvery(weightSeries.length)} />
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
                  <LineChart data={waistSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={tickEvery(waistSeries.length)} />
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
