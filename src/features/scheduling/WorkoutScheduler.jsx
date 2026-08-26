import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, localDateStr } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { groupByDay } from "../../lib/constants.js";

const DAYS_AHEAD = 14;
const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = { Monday: "MON", Tuesday: "TUE", Wednesday: "WED", Thursday: "THU", Friday: "FRI", Saturday: "SAT", Sunday: "SUN" };
// One color per workout-day slot, cycled if there are more than 7 (there
// can't be, since there are only 7 weekdays to hold them) — distinct,
// legible against the dark theme, and reused consistently so a given day's
// color means the same thing everywhere it shows up in the scheduler.
const DAY_GROUP_COLORS = [S.accent, S.accent2, "#8B5CF6", "#3B82F6", "#F59E0B", "#EF4444", "#22C55E"];

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

// Fixed Weekly mode: lock each workout-day slot (Day 1, Day 2, ...) to a
// specific weekday, exactly like a traditional Monday-Sunday program --
// click a weekday button to assign or swap which slot lives there. A swap,
// not an overwrite: reassigning Day 2 onto Monday moves whoever was on
// Monday to wherever Day 2 used to be, so nothing gets silently orphaned.
// This edits exercises.day_of_week directly (the underlying source of
// truth), unlike Free Schedule below, which layers date-specific overrides
// on top without touching it.
function FixedWeeklySchedule({ trainOwnerId, exercises, onReload }) {
  const [openWeekday, setOpenWeekday] = useState(null);
  const [saving, setSaving] = useState(false);
  const dayGroups = groupByDay(exercises).filter((g) => g.day !== "Unscheduled");
  const colorForWeekday = (weekday) => {
    const idx = dayGroups.findIndex((g) => g.day === weekday);
    return idx === -1 ? null : DAY_GROUP_COLORS[idx % DAY_GROUP_COLORS.length];
  };

  const assign = async (weekday, targetGroupDay) => {
    setSaving(true); setOpenWeekday(null);
    const occupant = dayGroups.find((g) => g.day === weekday);
    if (targetGroupDay === "__rest__") {
      if (occupant) await supabase.from("exercises").update({ day_of_week: null }).in("id", occupant.exercises.map((e) => e.id));
    } else {
      const targetGroup = dayGroups.find((g) => g.day === targetGroupDay);
      if (targetGroup && targetGroup.day !== weekday) {
        await supabase.from("exercises").update({ day_of_week: weekday }).in("id", targetGroup.exercises.map((e) => e.id));
        if (occupant && occupant.day !== targetGroup.day) {
          await supabase.from("exercises").update({ day_of_week: targetGroup.day }).in("id", occupant.exercises.map((e) => e.id));
        }
      }
    }
    await onReload();
    setSaving(false);
  };

  if (dayGroups.length === 0) {
    return <div style={{ fontSize: 13, color: S.muted }}>No workouts assigned yet — nothing to lock to a weekday until at least one exists.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14, lineHeight: 1.6 }}>
        Click a day to assign or swap which workout falls there — a fixed, repeating Monday-Sunday pattern.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(88px,1fr))", gap: 10 }}>
        {WEEKDAY_ORDER.map((weekday) => {
          const occupant = dayGroups.find((g) => g.day === weekday);
          const color = colorForWeekday(weekday);
          const isOpen = openWeekday === weekday;
          return (
            <div key={weekday} style={{ position: "relative" }}>
              <button onClick={() => setOpenWeekday(isOpen ? null : weekday)} disabled={saving}
                style={{
                  width: "100%", padding: "16px 6px", borderRadius: 12, cursor: saving ? "default" : "pointer", textAlign: "center",
                  border: "2px solid " + (color || S.border),
                  background: color ? color + "1F" : "transparent",
                }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, letterSpacing: 1.5, color: color || S.muted }}>{WEEKDAY_SHORT[weekday]}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: occupant ? S.text : S.muted, marginTop: 5, whiteSpace: "nowrap" }}>{occupant ? occupant.label : "Rest"}</div>
              </button>
              {isOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20, background: S.surface, border: "1px solid " + S.border, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 20px rgba(0,0,0,.45)" }}>
                  <button onClick={() => assign(weekday, "__rest__")}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 12, fontWeight: 600, background: "transparent", border: "none", color: S.muted, cursor: "pointer" }}>
                    Rest Day
                  </button>
                  {dayGroups.map((g, i) => (
                    <button key={g.day} onClick={() => assign(weekday, g.day)}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 12, fontWeight: 600, background: "transparent", border: "none", color: S.text, cursor: "pointer" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: DAY_GROUP_COLORS[i % DAY_GROUP_COLORS.length], flexShrink: 0 }} />
                      {g.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Reusable scheduler -- the same component for a coach editing a coaching
// client's schedule (Section 11: "coach can control the client's schedule
// directly") and a client editing their own. `trainOwnerId` is whose
// exercises define the available workout options (a linked training
// partner's, if shared training is set up); `clientId` is whose schedule
// these overrides belong to -- always the client's own id, never the
// partner's.
//
// Two modes, per spec: Fixed Weekly (a traditional locked Monday-Sunday
// pattern, above) and Free Schedule (arbitrary date-specific overrides,
// below) — a client/coach can use either, and Free Schedule's "Auto"
// option falls back to whatever Fixed Weekly currently has set.
export function WorkoutScheduler({ clientId, trainOwnerId }) {
  const [mode, setMode] = useState("fixed"); // "fixed" | "free"
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
      <div style={{ display: "inline-flex", gap: 4, marginBottom: 18, border: "1px solid " + S.border, borderRadius: 10, padding: 4 }}>
        {[["fixed", "Fixed Weekly"], ["free", "Free Schedule"]].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            style={{ padding: "9px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, letterSpacing: 0.5, background: mode === m ? S.accent : "transparent", color: mode === m ? "white" : S.muted }}>
            {label}
          </button>
        ))}
      </div>

      {mode === "fixed" ? (
        <FixedWeeklySchedule trainOwnerId={trainOwnerId} exercises={exercises} onReload={load} />
      ) : dayGroups.length === 0 ? (
        <div style={{ fontSize: 13, color: S.muted }}>No workouts assigned yet — nothing to schedule until at least one exists.</div>
      ) : (
        <div>
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 14, lineHeight: 1.6 }}>
            Assign a workout to specific days, or leave a day on Auto to follow the Fixed Weekly pattern. Not locked to a Monday-Sunday structure.
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {dates.map((date, i) => {
              const row = schedule[date];
              const autoWeekday = weekdayOf(date);
              const autoGroup = dayGroups.find((g) => g.day === autoWeekday);
              const value = !row ? "__auto__" : (row.day_of_week == null ? "__rest__" : row.day_of_week);
              return (
                <div key={date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 2px", borderBottom: i < dates.length - 1 ? "1px solid " + S.border : "none" }}>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: S.text }}>
                      {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                    {value === "__auto__" && <div style={{ fontSize: 11, color: S.muted }}>Auto: {autoGroup ? autoGroup.label : "rest"}</div>}
                  </div>
                  <select value={value} onChange={(e) => setDay(date, e.target.value)} disabled={saving === date}
                    style={{ background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "7px 10px", fontSize: 12, outline: "none", borderRadius: 6 }}>
                    <option value="__auto__">Auto (Fixed Weekly)</option>
                    <option value="__rest__">Rest Day</option>
                    {dayGroups.map((g) => <option key={g.day} value={g.day}>{g.label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
