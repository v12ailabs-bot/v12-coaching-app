// Shared constants used by both program/exercise editing (coach) and progress
// grouping (client + coach) views. Centralized so they're defined once instead
// of redeclared at multiple points in the file they were extracted from.
export const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const EX_TYPES = ["Compound", "Accessory", "Circuit", "Warmup"];
export const PHASES = ["Onboarding", "Accumulation", "Intensification", "Peak", "Deload", "Maintenance"];

// Canonical within-day workout ordering. Stored in exercises.section (distinct
// from exercise_type, which drives strength-tracking grouping in StrengthTab —
// section is purely a slot label, never used for PR/strength charts).
export const PHASE_ORDER = [
  "Warm-Up", "Activation", "Power/Plyometrics", "Main Compound Lift",
  "Secondary Compound Lift", "Accessories", "Isolation", "Conditioning",
  "Finisher", "Cooldown",
];
// Legacy session-slot labels (pre-canonical-phase AI output) mapped onto the
// closest canonical phase, so old rows keep a sensible sort position.
const PHASE_ALIASES = { primary: "Main Compound Lift", secondary: "Secondary Compound Lift", accessory: "Accessories", core: "Isolation", conditioning: "Conditioning" };
const DEFAULT_PHASE_RANK = PHASE_ORDER.indexOf("Accessories");

// Rank of an exercise's phase for sorting, derived from its `section` (never a
// new column — reuses the existing free-text field). Unknown/blank sections
// fall to the Accessories rank so they never jump to the front or back.
export function phaseRankOf(ex) {
  const raw = String(ex?.section || "").trim();
  if (!raw) return DEFAULT_PHASE_RANK;
  const exact = PHASE_ORDER.findIndex((p) => p.toLowerCase() === raw.toLowerCase());
  if (exact !== -1) return exact;
  const alias = PHASE_ALIASES[raw.toLowerCase()];
  if (alias) return PHASE_ORDER.indexOf(alias);
  return DEFAULT_PHASE_RANK;
}

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

// "Day" here is always a virtual UI bucket keyed off exercises.day_of_week —
// there is no workout_days table, so editing/adding/deleting one exercise can
// never itself create or split a "day"; only day_of_week values change what
// bucket an exercise's row renders under.
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
    .map((day) => ({
      day,
      exercises: byDay[day].slice().sort((a, b) => phaseRankOf(a) - phaseRankOf(b) || (a.order_index ?? 0) - (b.order_index ?? 0)),
      label: day === "Unscheduled" ? "Unscheduled" : `Day ${++n}`,
    }));
}
