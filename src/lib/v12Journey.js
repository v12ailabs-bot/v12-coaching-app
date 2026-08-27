import { supabase } from "../supabaseClient.js";
import { fetchOnboardingTasks, onboardingComplete } from "./onboardingTasks.js";

// The generic 30-day onboarding journey every client walks through on
// joining V12, independent of their long-term coach-defined training phases
// (program_phases / ProgramRoadmap.jsx). This is the universal Day 0 -> Day
// 30 orientation arc (client onboarding + 30-day roadmap), not a per-client
// editable plan -- it's the same five steps for every client, and it simply
// stops being shown once the client's program has run past day 30 (their
// long-term phase roadmap takes over from there).
// `completion` describes the real signal that marks a step actually done,
// separate from the calendar window it lives in -- 'onboarding' checks the
// Day-0 task gate (onboardingTasks.js), 'weekly_checkin' checks for a
// weekly_checkins row with that week_number. Time still drives which step
// is "current" (a client doesn't get stuck on Week 1 forever); this only
// changes whether a *past* step reads as done or behind.
export const JOURNEY_STEPS = [
  {
    key: "day0", label: "Day 0", title: "Setup", dayStart: 0, dayEnd: 0,
    why: "Prepare your account, assessment, and training environment.",
    focus: ["Profile & goal confirmed", "Assessment reviewed", "Program built"],
    completion: { type: "onboarding" },
  },
  {
    key: "week1", label: "Week 1", title: "Learn", dayStart: 1, dayEnd: 7,
    why: "Build the foundation. Learn the system. Create early momentum.",
    focus: ["Training consistency", "Workout execution", "Daily tracking"],
    completion: { type: "weekly_checkin", weekNumber: 1 },
  },
  {
    key: "week2", label: "Week 2", title: "Consistency", dayStart: 8, dayEnd: 14,
    why: "Lock in the habits. Repeat. Execute.",
    focus: ["Training adherence", "Recovery", "Coach feedback"],
    completion: { type: "weekly_checkin", weekNumber: 2 },
  },
  {
    key: "week3", label: "Week 3", title: "Progression", dayStart: 15, dayEnd: 21,
    why: "Dial in consistency, then start adding progressive overload.",
    focus: ["Progressive overload", "Performance trends", "Conditioning"],
    completion: { type: "weekly_checkin", weekNumber: 3 },
  },
  {
    key: "week4", label: "Week 4", title: "Review", dayStart: 22, dayEnd: 30,
    why: "Assess results, evaluate adherence, and set your next milestone.",
    focus: ["Body stats review", "Adherence review", "Next-phase planning"],
    completion: { type: "weekly_checkin", weekNumber: 4 },
  },
];

export const JOURNEY_LENGTH_DAYS = 30;

// Days elapsed since the client's program actually started -- same
// start_date (falling back to account creation) that ProgramRoadmapCard /
// ClientProgram already use for "Week X of Y" -- compared in local calendar
// days, not raw ms, so it doesn't shift with time-of-day.
export function daysSinceStart(startDateStr) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr + "T00:00:00");
  const now = new Date();
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((nowLocal - startLocal) / 86400000);
}

export function currentJourneyStepIndex(day) {
  if (day == null || day < 0) return 0;
  const idx = JOURNEY_STEPS.findIndex((s) => day >= s.dayStart && day <= s.dayEnd);
  return idx === -1 ? JOURNEY_STEPS.length - 1 : idx;
}

// `dataComplete` is whatever the caller determined via the step's
// `completion` descriptor (see isStepDataComplete below) -- only consulted
// for steps whose calendar window has already passed, so a step can never
// jump to "current"/"upcoming" early just because the client did the work
// ahead of schedule.
export function journeyStepStatus(stepIndex, currentIndex, dataComplete) {
  if (stepIndex === currentIndex) return "current";
  if (stepIndex > currentIndex) return "upcoming";
  return dataComplete ? "done" : "behind";
}

// Real signal behind a step's `completion` descriptor. `ctx.onboardingDone`
// is onboardingComplete(tasks) from onboardingTasks.js; `ctx.checkinWeeks`
// is the Set of week_numbers present in the client's weekly_checkins.
export function isStepDataComplete(step, ctx) {
  const c = step.completion;
  if (!c) return true;
  if (c.type === "onboarding") return !!ctx.onboardingDone;
  if (c.type === "weekly_checkin") return ctx.checkinWeeks?.has(c.weekNumber) || false;
  return true;
}

// Shared fetch for both the home preview card and the full roadmap page --
// same two real signals (Day-0 gate + which weeks have a logged check-in)
// back both views.
export async function fetchJourneyContext(clientId) {
  const [tasks, { data: weeklies }] = await Promise.all([
    fetchOnboardingTasks(clientId),
    supabase.from("weekly_checkins").select("week_number").eq("client_id", clientId).not("week_number", "is", null),
  ]);
  return {
    onboardingDone: onboardingComplete(tasks),
    checkinWeeks: new Set((weeklies || []).map((w) => w.week_number).filter((n) => n != null)),
  };
}
