import { todayStr, localDateStr } from "./dates.js";
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

// Whether a single day's value satisfies a habit, given its type/target/
// direction. `done` applies to completion_button habits; `value` applies to
// manual_value/linked_check_in_value habits (compared against habit.target_value).
export function isHabitSatisfied(habit, { done, value } = {}) {
  if (habit.type === "manual_value" || habit.type === "linked_check_in_value") {
    if (value == null || habit.target_value == null) return false;
    return habit.target_direction === "at_most" ? value <= habit.target_value : value >= habit.target_value;
  }
  return !!done;
}

// Single source of truth for habit adherence — replaces the 3 previously
// duplicated `doneLogs / (habitCount*days)` reimplementations (Progress tab's
// HabitsProgress, the old ClientOverviewMobile, and the Coach View). Per-habit
// % and the overall % are derived from the exact same per-day satisfied counts,
// so they can never visually contradict each other. `checkinByDate` (a
// {date: daily_checkins row} map) is only needed for linked_check_in_value
// habits, to read the day's logged value for that habit's linked field.
export function habitAdherenceFrom(habits, logs, { days = 30, asOf = new Date(), checkinByDate = {} } = {}) {
  const windowDates = Array.from({ length: days }, (_, i) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() - (days - 1 - i));
    return localDateStr(d);
  });
  const valueFor = (habit, date) => {
    if (habit.type === "linked_check_in_value") return checkinByDate[date]?.[habit.linked_field] ?? null;
    const log = (logs || []).find((l) => l.habit_id === habit.id && l.date === date);
    return log?.value ?? null;
  };
  const doneFor = (habit, date) => (logs || []).some((l) => l.habit_id === habit.id && l.date === date && l.done);

  let totalSatisfied = 0;
  let totalPossible = 0;
  const perHabit = {};
  (habits || []).forEach((h) => {
    let satisfied = 0;
    windowDates.forEach((date) => {
      if (isHabitSatisfied(h, { done: doneFor(h, date), value: valueFor(h, date) })) satisfied++;
    });
    perHabit[h.id] = { pct: Math.round((satisfied / days) * 100), satisfied, possible: days };
    totalSatisfied += satisfied;
    totalPossible += days;
  });
  return {
    overall: totalPossible ? Math.round((totalSatisfied / totalPossible) * 100) : null,
    perHabit,
    windowDates,
  };
}

// Workout adherence over scheduled days only (completed / (completed +
// missed)) — rest days excluded from both numerator and denominator
// entirely. Deliberately distinct from adherenceFrom().trainingRate (which
// includes rest days in its denominator); existing callers of trainingRate
// are left unchanged, this is only for surfaces that need the
// scheduled-days-only definition.
export function workoutAdherenceFrom(checkins, days = 30, asOf = new Date()) {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = localDateStr(cutoff);
  const asOfStr = localDateStr(asOf);
  const recent = (checkins || []).filter((c) => c.date >= cut && c.date <= asOfStr);
  const completed = recent.filter((c) => c.workout === "completed").length;
  const missed = recent.filter((c) => c.workout === "missed").length;
  const scheduled = completed + missed;
  return { score: scheduled ? Math.round((completed / scheduled) * 100) : null, completed, scheduled };
}

// Average sleep hours (daily_checkins.sleep_hours) over a trailing window.
// Returns null on no data — never 0, which would misleadingly read as "no sleep."
export function avgSleepHoursFrom(checkins, days = 30, asOf = new Date()) {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = localDateStr(cutoff);
  const asOfStr = localDateStr(asOf);
  const vals = (checkins || [])
    .filter((c) => c.date >= cut && c.date <= asOfStr && c.sleep_hours != null)
    .map((c) => Number(c.sleep_hours));
  return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
}

// Weight change over an explicit trailing window — consolidates two
// previously-divergent implementations (one scoped to 30 days, one
// unscoped) into one that always reports the window it used, so every
// caller can label its timeframe explicitly instead of showing a bare delta.
export function weightChangeFrom(weightSeries, days = 30, asOf = new Date()) {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = localDateStr(cutoff);
  const asOfStr = localDateStr(asOf);
  const inWindow = (weightSeries || [])
    .filter((w) => w.date >= cut && w.date <= asOfStr)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (inWindow.length < 2) return { delta: null, days };
  return { delta: inWindow[inWindow.length - 1].weight - inWindow[0].weight, days };
}

// Calendar progress through the program's stated length (weeks elapsed ÷
// total weeks) — distinct from computeGoalScore's overallScore, which blends
// nutrition/training/weight-trend signals. `program` needs start_date + weeks
// (both already exist on the programs table).
export function programCalendarProgressFrom(program, asOf = new Date()) {
  if (!program?.start_date || !program?.weeks) return null;
  const elapsedDays = Math.floor((asOf - new Date(program.start_date + "T00:00:00")) / 86400000);
  const pct = Math.max(0, Math.min(100, Math.round((elapsedDays / (program.weeks * 7)) * 100)));
  return { pct, elapsedWeeks: Math.max(0, Math.floor(elapsedDays / 7)), totalWeeks: program.weeks };
}

// Status label for a manual-value/linked-check-in target: within ±5% of
// target is "On Target", within ±15% is "Near Target", beyond that is
// Over/Above or Under Target depending on direction. Thresholds confirmed
// with the lead — not derived from the data.
export function targetStatus(actual, target, direction = "at_least") {
  if (actual == null || target == null || !target) return null;
  const diffPct = ((actual - target) / target) * 100;
  if (Math.abs(diffPct) <= 5) return "On Target";
  if (Math.abs(diffPct) <= 15) return "Near Target";
  if (diffPct > 15) return direction === "at_most" ? "Over Target" : "Above Target";
  return "Under Target";
}

// "X of Y complete" for the Today screen: every active habit + workout +
// nutrition counts as one item each. `habitLogs`/`checkin` can be live draft
// state (not yet persisted) so the progress bar updates as the client fills
// the form in, not only after submit. Never hardcoded — the denominator is
// whatever this client's actual assigned workflow is.
export function todayCompletionFrom({ habits, habitLogs, checkin, date }) {
  const items = (habits || []).map((h) => {
    const value = h.type === "linked_check_in_value" ? checkin?.[h.linked_field] : (habitLogs || []).find((l) => l.habit_id === h.id && l.date === date)?.value;
    const done = (habitLogs || []).some((l) => l.habit_id === h.id && l.date === date && l.done);
    return { key: `habit_${h.id}`, done: isHabitSatisfied(h, { done, value }) };
  });
  items.push({ key: "workout", done: checkin?.workout != null });
  items.push({ key: "nutrition", done: checkin?.diet != null });
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
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

  const sleepAvg = avgSleepHoursFrom(ch, 14, new Date(today));
  const sleepTarget = client?.sleep_target_hours ?? 7;
  if (sleepAvg != null && sleepAvg < sleepTarget - 1) flags.push({ label: `Avg sleep ${sleepAvg}h`, tone: "amber", detail: `Averaging ${sleepAvg}h of sleep over the last 14 days, below the ${sleepTarget}h target.`, action: "Check in on sleep and recovery load.", clientMessage: `Your sleep has averaged ${sleepAvg}h over the last 2 weeks — let's see what's getting in the way of more rest.` });

  const severity = flags.reduce((s, f) => s + (f.tone === "red" ? 2 : 1), 0);
  const riskLevel = severity >= 4 ? "High" : severity >= 2 ? "Medium" : severity >= 1 ? "Low" : "On Track";
  return { client, adh, last, since, flags, loggingFlags, loggingStatus, severity, riskLevel, goalScore };
}
