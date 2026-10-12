import { workoutAdherenceFrom, nutritionStatusFrom } from "./scoring.js";
import { localDateStr } from "./dates.js";

// Plan-vs-actual assessment of one roadmap phase. ADVISORY ONLY: it returns a
// recommendation with the evidence behind it; it never changes a phase,
// workout or criterion. A criterion is complete only because the coach marked
// it so — time passing or good adherence never completes one.
//
// Thresholds are named constants so they're visible and tunable. 80% mirrors
// the "Attendance >= 80%" criterion used on the roadmap boards; below 70% is
// treated as a consistency problem. They are defaults, not V12 doctrine.
export const ADHERENCE_GOOD = 80;
export const ADHERENCE_WEAK = 70;
export const MIN_SCHEDULED_SESSIONS = 4; // below this, adherence isn't a reliable signal

const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

// phase: { phase, week_start, week_end, exit_criteria }
// daily: daily_checkins rows; nutCtx: { plan, mealLogs } (optional)
export function assessPhase({ phase, programStart, today = new Date(), daily = [], nutCtx = null }) {
  const base = { advisory: true, evidence: {}, reasons: [] };
  const ws = Number(phase?.week_start), we = Number(phase?.week_end);
  if (!programStart || !Number.isInteger(ws) || !Number.isInteger(we) || ws < 1 || we < ws) {
    return { ...base, status: "not_assessable", headline: "This phase has no dates, so it can't be assessed.", reasons: ["Set the phase's start and end weeks and the program start date."] };
  }
  const start = parseDay(programStart);
  const winStart = new Date(start.getTime() + (ws - 1) * 7 * DAY);
  const winEnd = new Date(start.getTime() + (we * 7 - 1) * DAY);
  const now = startOfDay(today);
  const evidence = { windowStart: localDateStr(winStart), windowEnd: localDateStr(winEnd) };
  if (now < winStart) return { ...base, evidence, status: "not_started", headline: "This phase hasn't started yet.", reasons: [`It starts ${evidence.windowStart}.`] };

  const ended = now > winEnd;
  const asOf = ended ? winEnd : now;
  const elapsedDays = Math.round((asOf - winStart) / DAY) + 1;
  const inWindow = daily.filter((c) => c.date >= evidence.windowStart && c.date <= localDateStr(asOf));
  const training = workoutAdherenceFrom(inWindow, elapsedDays, asOf);
  const nutrition = nutritionStatusFrom(inWindow, nutCtx, elapsedDays, asOf);
  const counted = (phase.exit_criteria || []).filter((c) => c.status !== "na");
  const done = counted.filter((c) => c.status === "complete").length;

  Object.assign(evidence, {
    ended, elapsedDays, trainingPct: training.score, scheduledSessions: training.scheduled, completedSessions: training.completed,
    checkinDays: new Set(inWindow.map((c) => c.date)).size, nutritionPct: nutrition.score, nutritionSource: nutrition.source,
    criteriaDone: done, criteriaTotal: counted.length,
  });
  const reasons = [];
  const trainingLine = training.score != null ? `Training: ${training.completed} of ${training.scheduled} scheduled sessions completed (${training.score}%).` : "Training: no scheduled sessions recorded in this phase yet.";
  const criteriaLine = counted.length ? `Exit criteria: ${done} of ${counted.length} complete.` : "Exit criteria: none set for this phase.";
  const nutLine = nutrition.score != null ? `Nutrition: ${nutrition.score}% (${nutrition.source === "macros" ? "logged intake vs targets" : "self-rated"}).` : null;
  const lines = [trainingLine, criteriaLine, nutLine].filter(Boolean);
  const out = (status, headline, extra = []) => ({ ...base, evidence, status, headline, reasons: [...extra, ...lines] });

  if (counted.length > 0 && done === counted.length) {
    return out("ready_to_advance", "All exit criteria are complete — ready to move on.", ended ? [] : ["The phase hasn't reached its end date, so advancing now would be early."]);
  }
  if (training.scheduled < MIN_SCHEDULED_SESSIONS) {
    return out("insufficient_data", "Not enough logged training yet to judge this phase.", [`Only ${training.scheduled} scheduled session${training.scheduled === 1 ? "" : "s"} recorded; at least ${MIN_SCHEDULED_SESSIONS} are needed.`]);
  }
  const pct = training.score;
  if (ended) {
    if (pct >= ADHERENCE_GOOD) return out("review", "The client trained consistently but the exit criteria aren't met — review the programming or the criteria.", ["Consistency isn't the limiter; look at load, technique or whether a criterion is realistic."]);
    return out("hold", "The phase has ended with exit criteria incomplete and training adherence below target — consider holding or extending it.", [`Training adherence was ${pct}%, under ${ADHERENCE_GOOD}%.`]);
  }
  if (pct >= ADHERENCE_GOOD) return out("on_track", "On track: training adherence is strong and the phase is still running.");
  if (pct < ADHERENCE_WEAK) return out("behind", "Behind: training adherence is low for this point in the phase.", [`${pct}% is under ${ADHERENCE_WEAK}%; a check-in with the client may help before it affects the exit criteria.`]);
  return out("watch", "Watch: training adherence is slightly under target.", [`${pct}% vs a ${ADHERENCE_GOOD}% target.`]);
}
