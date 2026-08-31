import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { DAY_ORDER } from "../../lib/constants.js";

// Next scheduled workout day (from the same exercises.day_of_week the Today
// preview and full program read), plus the next check-in due — both derived
// from real data. No coaching-call entry: there's no scheduling data
// anywhere in the app yet, so that row is intentionally left out.
export function UpcomingCard({ profile, doneToday, weeklyDone, setPage, goToWorkouts, showCheckins = true }) {
  const [days, setDays] = useState(new Set());

  useEffect(() => {
    supabase.from("exercises").select("day_of_week").eq("client_id", trainingOwnerId(profile))
      .then(({ data }) => setDays(new Set((data || []).map((e) => e.day_of_week).filter(Boolean))));
  }, [profile.id, profile.shared_program_owner_id]);

  const todayIdx = DAY_ORDER.indexOf(new Date().toLocaleDateString("en-US", { weekday: "long" }));
  let nextWorkoutDay = null;
  for (let i = 1; i <= 7; i++) {
    const day = DAY_ORDER[(todayIdx + i) % 7];
    if (days.has(day)) { nextWorkoutDay = day; break; }
  }

  const rows = [];
  if (nextWorkoutDay) rows.push({ icon: "🏋", label: nextWorkoutDay, sub: "Next workout" });
  if (showCheckins) {
    rows.push({ icon: "✅", label: doneToday ? "Tomorrow" : "Today", sub: "Daily check-in" });
    if (!weeklyDone) rows.push({ icon: "🔥", label: "This week", sub: "Weekly check-in due" });
  }

  return (
    <Card>
      <CardTitle>Upcoming</CardTitle>
      {rows.length === 0 && <div style={{ fontSize: 13, color: S.muted }}>Nothing scheduled — check back after your program updates.</div>}
      {rows.map((r, i) => (
        <div key={i} onClick={() => r.sub === "Next workout" ? goToWorkouts("next") : setPage(r.sub.includes("Weekly") ? "weekly" : "daily")}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: i < rows.length - 1 ? "1px solid " + S.border : "none", cursor: "pointer" }}>
          <span style={{ fontSize: 18 }}>{r.icon}</span>
          <div>
            <div style={{ fontSize: 13, color: S.text, fontWeight: 600 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: S.muted }}>{r.sub}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}
