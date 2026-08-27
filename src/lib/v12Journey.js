// The generic 30-day onboarding journey every client walks through on
// joining V12, independent of their long-term coach-defined training phases
// (program_phases / ProgramRoadmap.jsx). This is the universal Day 0 -> Day
// 30 orientation arc (client onboarding + 30-day roadmap), not a per-client
// editable plan -- it's the same five steps for every client, and it simply
// stops being shown once the client's program has run past day 30 (their
// long-term phase roadmap takes over from there).
export const JOURNEY_STEPS = [
  {
    key: "day0", label: "Day 0", title: "Setup", dayStart: 0, dayEnd: 0,
    why: "Prepare your account, assessment, and training environment.",
    focus: ["Profile & goal confirmed", "Assessment reviewed", "Program built"],
  },
  {
    key: "week1", label: "Week 1", title: "Learn", dayStart: 1, dayEnd: 7,
    why: "Build the foundation. Learn the system. Create early momentum.",
    focus: ["Training consistency", "Workout execution", "Daily tracking"],
  },
  {
    key: "week2", label: "Week 2", title: "Consistency", dayStart: 8, dayEnd: 14,
    why: "Lock in the habits. Repeat. Execute.",
    focus: ["Training adherence", "Recovery", "Coach feedback"],
  },
  {
    key: "week3", label: "Week 3", title: "Progression", dayStart: 15, dayEnd: 21,
    why: "Dial in consistency, then start adding progressive overload.",
    focus: ["Progressive overload", "Performance trends", "Conditioning"],
  },
  {
    key: "week4", label: "Week 4", title: "Review", dayStart: 22, dayEnd: 30,
    why: "Assess results, evaluate adherence, and set your next milestone.",
    focus: ["Body stats review", "Adherence review", "Next-phase planning"],
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

export function journeyStepStatus(stepIndex, currentIndex) {
  return stepIndex < currentIndex ? "done" : stepIndex === currentIndex ? "current" : "upcoming";
}
