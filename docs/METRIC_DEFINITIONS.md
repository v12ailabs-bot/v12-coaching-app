# V12 metric definitions

_Generated from `src/lib/metricDefinitions.js` — edit that file, then run `node scripts/generate-metric-doc.mjs`. The same text is shown to coaches in Progression > Metric definitions._

**Rules for every metric:** missing data is never a zero or a success; a day with no entry is not a hit; rest days are neither a success nor a miss; coach screens read check-ins as of yesterday while client screens include today; screens re-fetch each time they are opened.

## Check-in consistency

*Audience: client + coach*

How often the client logs a daily check-in.

- **Formula:** days with a daily check-in ÷ days since their first check-in (capped at the window), × 100.
- **Window:** Trailing 30 days.
- **Needs:** At least one daily check-in.
- **If data is missing:** No check-ins → 0% (and 'No activity' on the logging flags).
- **Calculated by:** `adherenceFrom` (src/lib/scoring.js)

## Training adherence

*Audience: client + coach*

Scheduled sessions the client completed.

- **Formula:** completed ÷ (completed + missed), × 100, from the daily check-in 'workout' field. Rest days are excluded.
- **Window:** Trailing 30 days (or the phase window on the roadmap / plan-vs-actual).
- **Needs:** At least one completed or missed session.
- **If data is missing:** No scheduled session → blank (—), never 0%.
- **Calculated by:** `adherenceFrom` (src/lib/scoring.js), `workoutAdherenceFrom` (src/lib/scoring.js)

## Nutrition score

*Audience: client + coach*

How closely logged intake matches the client's nutrition targets; falls back to the self-rated diet answer only when there is no plan or no logged macros (and says which it used).

- **Formula:** Macro adherence: each macro's daily accuracy = 100 − |actual − target| ÷ target × 100 (floored at 0), averaged over LOGGED days, weighted protein 40 / calories 30 / carbs 15 / fats 15 (macros without a target are dropped and weights renormalised); × logging rate. Daily intake = check-in macros + meal/food logs for that date. Self-rated: On track 100, Mostly clean 75, Struggled 40, Off plan 10, averaged.
- **Window:** Trailing 30 days.
- **Needs:** An active nutrition plan and at least one day with logged macros (macro mode), or a self-rated diet answer (fallback).
- **If data is missing:** Unreported macros are left out, never counted as 0. Nothing logged → blank.
- **Calculated by:** `nutritionStatusFrom` (src/lib/scoring.js), `nutritionAdherenceFrom` (src/lib/scoring/nutritionAdherence.js), `mergeDailyNutrition` (src/lib/scoring/nutritionAdherence.js)

## Nutrition logging rate

*Audience: coach*

How many days in the window have any logged intake — separate from whether targets were hit.

- **Formula:** days with any logged calories/protein/carbs/fats ÷ days in the window.
- **Window:** Trailing 30 days.
- **Needs:** Any logged intake in the window.
- **If data is missing:** Unlogged days lower the rate and drag the nutrition score down; they are never treated as on-target.
- **Calculated by:** `nutritionAdherenceFrom` (src/lib/scoring/nutritionAdherence.js)

## Habit adherence

*Audience: client + coach*

Habit-days the client satisfied.

- **Formula:** satisfied habit-days ÷ (active habits × days in the window), × 100. A habit is satisfied by its own rule (button done, or a value at/over/under its target).
- **Window:** Trailing 30 days.
- **Needs:** At least one active habit.
- **If data is missing:** No habits → blank.
- **Known limitation:** Known limitation: days before a habit was created count as missed (habits have no start date).
- **Calculated by:** `habitAdherenceFrom` (src/lib/scoring.js), `isHabitSatisfied` (src/lib/scoring.js)

## Goal score

*Audience: client + coach*

Progress toward the weight goal, blended with how the client is behaving.

