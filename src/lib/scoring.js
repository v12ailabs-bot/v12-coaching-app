import { todayStr } from "../theme.jsx";
import { computeGoalScore } from "./scoring/goalScoring.js";

// Adherence over a trailing window: % of days with a daily check-in, plus the
// training-completion rate among those check-ins. Shared by client + coach views.
// The denominator scales to how long the client has actually been active (from
// their first check-in), capped at the window — so a client one day in who
// checked in reads 100%, not 1/30 (≈3%).
export function adherenceFrom(checkins, days = 30, asOf = new Date()) {
  const all = checkins || [];
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = cutoff.toISOString().split("T")[0];
  const asOfStr = asOf.toISOString().split("T")[0];
  const recent = all.filter((c) => c.date >= cut && c.date <= asOfStr);
  const checkinDays = new Set(recent.map((c) => c.date)).size;
  const completed = recent.filter((c) => c.workout === "completed").length;
  const firstEver = all.length ? all.reduce((m, c) => (c.date < m ? c.date : m), asOfStr) : asOfStr;
  const elapsed = Math.floor((new Date(asOfStr) - new Date(firstEver)) / 86400000) + 1;
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
export function nutritionScoreFrom(checkins, days = 30, asOf = new Date()) {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = cutoff.toISOString().split("T")[0];
  const asOfStr = asOf.toISOString().split("T")[0];
  const recent = (checkins || []).filter((c) => c.date >= cut && c.date <= asOfStr && c.diet != null);
  if (!recent.length) return { score: null, n: 0 };
  const total = recent.reduce((s, c) => s + (DIET_SCORE[c.diet] ?? 50), 0);
  return { score: Math.round(total / recent.length), n: recent.length };
}

// Logging/engagement signals — how consistently the client is checking in,
// independent of whether they're actually progressing. Kept separate from
// the At-Risk flags below: a client can be progressing well toward their
// goal while logging sparsely, and shouldn't land on the At-Risk board for
// that. `loggingStatus` is the at-a-glance Good/Fair/Poor badge; `loggingFlags`
// is the detail behind it, phrased the same way At-Risk flags are.
export function loggingAssessment(dailyCheckins, today = todayStr()) {
  const daysSinceDate = (d) => Math.round((new Date(today) - new Date(d)) / 86400000);
  const ch = dailyCheckins || [];
  const adh = adherenceFrom(ch, 30);
  const last = ch.length ? ch[ch.length - 1].date : null;
  const since = last ? daysSinceDate(last) : null;

  const loggingFlags = [];
  if (since == null) loggingFlags.push({ label: "No activity yet", tone: "red", detail: "This client has never logged a daily check-in.", action: "Reach out to help them log their first check-in.", clientMessage: "You haven't logged a check-in yet — let's get your first one in today." });
  else if (since > 7) loggingFlags.push({ label: `No activity ${since}d`, tone: "red", detail: `No daily check-in in ${since} days — worth reaching out to see what's going on.`, action: "Send a check-in message today.", clientMessage: `It's been ${since} days since your last check-in — let's get back on track, I'm here to help.` });
  else if (since >= 3) loggingFlags.push({ label: `${since}d since check-in`, tone: "amber", detail: `Last logged a daily check-in ${since} days ago.`, action: "A light nudge before this becomes a longer gap.", clientMessage: `Last check-in was ${since} days ago — a light nudge before this becomes a longer gap.` });
  if (adh.score < 50) loggingFlags.push({ label: `Adherence ${adh.score}%`, tone: "amber", detail: `Only checked in on ${adh.score}% of the last 30 days (aim for 70%+).`, action: "Simplify the check-in ask and address any stated barriers.", clientMessage: `You've checked in on ${adh.score}% of the last 30 days — let's aim for more consistency, even a quick one helps.` });

  const last7 = ch.filter((r) => daysSinceDate(r.date) <= 6).length;
  const prior7 = ch.filter((r) => daysSinceDate(r.date) > 6 && daysSinceDate(r.date) <= 13).length;
  if (prior7 >= 4 && last7 <= prior7 - 3) loggingFlags.push({ label: "Logging slowing down", tone: "amber", detail: `Checked in ${last7}/7 days this week, down from ${prior7}/7 the week before.`, action: "Worth a quick check-in before this turns into a gap.", clientMessage: `You've logged ${last7}/7 days this week, down from ${prior7}/7 last week — a quick check-in now keeps your momentum before it turns into a gap.` });

  const level = (since == null || since > 7 || adh.score < 50) ? "poor" : (since >= 3 || adh.score < 70) ? "fair" : "good";
  const label = level === "poor" ? "Poor logging" : level === "fair" ? "Fair logging" : "Good logging";
  const loggingStatus = { level, label };

  return { adh, last, since, loggingFlags, loggingStatus };
}

// One client's "needs attention" assessment: nutrition/goal/recovery flags
// plus an overall risk level, based purely on progress toward their goal —
// NOT on how consistently they log (see loggingAssessment for that). This is
// the single source of truth behind the coach's Needs Attention board
// (CoachHome) AND the client's own at-risk summary on their Home page
// (ClientHome) — same signals, same thresholds, so a client never sees a
// different picture than their coach does. Each flag carries `action`
// (coach-facing: what the coach should do about it) and `clientMessage`
// (client-facing: the coach talking directly to the client about it) so the
// two views can reuse one flag list with different copy.
export function assessClientRisk(client, dailyCheckins, weeklyCheckins, goal, today = todayStr()) {
  const daysSinceDate = (d) => Math.round((new Date(today) - new Date(d)) / 86400000);
  const ch = dailyCheckins || [];
  const { adh, last, since, loggingFlags, loggingStatus } = loggingAssessment(ch, today);

  const flags = [];
  const nut = nutritionScoreFrom(ch, 30);
  if (nut.score != null && nut.n >= 3 && nut.score < 50) flags.push({ label: `Nutrition ${nut.score}%`, tone: "amber", detail: `Self-rated diet quality has averaged ${nut.score}% across ${nut.n} check-ins in the last 30 days.`, action: "Revisit the nutrition plan for something more sustainable.", clientMessage: `Your nutrition has averaged ${nut.score}% over your last few check-ins — let's find something more sustainable together.` });

  const weights = ch.filter((r) => r.weight != null);
  let goalScore = null;
  if (goal) {
    goalScore = computeGoalScore(goal, weights.map((w) => ({ date: w.date, value: w.weight })), { nutrition: nut.score, training: adh.trainingRate });
    if (goalScore.classification === "Off Track") flags.push({ label: "Goal off track", tone: "red", detail: `Goal score is ${goalScore.overallScore ?? "—"}/100 — trending the wrong way relative to the target.`, action: "Review the plan against this goal — the current approach isn't working.", clientMessage: `Your goal score is ${goalScore.overallScore ?? "—"}/100 and trending the wrong way — let's revisit the plan together.` });
    else if (goalScore.classification === "Slightly Behind") flags.push({ label: "Goal slightly behind", tone: "amber", detail: `Goal score is ${goalScore.overallScore ?? "—"}/100 — behind the pace needed to hit the target date.`, action: "A small adjustment now could get this back on pace.", clientMessage: `Your goal score is ${goalScore.overallScore ?? "—"}/100 — a bit behind pace, but a small adjustment can get it back on track.` });
    if (goal.direction !== "maintain" && goalScore.velocity != null && Math.abs(goalScore.velocity) < 0.05)
      flags.push({ label: "Plateaued", tone: "amber", detail: "No meaningful weight movement toward the goal in the last 30 days.", action: "Consider a deload/refeed and review the program phase.", clientMessage: "There hasn't been much movement toward your goal in the last 30 days — might be time for a deload or a small plan tweak. Let's talk it through." });
  } else if (weights.length >= 2) {
    const delta = weights[weights.length - 1].weight - weights[0].weight;
    const goalText = (client?.goal || "").toLowerCase();
    const wantsLoss = /(loss|lean|cut|shred|fat)/.test(goalText);
    const wantsGain = /(gain|muscle|bulk|mass|size|strength)/.test(goalText);
    if (wantsLoss && delta > 1) flags.push({ label: `Weight ▲ ${delta.toFixed(1)}lb`, tone: "red", detail: `Weight is up ${delta.toFixed(1)}lb over the tracked period, working against a fat-loss goal.`, action: "Set a structured goal to track this properly, and review nutrition adherence.", clientMessage: `Weight is up ${delta.toFixed(1)}lb recently, which is working against your fat-loss goal — let's dig into what's going on.` });
    else if (wantsGain && delta < -1) flags.push({ label: `Weight ▼ ${Math.abs(delta).toFixed(1)}lb`, tone: "red", detail: `Weight is down ${Math.abs(delta).toFixed(1)}lb over the tracked period, working against a muscle-gain goal.`, action: "Set a structured goal to track this properly, and review nutrition adherence.", clientMessage: `Weight is down ${Math.abs(delta).toFixed(1)}lb recently, which is working against your muscle-gain goal — let's dig into what's going on.` });
  }

  const wk = weeklyCheckins || [];
  const recoveryOf = (w) => (w.sleep_quality != null || w.hydration_quality != null) ? ((w.sleep_quality || 0) + (w.hydration_quality || 0)) / ((w.sleep_quality != null) + (w.hydration_quality != null)) : null;
  const recentWk = wk.filter((w) => daysSinceDate(w.date) <= 13).map(recoveryOf).filter((v) => v != null);
  const priorWk = wk.filter((w) => daysSinceDate(w.date) > 13 && daysSinceDate(w.date) <= 27).map(recoveryOf).filter((v) => v != null);
  if (recentWk.length && priorWk.length) {
    const recentAvg = recentWk.reduce((s, v) => s + v, 0) / recentWk.length;
    const priorAvg = priorWk.reduce((s, v) => s + v, 0) / priorWk.length;
    if (priorAvg - recentAvg >= 1.5) flags.push({ label: "Recovery down", tone: "amber", detail: `Self-rated sleep/hydration averaged ${recentAvg.toFixed(1)}/10 the last 2 weeks, down from ${priorAvg.toFixed(1)}/10 the 2 weeks before.`, action: "Check in on sleep and stress load.", clientMessage: `Your self-rated sleep/hydration has dipped to ${recentAvg.toFixed(1)}/10 over the last 2 weeks, down from ${priorAvg.toFixed(1)}/10 before that — how are you feeling? Let's check in on that.` });
  }

  const severity = flags.reduce((s, f) => s + (f.tone === "red" ? 2 : 1), 0);
  const riskLevel = severity >= 4 ? "High" : severity >= 2 ? "Medium" : severity >= 1 ? "Low" : "On Track";
  return { client, adh, last, since, flags, loggingFlags, loggingStatus, severity, riskLevel, goalScore };
}
