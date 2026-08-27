import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr, localDateStr, trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { resolveDayOfWeekFor } from "../scheduling/WorkoutScheduler.jsx";
import { fetchOnboardingTasks, tasksByKey, isTaskActive } from "../../lib/onboardingTasks.js";

function ActionRow({ label, sub, done, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid " + S.border, cursor: onClick ? "pointer" : "default" }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
        background: done ? S.success : "transparent", color: done ? "#0B0B0D" : S.muted, border: done ? "none" : "1px solid " + S.border,
      }}>
        {done ? "✓" : ""}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: done ? S.muted : S.text, fontWeight: 500, textDecoration: done ? "line-through" : "none" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: S.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      {onClick && <span style={{ color: S.muted, fontSize: 14 }}>›</span>}
    </div>
  );
}

function Group({ title, items }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 2, fontWeight: 700 }}>{title}</div>
      {items.map((it, i) => <ActionRow key={i} {...it} />)}
    </div>
  );
}

// "What do I need to do next?" -- every row is derived from real data
// (today/tomorrow's scheduled exercises, workout_logs, daily/weekly
// check-ins), the same signals TodayWorkoutPreview/UpcomingCard already read.
// Renders nothing at all once there's genuinely no actionable item left,
// rather than showing empty section headers.
export function NextActionsCard({ profile, doneToday, weeklyDone, setPage, goToWorkouts }) {
  const [loading, setLoading] = useState(true);
  const [hasWorkoutToday, setHasWorkoutToday] = useState(false);
  const [loggedToday, setLoggedToday] = useState(false);
  const [tomorrowCategory, setTomorrowCategory] = useState(null);
  const [assessmentDue, setAssessmentDue] = useState(false);

  useEffect(() => {
    fetchOnboardingTasks(profile.id).then((tasks) => {
      const byKey = tasksByKey(tasks);
      const t = byKey.assessment;
      setAssessmentDue(!!t && t.status !== "completed" && isTaskActive(t, byKey));
    });
  }, [profile.id]);

  useEffect(() => {
    (async () => {
      const ownerId = trainingOwnerId(profile);
      const tomorrowStr = localDateStr(new Date(Date.now() + 86400000));
      const [{ data: exercises }, todayDow, tomorrowDow] = await Promise.all([
        supabase.from("exercises").select("day_of_week,category").eq("client_id", ownerId),
        resolveDayOfWeekFor(profile.id, todayStr()),
        resolveDayOfWeekFor(profile.id, tomorrowStr),
      ]);
      const list = exercises || [];
      const todays = list.filter((e) => e.day_of_week === todayDow);
      setHasWorkoutToday(todays.length > 0);
      const tomorrows = list.filter((e) => e.day_of_week === tomorrowDow);
      setTomorrowCategory(tomorrows.length > 0 ? (tomorrows[0].category || "Workout") : null);

      if (todays.length > 0) {
        const { count } = await supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("client_id", profile.id).eq("date", todayStr());
        setLoggedToday((count || 0) > 0);
      }
      setLoading(false);
    })();
  }, [profile.id, profile.shared_program_owner_id]);

  if (loading) return null;

  const dueToday = [];
  if (assessmentDue) dueToday.push({ label: "Complete your assessment", done: false, onClick: () => setPage("v12roadmap") });
  if (hasWorkoutToday) dueToday.push({ label: "Log today's workout", done: loggedToday, onClick: () => goToWorkouts("today") });
  dueToday.push({ label: "Complete today's check-in", done: doneToday, onClick: () => setPage("daily") });

  const dueTomorrow = [];
  if (tomorrowCategory) dueTomorrow.push({ label: `Tomorrow: ${tomorrowCategory}`, sub: "Upcoming workout", onClick: () => goToWorkouts("next") });

  const comingUp = [];
  if (!weeklyDone) comingUp.push({ label: "Weekly Check-In", sub: "Due this week", onClick: () => setPage("weekly") });

  if (dueToday.length === 0 && dueTomorrow.length === 0 && comingUp.length === 0) return null;

  return (
    <Card>
      <CardTitle>Your Next Actions</CardTitle>
      <Group title="Due Today" items={dueToday} />
      <Group title="Due Tomorrow" items={dueTomorrow} />
      <Group title="Coming Up" items={comingUp} />
    </Card>
  );
}
