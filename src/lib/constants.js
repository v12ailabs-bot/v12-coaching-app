// Shared constants used by both program/exercise editing (coach) and progress
// grouping (client + coach) views. Centralized so they're defined once instead
// of redeclared at multiple points in the file they were extracted from.

// The one hardcoded account that gets the coach role on signup (see
// features/auth/LoginScreen.jsx) and coach-only UI checks throughout the app.
export const COACH_EMAIL = "coach@v12system.com";
// Lightweight "Weekly Review" scheduling — no in-app booking system exists,
// so this links straight to Calendly instead. Two different URLs for two
// different audiences: clients get the public booking page (pick a slot);
// the coach gets their own logged-in scheduled-events dashboard (see who
// booked, and for when) — sending the coach to the public booking page
// too would just let them book a slot with themselves.
export const V12_CALENDLY_URL = "https://calendly.com/v12fitness1";
export const V12_CALENDLY_DASHBOARD_URL = "https://calendly.com/app/scheduled_events";

// Field list mirrors the Notion Applications Database (api/_lib/notion.js PROP
// map) plus the new required height field. Config-driven so adding/removing a
// field doesn't require new JSX per field. Also used by the coach CRM view to
// look up a field's label when displaying a lead's raw intake_data.
export const INTAKE_FIELDS = [
  { key: "name", label: "Full Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "height", label: "Height", type: "text", ph: "e.g. 5'10\"", required: true },
  { key: "packageInterest", label: "Which package are you interested in?", type: "select", options: [
    "V12 Program — $47/month, includes app access",
    "Standard Coaching — 12 Weeks: $750 in full or $250/month x3 ($750 total)",
    "1:1 Elite Performance — 12 Weeks: $1500 in full or $600/month x3 ($1800 total)",
    "Local — Group PT Training (max 3 people): $300/month each",
    "Local — 1-on-1 Premium: $400/month, 12 Weeks",
  ] },
  { key: "goal", label: "Primary Goal", type: "text" },
  { key: "daysAvailable", label: "Days Available / Week", type: "text" },
  { key: "experienceLevel", label: "Training Experience", type: "text" },
  { key: "equipment", label: "Where will you primarily train?", type: "text" },
  { key: "homeEquipment", label: "If you train at home, what equipment do you have?", type: "text" },
  { key: "sessionLength", label: "Time available per session", type: "text" },
  { key: "age", label: "Age", type: "number" },
  { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Prefer not to say"] },
  { key: "currentWeight", label: "Current Weight (lb)", type: "number" },
  { key: "targetChange", label: "Target Change (lb)", type: "number" },
  { key: "activityLevel", label: "Daily Activity Level", type: "text" },
  { key: "sleepHours", label: "Average Sleep (hrs/night)", type: "number" },
  { key: "trainingTenure", label: "How long have you trained consistently?", type: "text" },
  { key: "nutritionConsistency", label: "Nutrition Consistency", type: "text" },
  { key: "coachingStyle", label: "Coaching Style Preference", type: "text" },
  { key: "commitmentLevel", label: "Commitment Level (1-10)", type: "number" },
  { key: "confidence", label: "Confidence in following a 12-week program (1-10)", type: "number" },
  { key: "pastBarriers", label: "What has prevented you from reaching your goal before?", type: "textarea" },
  { key: "pastStruggles", label: "Past Struggles", type: "textarea" },
  { key: "whyNow", label: "Why Now?", type: "textarea" },
  { key: "dietaryPreference", label: "Dietary Preference", type: "text" },
  { key: "allergies", label: "Allergies", type: "text" },
  { key: "calorieTarget", label: "Calorie Target (optional)", type: "number" },
  { key: "injuryFlags", label: "Injuries / Limitations (comma-separated)", type: "text" },
  { key: "healthFlags", label: "Health Conditions (comma-separated)", type: "text" },
];

// Seeded from the Task-1 audit of the Assessment Form Database (sparse: None /
// Knee / Deep squats) plus common categories — adjustable later, low-risk.
export const INJURY_MULTISELECT_OPTIONS = {
  currentInjuries: ["None", "Knee", "Shoulder", "Back/Spine", "Hip", "Ankle", "Wrist/Elbow", "Other"],
  previousInjuries: ["None", "Knee", "Shoulder", "Back/Spine", "Hip", "Ankle", "Wrist/Elbow", "Other"],
  painTriggers: ["None", "Deep squats", "Overhead movements", "Running/Impact", "Prolonged sitting", "Heavy loading", "Other"],
};

export const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const EX_TYPES = ["Compound", "Accessory", "Circuit", "Warmup"];
export const PHASES = ["Onboarding", "Accumulation", "Intensification", "Peak", "Deload", "Maintenance"];

// Session-time block grouping (exercises.block_type / group_id — see
// db/add_block_type.sql). Shared by the client workout log, the coach's
// manual exercise builder, and program version snapshots, so a superset
// created anywhere is labeled the same way everywhere.
export const BLOCK_TYPES = ["straight_set", "superset", "circuit_for_time", "timed_circuit", "weighted_circuit"];
export const BLOCK_TYPE_LABEL = { straight_set: "Straight Set", superset: "Superset / Giant Set", circuit_for_time: "Circuit — For Time", timed_circuit: "Timed Circuit", weighted_circuit: "Weighted Circuit" };
export const BLOCK_TYPE_SHORT = { superset: "SS", circuit_for_time: "CFT", timed_circuit: "TC", weighted_circuit: "WC" };

// Collapses a day's exercises into "blocks" — a superset/circuit's members
// become one item (they render and log as one combined card), a straight-set
// exercise stays its own item. Shared by the client's swipeable Workouts
// pills and the coach's Workout Review list, so a grouped block reads as one
// entry in both instead of one per exercise that happen to be linked.
export function groupIntoBlocks(dayExercises) {
  const items = [];
  const seen = new Set();
  dayExercises.forEach((ex) => {
    if (ex.block_type && ex.block_type !== "straight_set" && ex.group_id) {
      const key = ex.day_of_week + "::" + ex.group_id;
      if (seen.has(key)) return;
      seen.add(key);
      const members = dayExercises.filter((e) => e.day_of_week === ex.day_of_week && e.group_id === ex.group_id);
      items.push({ id: ex.id, members, blockType: ex.block_type });
    } else {
      items.push({ id: ex.id, members: [ex], blockType: "straight_set" });
    }
  });
  return items;
}

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
