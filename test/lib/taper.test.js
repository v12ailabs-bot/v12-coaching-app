import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTaperConfig, baselineVolume, planTaper, allocate, taperPhase, evaluateTaperWatch, applyTaperOverride, TAPER_TEMPLATE } from "../../src/lib/progression/taper.js";
import { evaluateProgression } from "../../src/lib/progression/methods.js";

// Reference: 2 weeks (2026-09-01 Tue .. 2026-09-14 Mon). Sessions Wed/Fri/Mon x 2 weeks = 6 training days.
const REF_DATES = ["2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14"];
const squat = REF_DATES.map((d) => ({ date: d, exercise: "Squat", sets: 1, reps: 5, weight: 100 }));
const bench = REF_DATES.map((d) => ({ date: d, exercise: "Bench", sets: 1, reps: 5, weight: 60 }));
// 5 sets per exercise per session (sets are separate rows)
const mkLogs = (names = ["Squat", "Bench"], perSession = 5) => REF_DATES.flatMap((d) => names.flatMap((n) => Array.from({ length: perSession }, (_, i) => ({ date: d, exercise: n, sets: i + 1, reps: 5, weight: n === "Squat" ? 100 : 60 }))));
const BASE = {
  eventDate: "2026-10-10", durationDays: 10, reductionPct: 40, volumeUnit: "sets",
  referencePeriod: { start: "2026-09-01", end: "2026-09-14" }, sessionWeekdays: ["Mon", "Wed", "Fri"],
};
const plan = (over = {}, logs = mkLogs(["Squat"])) => planTaper({ config: { ...BASE, ...over }, logs });

test("volume calculation: baseline, target, distribution and rounding all add up (sets)", () => {
  const p = plan();
  assert.equal(p.status, "prescription");
  assert.equal(p.baseline.weeklyVolume, 15, "30 sets over 2 weeks");
  assert.deepEqual(p.window, { start: "2026-09-30", end: "2026-10-09", eventDate: "2026-10-10", durationDays: 10 });
  assert.deepEqual(p.sessions.map((s) => s.date), ["2026-09-30", "2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09"]);
  assert.ok(Math.abs(p.baselineWindowVolume - (15 * 10) / 7) < 1e-9);
  assert.ok(Math.abs(p.targetVolume - ((15 * 10) / 7) * 0.6) < 1e-9);
  assert.deepEqual(p.sessions.map((s) => s.total), [3, 3, 3, 2, 2], "12.857 rounds to 13, spread by largest remainder");
  assert.equal(p.plannedVolume, 13);
  assert.ok(p.sessions.every((s) => s.total <= 5), "never above the baseline per-session volume");
  assert.equal(p.frequency.sessions, 5);
});

test("linear_decrease puts more in the early sessions and still sums to the rounded target", () => {
  const p = plan({ distribution: "linear_decrease" });
  assert.deepEqual(p.sessions.map((s) => s.total), [4, 3, 3, 2, 1]);
  assert.equal(p.plannedVolume, 13);
});

test("different durations and reductions", () => {
  const short = plan({ durationDays: 7, reductionPct: 50 });
  assert.equal(short.window.start, "2026-10-03");
  assert.equal(short.targetVolume, 7.5);
  assert.equal(short.plannedVolume, 8, "7.5 rounds to 8 units");
  const long = plan({ durationDays: 14, reductionPct: 30 });
  assert.equal(long.sessions.length, 6);
  assert.ok(Math.abs(long.targetVolume - 30 * 0.7) < 1e-9);
  assert.equal(plan({ reductionPct: 0 }).plannedVolume, Math.round((15 * 10) / 7));
});

test("volume_load and reps units, with roundTo", () => {
  const vl = plan({ volumeUnit: "volume_load", roundTo: 50 });
  assert.equal(vl.baseline.weeklyVolume, 7500, "30 sets x 5 reps x 100 over 2 weeks = 7500/wk");
  assert.ok(vl.sessions.every((s) => s.total % 50 === 0), "every session is a multiple of 50");
  const reps = plan({ volumeUnit: "reps" });
  assert.equal(reps.baseline.weeklyVolume, 75);
});

