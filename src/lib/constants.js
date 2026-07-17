// Shared constants used by both program/exercise editing (coach) and progress
// grouping (client + coach) views. Centralized so they're defined once instead
// of redeclared at multiple points in the file they were extracted from.
export const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const EX_TYPES = ["Compound", "Accessory", "Circuit", "Warmup"];
export const PHASES = ["Onboarding", "Accumulation", "Intensification", "Peak", "Deload", "Maintenance"];

// Group exercises by training day, returned as {day, exercises, label} ordered
// Monday→Sunday with "Unscheduled" last. `label` is a schedule-agnostic sequential
// "Day 1..N" (positional, so a Mon/Wed/Fri plan reads Day 1/2/3, not 1/3/5); the
// underlying day_of_week is untouched. Shared by the client plan + coach editor.
// Program-only clients' self-tracked daily habit flags (no coach-defined
// habits table involved — these are fixed, app-wide). Shared by the
// self-guided Daily Habits page and the program-only Progress page.
export const PROGRAM_HABITS = [
  { key: "water",   label: "Water",   hint: "Hit your water goal" },
  { key: "protein", label: "Protein", hint: "Hit your protein target" },
  { key: "sleep",   label: "Sleep",   hint: "7+ hours" },
  { key: "workout", label: "Workout", hint: "Trained today" },
  { key: "steps",   label: "Steps",   hint: "Hit your step goal" },
];

// Consecutive days (back from today, or yesterday if today is blank) for which
// `ok(date)` holds. Shared by the workout and habit streaks.
export function streakBack(ok) {
  const d = new Date();
  if (!ok(d.toISOString().split("T")[0])) d.setDate(d.getDate() - 1);
  let s = 0;
  while (ok(d.toISOString().split("T")[0])) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

export function groupByDay(list) {
  const byDay = {};
  for (const ex of list) {
    const k = ex.day_of_week || "Unscheduled";
    (byDay[k] = byDay[k] || []).push(ex);
  }
  let n = 0;
  return Object.keys(byDay)
    .sort((a, b) => {
      const ia = DAY_ORDER.indexOf(a), ib = DAY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((day) => ({ day, exercises: byDay[day], label: day === "Unscheduled" ? "Unscheduled" : `Day ${++n}` }));
}
