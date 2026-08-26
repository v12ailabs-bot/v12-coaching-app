import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, localDateStr } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { groupByDay } from "../../lib/constants.js";

const DAYS_AHEAD = 14;

function upcomingDates(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push(localDateStr(d));
  }
  return out;
}

// exercises.day_of_week is still literally a weekday name under the hood
// (unchanged — too much existing program-generation/display logic reads it
// that way to safely rename it) but scheduled_workouts lets a client/coach
// assign that same workout content to any real calendar date, so the
// weekday label is just which slot it is, not which day it has to happen.
const weekdayOf = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });

// Resolves which day_of_week group's exercises count as "today's workout"
// for a client: an explicit schedule override for today if one exists
// (including an explicit rest day -> day_of_week null), else the legacy
// weekday auto-match every existing program already relies on -- so a
// client who's never touched the scheduler sees exactly the behavior they
// always have.
export async function resolveTodayDayOfWeek(clientId) {
  const today = localDateStr(new Date());
  const { data } = await supabase.from("scheduled_workouts").select("day_of_week").eq("client_id", clientId).eq("date", today).maybeSingle();
  if (data) return data.day_of_week;
  return weekdayOf(today);
}

// Reusable scheduler -- the same component for a coach editing a coaching
// client's schedule (Section 11: "coach can control the client's schedule
// directly") and a client editing their own. `trainOwnerId` is whose
// exercises define the available workout options (a linked training
// partner's, if shared training is set up); `clientId` is whose schedule
// these overrides belong to -- always the client's own id, never the
// partner's.
export function WorkoutScheduler({ clientId, trainOwnerId }) {
  const [exercises, setExercises] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const dates = upcomingDates(DAYS_AHEAD);

  const load = async () => {
    const [{ data: ex }, { data: sched }] = await Promise.all([
      supabase.from("exercises").select("day_of_week").eq("client_id", trainOwnerId),
      supabase.from("scheduled_workouts").select("*").eq("client_id", clientId).in("date", dates),
    ]);
    setExercises(ex || []);
    const byDate = {};
    (sched || []).forEach((r) => { byDate[r.date] = r; });
    setSchedule(byDate);
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId, trainOwnerId]);

  if (loading) return <div className="spinner" style={{ margin: "40px auto" }} />;

  const dayGroups = groupByDay(exercises).filter((g) => g.day !== "Unscheduled");

  const setDay = async (date, value) => {
    setSaving(date);
    if (value === "__auto__") {
      await supabase.from("scheduled_workouts").delete().eq("client_id", clientId).eq("date", date);
    } else {
      await supabase.from("scheduled_workouts").upsert(
        { client_id: clientId, date, day_of_week: value === "__rest__" ? null : value },
        { onConflict: "client_id,date" }
      );
    }
    await load();
    setSaving(null);
  };

  return (
    <Card>
      <CardTitle>Workout Schedule</CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
        Assign a workout to specific days, or leave a day on Auto to follow its usual weekday. Not locked to a fixed Monday-Sunday pattern.
      </div>
      {dayGroups.length === 0 ? (
        <div style={{ fontSize: 13, color: S.muted }}>No workouts assigned yet — nothing to schedule until at least one exists.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {dates.map((date, i) => {
            const row = schedule[date];
            const autoWeekday = weekdayOf(date);
            const autoGroup = dayGroups.find((g) => g.day === autoWeekday);
            const value = !row ? "__auto__" : (row.day_of_week == null ? "__rest__" : row.day_of_week);
            return (
              <div key={date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 2px", borderBottom: i < dates.length - 1 ? "1px solid " + S.border : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>
                    {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  {value === "__auto__" && <div style={{ fontSize: 11, color: S.muted }}>Auto: {autoGroup ? autoGroup.label : "rest"}</div>}
                </div>
                <select value={value} onChange={(e) => setDay(date, e.target.value)} disabled={saving === date}
                  style={{ background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "7px 10px", fontSize: 12, outline: "none", borderRadius: 6 }}>
                  <option value="__auto__">Auto (usual weekday)</option>
                  <option value="__rest__">Rest Day</option>
                  {dayGroups.map((g) => <option key={g.day} value={g.day}>{g.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