test("event-specific and general exercises can taper by different amounts; exercise selection is not changed", () => {
  const p = plan({ exercises: [{ name: "Squat", role: "event_specific" }, { name: "Bench", role: "general" }], reductionPctByRole: { event_specific: 20, general: 60 } }, mkLogs(["Squat", "Bench"]));
  assert.equal(p.exercises.Squat.reductionPct, 20); assert.equal(p.exercises.Bench.reductionPct, 60);
  assert.ok(p.exercises.Squat.targetVolume > p.exercises.Bench.targetVolume);
  assert.deepEqual(Object.keys(p.sessions[0].volumeByExercise).sort(), ["Bench", "Squat"]);
  assert.equal(p.sessions.reduce((a, s) => a + s.total, 0), p.plannedVolume);
});

test("intensity is passed through unchanged, never altered by the engine", () => {
  const intensity = { default: { type: "pct1rm", min: 80, max: 92.5 } };
  assert.deepEqual(plan({ intensity }).intensity, intensity);
  assert.equal(plan().intensity, null);
});

test("a per-session cap that can't hold the target is reported, not exceeded", () => {
  const p = plan({ sessionWeekdays: ["Mon"] });
  assert.equal(p.sessions.length, 1);
  assert.equal(p.sessions[0].total, 5, "capped at the baseline per-session volume");
  assert.match(p.warnings.join(" "), /could not be placed/);
  const half = plan({ maxSessionVolumePct: 40 });
  assert.ok(half.sessions.every((s) => s.total <= 2));
});

test("missing or inadequate baseline -> explicit insufficient_data, nothing manufactured", () => {
  for (const logs of [[], mkLogs(["Squat"]).filter((r) => r.date === "2026-09-02"), mkLogs(["Squat"]).map((r) => ({ ...r, date: "2026-07-01" })), mkLogs(["Squat"]).map((r) => ({ ...r, set_type: "warmup" }))]) {
    const p = plan({}, logs);
    assert.equal(p.status, "insufficient_data");
    assert.ok(!p.sessions);
    assert.match(p.reasons[0], /at least 2 training days/);
  }
});

test("volume_load leaves out rows without a load and says so (never counts them as zero)", () => {
  const logs = mkLogs(["Squat"]).map((r, i) => (i === 0 ? { ...r, weight: null } : r));
  const p = plan({ volumeUnit: "volume_load" }, logs);
  assert.equal(p.baseline.total, 14500, "29 sets x 5 reps x 100 (the load-less set is left out)");
  assert.match(p.warnings.join(" "), /left out of the baseline/);
  assert.equal(baselineVolume({ logs, referencePeriod: { start: new Date(Date.UTC(2026, 8, 1)), end: new Date(Date.UTC(2026, 8, 14)) }, volumeUnit: "volume_load" }).excluded.length, 1);
});

