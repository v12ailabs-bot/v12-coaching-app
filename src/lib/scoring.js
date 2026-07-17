import { todayStr } from "../theme.jsx";

// Adherence over a trailing window: % of days with a daily check-in, plus the
// training-completion rate among those check-ins. Shared by client + coach views.
// The denominator scales to how long the client has actually been active (from
// their first check-in), capped at the window — so a client one day in who
// checked in reads 100%, not 1/30 (≈3%).
export function adherenceFrom(checkins, days = 30) {
  const all = checkins || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = cutoff.toISOString().split("T")[0];
  const recent = all.filter((c) => c.date >= cut);
  const checkinDays = new Set(recent.map((c) => c.date)).size;
  const completed = recent.filter((c) => c.workout === "completed").length;
  const today = todayStr();
  const firstEver = all.length ? all.reduce((m, c) => (c.date < m ? c.date : m), today) : today;
  const elapsed = Math.floor((new Date(today) - new Date(firstEver)) / 86400000) + 1;
  const denom = Math.max(1, Math.min(days, elapsed));
  return {
    score: Math.min(100, Math.round((checkinDays / denom) * 100)),
    checkinDays,
    days: denom,
    trainingRate: recent.length ? Math.round((completed / recent.length) * 100) : 0,
  };
}

// Nutrition adherence: average self-reported diet quality across recent
// check-ins, scored 0-100. Returns null when there's nothing to score.
const DIET_SCORE = { "On track": 100, "Mostly clean": 75, "Struggled": 40, "Off plan": 10 };
export function nutritionScoreFrom(checkins, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = cutoff.toISOString().split("T")[0];
  const recent = (checkins || []).filter((c) => c.date >= cut && c.diet != null);
  if (!recent.length) return { score: null, n: 0 };
  const total = recent.reduce((s, c) => s + (DIET_SCORE[c.diet] ?? 50), 0);
  return { score: Math.round(total / recent.length), n: recent.length };
}