- **Formula:** Primary progress (actual change vs the change expected by now on the baseline→target line) 40%, nutrition 20%, training 15%, recovery 10%, habits 15%. Any component with no data is dropped and the rest renormalised. Classification: ≥ 90 On Track, 60–89 Slightly Behind, < 60 (or trending the wrong way) Off Track.
- **Window:** Primary: 7-day trailing average weight vs baseline; trend over 30 days.
- **Needs:** The goal is at least 7 days old AND there is a weigh-in in the last 7 days.
- **If data is missing:** Otherwise 'Gathering Data' — the client sees 'Weigh-In Needed' if they are checking in, 'Not Enough Data' if they have no check-ins.
- **Calculated by:** `computeGoalScore` (src/lib/scoring/goalScoring.js)

## Risk level / Needs Attention

*Audience: coach (client sees the friendly version)*

How many progress-related warning flags a client has.

- **Formula:** Each flag scores 2 (red) or 1 (amber): total ≥ 4 High, ≥ 2 Medium, ≥ 1 Low, 0 On Track. Flags come from nutrition (< 50% with ≥ 3 logged days), goal off track / slightly behind, plateau, weight moving against the goal, falling recovery, low sleep. Logging gaps are a separate 'logging status', not part of risk.
- **Window:** 30 days (recovery compares 2-week blocks).
- **Needs:** Check-ins and weekly check-ins in the window.
- **If data is missing:** A missing signal raises no flag.
- **Calculated by:** `assessClientRisk` (src/lib/scoring.js), `loggingAssessment` (src/lib/scoring.js)

## Milestone progress

*Audience: client + coach*

How far a milestone has come from where it started to its target.

- **Formula:** (current − baseline) ÷ (target − baseline), clamped 0–100%. Achieved when current ≥ target (≤ target for decrease goals). Current = the heaviest top set (or best reps for bodyweight moves) on the most recent logged day.
- **Window:** Latest logged session.
- **Needs:** A logged value for the exercise.
- **If data is missing:** No logged value → 'No data yet' (empty bar), never 0%.
- **Calculated by:** `milestoneProgress` (src/lib/milestoneProgress.js)

## Program / phase progress

*Audience: client + coach*

How far through the program (or the current phase) the calendar is.

- **Formula:** elapsed days ÷ total days from the program start date and its duration in weeks (phase: from its start/end week).
- **Window:** Program start date to now.
- **Needs:** A program start date and duration.
- **If data is missing:** Missing date/duration → no percentage is shown (never invented).
- **Calculated by:** `programCalendarProgressFrom` (src/lib/scoring.js), `roadmapStats` (src/lib/roadmapStats.js)

## Plan vs actual (phase)

*Audience: coach*

Advisory read on whether the current phase is on track, ready to advance, or needs review.

- **Formula:** Uses the phase's own dates: exit criteria done (N/A excluded), training adherence, nutrition. Ready to advance only when every non-N/A criterion is complete. Defaults (editable constants): 80% good, 70% weak, minimum 4 scheduled sessions.
- **Window:** The phase window, read as of yesterday.
- **Needs:** Phase weeks + program start date; ≥ 4 scheduled sessions for an adherence verdict.
- **If data is missing:** Too little training data → 'Not enough data', never a verdict. A criterion is only complete when the coach marks it.
- **Calculated by:** `assessPhase` (src/lib/phaseAssessment.js)

## Weight change

*Audience: coach*

Net weight movement in the window.

- **Formula:** last weigh-in − first weigh-in inside the window.
- **Window:** 30 days.
- **Needs:** At least 2 weigh-ins.
- **If data is missing:** Fewer than 2 → blank.
- **Calculated by:** `weightChangeFrom` (src/lib/scoring.js)

## Average sleep

*Audience: coach*

Mean logged sleep hours.

- **Formula:** average of daily sleep_hours with a value.
- **Window:** 14–30 days.
- **Needs:** At least one sleep entry.
- **If data is missing:** None → blank.
- **Calculated by:** `avgSleepHoursFrom` (src/lib/scoring.js)
