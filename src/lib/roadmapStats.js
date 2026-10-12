import { workoutAdherenceFrom } from "./scoring.js";
import { mergeDailyNutrition } from "./scoring/nutritionAdherence.js";
import { localDateStr } from "./dates.js";

// Real numbers for the client-facing roadmap's "current phase" cards, from the
// phase's own date window. Anything without data is null (the UI hides it) —
// nothing is estimated or defaulted.
const DAY = 86400000;
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

export function roadmapStats({ phase, programStart, daily = [], mealLogs = [], today = new Date() }) {
  const ws = Number(phase?.week_start), we = Number(phase?.week_end);
  if (!programStart || !Number.isInteger(ws) || !Number.isInteger(we) || ws < 1 || we < ws) return null;
  const start = parseDay(programStart);
  const winStart = new Date(start.getTime() + (ws - 1) * 7 * DAY);
  const winEnd = new Date(start.getTime() + (we * 7 - 1) * DAY);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (now < winStart) return null;
  const asOf = now > winEnd ? winEnd : now;
  const elapsedDays = Math.round((asOf - winStart) / DAY) + 1;
  const from = localDateStr(winStart), to = localDateStr(asOf);
  const inWin = daily.filter((c) => c.date >= from && c.date <= to);
  const training = workoutAdherenceFrom(inWin, elapsedDays, asOf);
  const prot = mergeDailyNutrition(inWin, mealLogs.filter((m) => m.date >= from && m.date <= to)).filter((r) => r.protein_g != null);
  const phaseWeeks = we - ws + 1;
  return {
    phaseWeek: Math.min(phaseWeeks, Math.floor(elapsedDays / 7) + 1),
    phaseWeeks,
    pct: Math.min(100, Math.round((elapsedDays / (phaseWeeks * 7)) * 100)),
    completed: training.scheduled ? training.completed : null,
    scheduled: training.scheduled || null,
    attendancePct: training.score,
    proteinAvg: prot.length ? Math.round(prot.reduce((s, r) => s + r.protein_g, 0) / prot.length) : null,
  };
}