test("validation: dates, duration, percentages, intensity ranges, weekdays, reference period", () => {
  const bad = (over, re) => { const r = plan(over); assert.equal(r.status, "invalid", JSON.stringify(over)); assert.match(r.errors.join(" "), re, JSON.stringify(over)); };
  bad({ eventDate: "2026-02-30" }, /real date/);
  bad({ eventDate: "next friday" }, /real date/);
  bad({ durationDays: 0 }, /durationDays/);
  bad({ durationDays: 61 }, /durationDays/);
  bad({ durationDays: 7.5 }, /durationDays/);
  bad({ durationDays: undefined }, /durationDays or a startDate/);
  bad({ startDate: "2026-10-01" }, /doesn't land on the event date/);
  bad({ durationDays: undefined, startDate: "2026-10-10" }, /start before the event/);
  bad({ reductionPct: -5 }, /reductionPct/);
  bad({ reductionPct: 100 }, /reductionPct/);
  bad({ reductionPct: "40" }, /reductionPct/);
  bad({ volumeUnit: "kilograms" }, /volumeUnit/);
  bad({ referencePeriod: { start: "2026-09-10", end: "2026-09-12" } }, /at least 7 days/);
  bad({ referencePeriod: { start: "2026-09-01", end: "2026-10-05" } }, /end before the taper starts/);
  bad({ referencePeriod: undefined }, /referencePeriod/);
  bad({ sessionWeekdays: [] }, /sessionWeekdays/);
  bad({ sessionWeekdays: ["Mon", "Funday"] }, /sessionWeekdays/);
  bad({ roundTo: 0 }, /roundTo/);
  bad({ maxSessionVolumePct: 150 }, /maxSessionVolumePct/);
  bad({ intensity: { default: { type: "pct1rm", min: 90, max: 80 } } }, /min <= max/);
  bad({ intensity: { default: { type: "pct1rm", min: 80, max: 120 } } }, /exceed 100/);
  bad({ intensity: { default: { type: "rpe", min: 0, max: 11 } } }, /between 1 and 10/);
  bad({ exercises: [{ name: "" }] }, /needs a name/);
  bad({ reductionPctByRole: { event_specific: 130 } }, /reductionPctByRole/);
});

test("template defaults are suggestions: outside 7-14 days / 30-60% is a WARNING, not an error", () => {
  const v = validateTaperConfig({ ...BASE, durationDays: 21, reductionPct: 75 });
  assert.equal(v.ok, true);
  assert.equal(v.warnings.length, 2);
  assert.match(v.warnings.join(" "), /template suggestion/);
  assert.deepEqual(TAPER_TEMPLATE.suggestedDurationDays, [7, 14]);
  assert.deepEqual(TAPER_TEMPLATE.suggestedReductionPct, [30, 60]);
  assert.equal(validateTaperConfig({ ...BASE }).warnings.length, 0);
});

test("event-date boundaries: window ends the day before the event; the event day never gets a session; a rest day before is the coach's choice", () => {
  const onEventWeekday = plan({ sessionWeekdays: ["Sat"] });           // event 2026-10-10 is a Saturday
  assert.deepEqual(onEventWeekday.sessions.map((x) => x.date), ["2026-10-03"], "Sat Oct 10 is the event itself, so it never gets a taper session");
  const none = plan({ durationDays: 2, sessionWeekdays: ["Mon"] });                  // window Oct 8-9 (Thu, Fri)
  assert.equal(none.status, "invalid"); assert.match(none.errors.join(" "), /No taper sessions fit/);
  const oneDay = plan({ durationDays: 1 });                            // only 2026-10-09 (Fri)
  assert.deepEqual(oneDay.sessions.map((s) => s.date), ["2026-10-09"]);
  const rest = plan({ lastSessionDaysBeforeEvent: 1 });
  assert.equal(rest.sessions.at(-1).date, "2026-10-07", "Fri Oct 9 dropped when a rest day is required before the event");
  const longest = plan({ durationDays: 60 });
  assert.equal(longest.status, "invalid", "a 60-day window starts before the reference period ends");
  assert.match(longest.errors.join(" "), /end before the taper starts/);
});

test("taperPhase: before / active / event day / ended — it never restarts or extends", () => {
  const p = plan();
  assert.equal(taperPhase(p, "2026-09-29"), "before"); assert.equal(taperPhase(p, "2026-09-30"), "active");
  assert.equal(taperPhase(p, "2026-10-09"), "active"); assert.equal(taperPhase(p, "2026-10-10"), "event_day");
  assert.equal(taperPhase(p, "2026-10-11"), "ended"); assert.equal(taperPhase(p, "2027-01-01"), "ended");
  assert.equal(taperPhase({}, "2026-10-01"), null);
});

test("allocate: sums to the rounded total, respects caps, reports what it can't place", () => {
  assert.deepEqual(allocate(13, [1, 1, 1, 1, 1], 1).parts, [3, 3, 3, 2, 2]);
  assert.equal(allocate(10, [3, 2, 1], 1).parts.reduce((a, b) => a + b, 0), 10);
  assert.deepEqual(allocate(0, [1, 1], 1), { parts: [0, 0], unplaced: 0 });
  const capped = allocate(20, [1, 1], 1, 6);
  assert.deepEqual(capped.parts, [6, 6]); assert.equal(capped.unplaced, 8);
  assert.deepEqual(allocate(100, [1, 1, 1], 5).parts.map((p) => p % 5), [0, 0, 0]);
});

test("readiness / pain / performance flags come only from configured rules and real data; nothing is invented", () => {
  const w = { start: "2026-09-30", end: "2026-10-09" };
  const none = evaluateTaperWatch({ config: {}, window: w });
  assert.equal(none.coachReview, false); assert.ok(none.unavailable.length >= 1);
  const rule = { readiness: { field: "energy", min: 5, consecutiveDays: 2 }, performanceDropPct: 5 };
  assert.equal(evaluateTaperWatch({ config: rule, window: w, readinessRows: [] }).flags.length, 0, "no readings -> no flag, listed as unavailable");
  assert.match(evaluateTaperWatch({ config: rule, window: w, readinessRows: [] }).unavailable.join(" "), /No energy readings/);
  const one = evaluateTaperWatch({ config: rule, window: w, readinessRows: [{ date: "2026-10-01", energy: 3 }, { date: "2026-10-02", energy: 8 }] });
  assert.equal(one.flags.length, 0, "a single low reading doesn't meet 2 in a row");
  const two = evaluateTaperWatch({ config: rule, window: w, readinessRows: [{ date: "2026-10-01", energy: 3 }, { date: "2026-10-02", energy: 4 }] });
  assert.equal(two.coachReview, true); assert.equal(two.flags[0].type, "readiness");
  assert.equal(evaluateTaperWatch({ config: rule, window: w, readinessRows: [{ date: "2026-08-01", energy: 1 }, { date: "2026-08-02", energy: 1 }] }).flags.length, 0, "readings outside the window are ignored");
  assert.equal(evaluateTaperWatch({ config: {}, window: w, painReports: [{ date: "2026-10-03" }] }).flags[0].type, "pain");
  const perf = evaluateTaperWatch({ config: rule, window: w, performance: { baseline: 100, current: 90 } });
  assert.equal(perf.flags.some((f) => f.type === "performance"), true);
  assert.equal(evaluateTaperWatch({ config: rule, window: w, performance: { baseline: 100, current: 98 } }).flags.some((f) => f.type === "performance"), false);
  assert.match(evaluateTaperWatch({ config: rule, window: w }).unavailable.join(" "), /performance/);
});

test("coach overrides: the original calculation is untouched, the change and reason are logged, invalid overrides are refused", () => {
  const calculated = plan();
  const snap = JSON.stringify(calculated);
  const r1 = applyTaperOverride({ plan: calculated, calculated, log: [], override: { date: "2026-10-02", volumeByExercise: { Squat: 1 }, note: "feeling beat up" }, by: "coach-1", at: "2026-10-01T10:00:00Z" });
  assert.equal(r1.ok, true);
  assert.equal(JSON.stringify(calculated), snap, "the calculated plan is never mutated");
  assert.equal(r1.plan.sessions[1].total, 1); assert.equal(r1.plan.sessions[1].overridden, true);
  assert.equal(r1.plan.plannedVolume, 11);
  assert.deepEqual([r1.entry.before.total, r1.entry.after.total, r1.entry.by, r1.entry.note], [3, 1, "coach-1", "feeling beat up"]);
  const r2 = applyTaperOverride({ plan: r1.plan, calculated, log: r1.log, override: { date: "2026-10-05", volumeByExercise: { Squat: 0 }, note: "rest" } });
  assert.equal(r2.log.length, 2); assert.equal(r2.log[0].note, "feeling beat up", "earlier entries preserved");
  for (const [o, re] of [[{ date: "2026-10-02", volumeByExercise: { Squat: 1 } }, /note/], [{ date: "2026-10-02", volumeByExercise: { Squat: -1 }, note: "x" }, /zero or more/], [{ date: "2026-12-25", volumeByExercise: { Squat: 1 }, note: "x" }, /No taper session/], [{ date: "2026-10-02", volumeByExercise: { Deadlift: 1 }, note: "x" }, /isn't part/], [{ date: "2026-10-02", volumeByExercise: {}, note: "x" }, /No volume changes/]]) {
    const bad = applyTaperOverride({ plan: calculated, calculated, log: [], override: o });
    assert.equal(bad.ok, false); assert.match(bad.errors.join(" "), re);
  }
});

test("through the registry entry point; planning is pure (inputs not mutated)", () => {
  const cfg = { ...BASE }, logs = mkLogs(["Squat"]);
  const snap = JSON.stringify([cfg, logs]);
  const r = evaluateProgression("performance_taper", { config: cfg, logs });
  assert.equal(r.status, "prescription");
  assert.equal(JSON.stringify([cfg, logs]), snap);
});

test("an exercise done on only some training days doesn't break the caps (real-data regression): the session total is planned, then split by exercise share", () => {
  const logs = [...mkLogs(["Squat"]), ...Array.from({ length: 5 }, (_, i) => ({ date: "2026-09-02", exercise: "Bench", sets: i + 1, reps: 5, weight: 60 }))];
  const p = plan({}, logs);
  assert.equal(p.status, "prescription");
  assert.doesNotMatch(p.warnings.join(" "), /could not be placed/);
  assert.equal(p.plannedVolume, 15, "35 sets / 2 weeks x 10/7 weeks x 60%");
  assert.ok(p.sessions.every((s) => s.total <= 35 / 6 + 1e-9), "within the baseline per-training-day volume");
  assert.ok(p.exercises.Squat.plannedVolume > p.exercises.Bench.plannedVolume, "the mix keeps Squat the bigger share");
  assert.equal(p.sessions.reduce((a, s) => a + s.total, 0), p.plannedVolume);
});
