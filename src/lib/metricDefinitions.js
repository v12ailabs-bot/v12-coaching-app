// The one written definition of every score V12 shows, kept next to the code and
// shown to coaches (Progression > Metrics). `source` names the real exported
// function(s) that calculate it — a test fails if a definition points at a
// function that no longer exists, so this can't silently rot.
//
// Rules that apply to every metric:
//  * "Not enough data" is never shown as 0 or as a failing grade: a metric with no
//    qualifying data is null/"—" or a labelled "needs X" state.
//  * A day with no entry is not a success. Silence lowers logging rate/adherence;
//    it is never counted as hitting a target.
//  * Rest days are neither a success nor a miss.
//  * Coach-facing screens read client check-ins as of YESTERDAY (clients log at the
//    end of the day); the client's own screens include today.
//  * Screens re-fetch when you open them (no shared cache), so a number reflects
//    what was saved the last time you navigated to that screen.
export const METRIC_DEFINITIONS = [
  {
    id: "checkin_adherence", name: "Check-in consistency", audience: "client + coach",
    definition: "How often the client logs a daily check-in.",
    formula: "days with a daily check-in ÷ days since their first check-in (capped at the window), × 100.",
    window: "Trailing 30 days.", needs: "At least one daily check-in.", missing: "No check-ins → 0% (and 'No activity' on the logging flags).",
    source: [{ file: "src/lib/scoring.js", fn: "adherenceFrom" }],
  },
  {
    id: "training_adherence", name: "Training adherence", audience: "client + coach",
    definition: "Scheduled sessions the client completed.",
    formula: "completed ÷ (completed + missed), × 100, from the daily check-in 'workout' field. Rest days are excluded.",
    window: "Trailing 30 days (or the phase window on the roadmap / plan-vs-actual).", needs: "At least one completed or missed session.", missing: "No scheduled session → blank (—), never 0%.",
    source: [{ file: "src/lib/scoring.js", fn: "adherenceFrom" }, { file: "src/lib/scoring.js", fn: "workoutAdherenceFrom" }],
  },
  {
    id: "nutrition_score", name: "Nutrition score", audience: "client + coach",
    definition: "How closely logged intake matches the client's nutrition targets; falls back to the self-rated diet answer only when there is no plan or no logged macros (and says which it used).",
    formula: "Macro adherence: each macro's daily accuracy = 100 − |actual − target| ÷ target × 100 (floored at 0), averaged over LOGGED days, weighted protein 40 / calories 30 / carbs 15 / fats 15 (macros without a target are dropped and weights renormalised); × logging rate. Daily intake = check-in macros + meal/food logs for that date. Self-rated: On track 100, Mostly clean 75, Struggled 40, Off plan 10, averaged.",
    window: "Trailing 30 days.", needs: "An active nutrition plan and at least one day with logged macros (macro mode), or a self-rated diet answer (fallback).", missing: "Unreported macros are left out, never counted as 0. Nothing logged → blank.",
    source: [{ file: "src/lib/scoring.js", fn: "nutritionStatusFrom" }, { file: "src/lib/scoring/nutritionAdherence.js", fn: "nutritionAdherenceFrom" }, { file: "src/lib/scoring/nutritionAdherence.js", fn: "mergeDailyNutrition" }],
  },
  {
    id: "nutrition_logging_rate", name: "Nutrition logging rate", audience: "coach",
    definition: "How many days in the window have any logged intake — separate from whether targets were hit.",
    formula: "days with any logged calories/protein/carbs/fats ÷ days in the window.", window: "Trailing 30 days.", needs: "Any logged intake in the window.", missing: "Unlogged days lower the rate and drag the nutrition score down; they are never treated as on-target.",
    source: [{ file: "src/lib/scoring/nutritionAdherence.js", fn: "nutritionAdherenceFrom" }],
  },
  {
    id: "habit_adherence", name: "Habit adherence", audience: "client + coach",
    definition: "Habit-days the client satisfied.",
    formula: "satisfied habit-days ÷ (active habits × days in the window), × 100. A habit is satisfied by its own rule (button done, or a value at/over/under its target).",
    window: "Trailing 30 days.", needs: "At least one active habit.", missing: "No habits → blank.",
    note: "Known limitation: days before a habit was created count as missed (habits have no start date).",
    source: [{ file: "src/lib/scoring.js", fn: "habitAdherenceFrom" }, { file: "src/lib/scoring.js", fn: "isHabitSatisfied" }],
  },
  {
    id: "goal_score", name: "Goal score", audience: "client + coach",
    definition: "Progress toward the weight goal, blended with how the client is behaving.",
    formula: "Primary progress (actual change vs the change expected by now on the baseline→target line) 40%, nutrition 20%, training 15%, recovery 10%, habits 15%. Any component with no data is dropped and the rest renormalised. Classification: ≥ 90 On Track, 60–89 Slightly Behind, < 60 (or trending the wrong way) Off Track.",
    window: "Primary: 7-day trailing average weight vs baseline; trend over 30 days.", needs: "The goal is at least 7 days old AND there is a weigh-in in the last 7 days.", missing: "Otherwise 'Gathering Data' — the client sees 'Weigh-In Needed' if they are checking in, 'Not Enough Data' if they have no check-ins.",
    source: [{ file: "src/lib/scoring/goalScoring.js", fn: "computeGoalScore" }],
  },
  {
    id: "risk_level", name: "Risk level / Needs Attention", audience: "coach (client sees the friendly version)",
    definition: "How many progress-related warning flags a client has.",
    formula: "Each flag scores 2 (red) or 1 (amber): total ≥ 4 High, ≥ 2 Medium, ≥ 1 Low, 0 On Track. Flags come from nutrition (< 50% with ≥ 3 logged days), goal off track / slightly behind, plateau, weight moving against the goal, falling recovery, low sleep. Logging gaps are a separate 'logging status', not part of risk.",
    window: "30 days (recovery compares 2-week blocks).", needs: "Check-ins and weekly check-ins in the window.", missing: "A missing signal raises no flag.",
    source: [{ file: "src/lib/scoring.js", fn: "assessClientRisk" }, { file: "src/lib/scoring.js", fn: "loggingAssessment" }],
  },
  {
    id: "milestone_progress", name: "Milestone progress", audience: "client + coach",
    definition: "How far a milestone has come from where it started to its target.",
    formula: "(current − baseline) ÷ (target − baseline), clamped 0–100%. Achieved when current ≥ target (≤ target for decrease goals). Current = the heaviest top set (or best reps for bodyweight moves) on the most recent logged day.",
    window: "Latest logged session.", needs: "A logged value for the exercise.", missing: "No logged value → 'No data yet' (empty bar), never 0%.",
    source: [{ file: "src/lib/milestoneProgress.js", fn: "milestoneProgress" }],
  },
  {
    id: "program_progress", name: "Program / phase progress", audience: "client + coach",
    definition: "How far through the program (or the current phase) the calendar is.",
    formula: "elapsed days ÷ total days from the program start date and its duration in weeks (phase: from its start/end week).",
    window: "Program start date to now.", needs: "A program start date and duration.", missing: "Missing date/duration → no percentage is shown (never invented).",
    source: [{ file: "src/lib/scoring.js", fn: "programCalendarProgressFrom" }, { file: "src/lib/roadmapStats.js", fn: "roadmapStats" }],
  },
  {
    id: "phase_assessment", name: "Plan vs actual (phase)", audience: "coach",
    definition: "Advisory read on whether the current phase is on track, ready to advance, or needs review.",
    formula: "Uses the phase's own dates: exit criteria done (N/A excluded), training adherence, nutrition. Ready to advance only when every non-N/A criterion is complete. Defaults (editable constants): 80% good, 70% weak, minimum 4 scheduled sessions.",
    window: "The phase window, read as of yesterday.", needs: "Phase weeks + program start date; ≥ 4 scheduled sessions for an adherence verdict.", missing: "Too little training data → 'Not enough data', never a verdict. A criterion is only complete when the coach marks it.",
    source: [{ file: "src/lib/phaseAssessment.js", fn: "assessPhase" }],
  },
  {
    id: "weight_change", name: "Weight change", audience: "coach",
    definition: "Net weight movement in the window.", formula: "last weigh-in − first weigh-in inside the window.", window: "30 days.", needs: "At least 2 weigh-ins.", missing: "Fewer than 2 → blank.",
    source: [{ file: "src/lib/scoring.js", fn: "weightChangeFrom" }],
  },
  {
    id: "sleep_average", name: "Average sleep", audience: "coach",
    definition: "Mean logged sleep hours.", formula: "average of daily sleep_hours with a value.", window: "14–30 days.", needs: "At least one sleep entry.", missing: "None → blank.",
    source: [{ file: "src/lib/scoring.js", fn: "avgSleepHoursFrom" }],
  },
];
