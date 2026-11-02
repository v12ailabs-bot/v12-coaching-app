// Explicit workout completion. A logged set never proves a workout was finished,
// and the absence of any report is "unreported" — never "missed".
//
// Per-day execution status, combining the two explicit sources the client has:
//   • workout_completions row  — "Mark workout complete" on the Workouts screen
//   • daily_checkins.workout   — "completed" | "rest" | "missed" chosen on Today
// Precedence: a completion row (or a "completed" check-in) = completed; otherwise
// the check-in's own explicit answer; otherwise "unreported" (a workout was
// scheduled but nothing was confirmed) or "rest" (nothing scheduled).
export function dayExecutionStatus({ scheduled, completion, checkinWorkout }) {
  if (completion || checkinWorkout === "completed") return completion?.status === "partial" && checkinWorkout !== "completed" ? "partial" : "completed";
  if (checkinWorkout === "missed") return "missed";           // the client said so themselves
  if (checkinWorkout === "rest") return "rest";
  return scheduled ? "unreported" : "rest";
}

export function buildCompletionRow({ clientId, date, dayOfWeek, status = "completed", note, setsLogged }) {
  return {
    client_id: clientId, date, day_of_week: dayOfWeek || null,
    status: status === "partial" ? "partial" : "completed",
    note: note && String(note).trim() ? String(note).trim().slice(0, 500) : null,
    sets_logged: Number.isInteger(setsLogged) ? setsLogged : null,
  };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (dateStr) => WEEKDAYS[new Date(dateStr + "T12:00:00").getDay()];
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// What actually happened with the workouts a client was ASSIGNED, kept strictly
// separate from reporting activity. There is deliberately no single "adherence
// %": unreported days are shown as unreported, not folded into success or failure.
//
//   assignedWeekdays  Set of weekday names that have exercises ("Monday", …)
//   scheduledRows     scheduled_workouts rows [{ date, day_of_week|null }] — a row
//                     overrides the weekday rule (null day = explicit rest day)
//   checkins          daily_checkins rows ({ date, workout })
//   completions       workout_completions rows ({ date, status })
//   trackingStart     don't count days before the program existed for this client
//   today             today is "pending" until it ends — never "unreported"
export function workoutExecutionFrom({ assignedWeekdays, scheduledRows = [], checkins = [], completions = [], days = 30, today, trackingStart = null }) {
  const sched = new Map(scheduledRows.map((r) => [r.date, r.day_of_week]));
  const checkinBy = new Map(checkins.map((c) => [c.date, c.workout]));
  const compBy = new Map(completions.map((c) => [c.date, c]));
  const out = { window: days, assigned: 0, completed: 0, partial: 0, unreported: 0, selfReportedMissed: 0, selfReportedRest: 0, pendingToday: false, restDays: 0, byDate: {} };
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (trackingStart && date < trackingStart) continue;
    const assigned = sched.has(date) ? sched.get(date) != null : assignedWeekdays.has(weekdayOf(date));
    const completion = compBy.get(date) || null;
    const checkinWorkout = checkinBy.get(date) ?? null;
    // Something was done/confirmed on a day with no assignment — still a completed workout, not a rest day.
    if (!assigned && !completion && checkinWorkout !== "completed") { out.restDays++; continue; }
    let status = dayExecutionStatus({ scheduled: assigned, completion, checkinWorkout });
    if (status === "unreported" && date === today) { out.pendingToday = true; out.byDate[date] = "pending"; continue; }
    if (status === "rest") { if (assigned) out.selfReportedRest++; else out.restDays++; out.byDate[date] = "rest"; continue; }
    out.byDate[date] = status;
    if (assigned) out.assigned++;
    if (status === "completed") out.completed++;
    else if (status === "partial") out.partial++;
    else if (status === "missed") out.selfReportedMissed++;
    else if (status === "unreported") out.unreported++;
  }
  return out;
}

// Reporting activity — how much the client has told us — independent of execution.
export function reportingActivityFrom({ dailyCheckins = [], weeklyCheckins = [], mealLogs = [], habitLogs = [], days = 30, today }) {
  const from = addDays(today, -(days - 1));
  const inWin = (d) => d.date >= from && d.date <= today;
  const daily = dailyCheckins.filter(inWin);
  const nutritionDates = new Set([
    ...daily.filter((c) => c.calories != null || c.protein_g != null || c.diet != null).map((c) => c.date),
    ...mealLogs.filter(inWin).map((m) => m.date),
  ]);
  const habitDates = new Set(habitLogs.filter(inWin).filter((l) => l.done || l.value != null).map((l) => l.date));
  return {
    window: days,
    dailyCheckinDays: new Set(daily.map((c) => c.date)).size,
    weeklyCheckins: weeklyCheckins.filter(inWin).length,
    nutritionLoggedDays: nutritionDates.size,
    habitDays: habitDates.size,
    weightUpdates: daily.filter((c) => c.weight != null).length + weeklyCheckins.filter(inWin).filter((w) => w.bodyweight != null).length,
  };
}
