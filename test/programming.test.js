import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTrainingPlan, isValidReps } from "../src/lib/programming/validateProgram.js";
import { estimateDay, estimateProgram, shortenDay, setWorkSeconds, isValidSessionMinutes, normalizeSessionConfig } from "../src/lib/programming/sessionDuration.js";
import { diffPrograms, replaceDay } from "../src/lib/programming/draftDiff.js";

const ex = (o = {}) => ({ name: "Back Squat", sets: 4, reps: "6", rest_seconds: 180, section: "Main Compound Lift", ...o });
const plan = (days) => ({ program_name: "P", weeks: 12, weekly_split: days || [{ day: "Monday", focus: "Lower", exercises: [ex()] }] });

test("valid plan normalises and passes", () => {
  const r = validateTrainingPlan(plan());
  assert.equal(r.ok, true);
  assert.equal(r.program.weekly_split[0].exercises[0].order_index, 0);
  assert.equal(r.program.days_per_week, 1);
});

test("rejects non-object / empty / missing-structure output", () => {
  for (const bad of [null, "text", [], {}, { program_name: "x" }, { program_name: "x", weekly_split: [] }]) {
    assert.equal(validateTrainingPlan(bad).ok, false, JSON.stringify(bad));
  }
});

test("rejects missing name, sets, reps, bad rest, bad day, empty day, duplicate day", () => {
  const cases = [
    [{ day: "Monday", exercises: [ex({ name: "" })] }, /missing name/],
    [{ day: "Monday", exercises: [ex({ sets: undefined })] }, /sets/],
    [{ day: "Monday", exercises: [ex({ sets: 0 })] }, /sets/],
    [{ day: "Monday", exercises: [ex({ sets: 99 })] }, /sets/],
    [{ day: "Monday", exercises: [ex({ reps: "" })] }, /reps/],
    [{ day: "Monday", exercises: [ex({ reps: "lots" })] }, /reps/],
    [{ day: "Monday", exercises: [ex({ rest_seconds: -5 })] }, /rest/],
    [{ day: "Monday", exercises: [ex({ rest_seconds: 9999 })] }, /rest/],
    [{ day: "Someday", exercises: [ex()] }, /Unrecognised day/],
    [{ day: "Monday", exercises: [] }, /no exercises/],
  ];
  for (const [day, re] of cases) {
    const r = validateTrainingPlan(plan([day]));
    assert.equal(r.ok, false, String(re));
    assert.match(r.errors.map((e) => e.message).join(" "), re);
  }
  const dup = validateTrainingPlan(plan([{ day: "Monday", exercises: [ex()] }, { day: "monday", exercises: [ex()] }]));
  assert.equal(dup.ok, false);
});

test("missing rest is defaulted by phase with a warning; AMRAP and timed reps are accepted", () => {
  const r = validateTrainingPlan(plan([{ day: "Monday", exercises: [ex({ rest_seconds: undefined }), ex({ name: "Plank", reps: "45 sec", section: "Isolation", rest_seconds: 30 }), ex({ name: "Burpees", reps: "AMRAP", section: "Finisher", rest_seconds: 45 })] }]));
  assert.equal(r.ok, true);
  assert.equal(r.program.weekly_split[0].exercises[0].rest_seconds, 180);
  assert.ok(r.warnings.some((w) => /defaulted to 180s/.test(w.message)));
  assert.equal(isValidReps("AMRAP"), true);
  assert.equal(isValidReps("8-12"), true);
});

test("orders exercises by phase and canonicalises day names", () => {
  const r = validateTrainingPlan(plan([{ day: "wednesday", focus: "x", exercises: [ex({ name: "Curl", section: "Isolation" }), ex({ name: "Warm", section: "Warm-Up", rest_seconds: 20 }), ex()] }]));
  assert.equal(r.program.weekly_split[0].day, "Wednesday");
  assert.deepEqual(r.program.weekly_split[0].exercises.map((e) => e.name), ["Warm", "Back Squat", "Curl"]);
});

test("a lone superset member is demoted; a real pair is kept", () => {
  const lone = validateTrainingPlan(plan([{ day: "Monday", exercises: [ex({ block_type: "superset", group_id: "A" })] }]));
  assert.equal(lone.program.weekly_split[0].exercises[0].block_type, "straight_set");
  const pair = validateTrainingPlan(plan([{ day: "Monday", exercises: [ex({ block_type: "superset", group_id: "A" }), ex({ name: "Row", block_type: "superset", group_id: "A" })] }]));
  assert.equal(pair.program.weekly_split[0].exercises[0].block_type, "superset");
});

test("session duration: options depend on arrangement, custom only when independent", () => {
  assert.equal(isValidSessionMinutes(60, "in_person"), true);
  assert.equal(isValidSessionMinutes(90, "in_person"), false);
  assert.equal(isValidSessionMinutes(90, "video_call"), false);
  assert.equal(isValidSessionMinutes(180, "independent_online"), true);
  assert.equal(isValidSessionMinutes(100, "independent_online"), true);   // custom
  assert.equal(isValidSessionMinutes(5, "independent_online"), false);
  assert.equal(normalizeSessionConfig({ arrangement: "in_person", session_minutes: 90 }).session_minutes, 60);
});

const day = () => [
  ex({ name: "Warm", section: "Warm-Up", sets: 2, reps: "10", rest_seconds: 20 }),
  ex({ name: "Cooldown stretch", section: "Cooldown", sets: 1, reps: "60 sec", rest_seconds: 0 }),
  ex(),
  ex({ name: "RDL", section: "Secondary Compound Lift", sets: 3, reps: "8", rest_seconds: 120 }),
  ex({ name: "Lunge", section: "Accessories", sets: 3, reps: "10", rest_seconds: 75 }),
  ex({ name: "Leg Curl", section: "Accessories", sets: 3, reps: "12", rest_seconds: 60 }),
  ex({ name: "Calf Raise", section: "Isolation", sets: 3, reps: "15", rest_seconds: 45 }),
  ex({ name: "Sled", section: "Finisher", sets: 3, reps: "30 sec", rest_seconds: 45 }),
];

test("estimate separates independent prep/finish from coached time", () => {
  const e = estimateDay(day(), { session_minutes: 60 });
  assert.ok(e.prep > 0 && e.finish > 0 && e.coached > 20);
  assert.equal(e.total, e.prep + e.coached + e.finish);
  const coachedPrep = estimateDay(day(), { session_minutes: 60, prep: "coached", finish: "coached" });
  assert.equal(coachedPrep.prep, 0);
  assert.ok(coachedPrep.coached > e.coached);
});

test("estimate grows with sets, reps and rest; superset shares rest", () => {
  const base = estimateDay([ex()], {}).coached;
  assert.ok(estimateDay([ex({ sets: 6 })], {}).coached > base);
  assert.ok(estimateDay([ex({ rest_seconds: 300 })], {}).coached > base);
  assert.ok(estimateDay([ex({ reps: "20" })], {}).coached >= base);
  const a = ex({ name: "A", section: "Accessories", block_type: "superset", group_id: "S", rest_seconds: 60 });
  const b = ex({ name: "B", section: "Accessories", block_type: "superset", group_id: "S", rest_seconds: 60 });
  const sep = estimateDay([{ ...a, block_type: "straight_set", group_id: "1" }, { ...b, block_type: "straight_set", group_id: "2" }], {}).coached;
  assert.ok(estimateDay([a, b], {}).coached < sep);
  assert.ok(setWorkSeconds("8-12") > setWorkSeconds("8"));
  assert.ok(setWorkSeconds("45 sec") > 45);
});

test("shortenDay keeps the primary lift and its rest, drops low-priority work first", () => {
  const before = estimateDay(day(), { session_minutes: 60 }).coached;
  const r = shortenDay(day(), Math.round(before * 0.6), {});
  const names = r.exercises.map((e) => e.name);
  assert.ok(names.includes("Back Squat"));
  assert.equal(r.exercises.find((e) => e.name === "Back Squat").rest_seconds, 180);
  assert.ok(r.after < before);
  assert.ok(r.removed.every((n) => ["Calf Raise", "Sled", "Leg Curl", "Lunge"].includes(n)), r.removed.join());
  assert.ok(names.includes("Warm") && names.includes("Cooldown stretch"));
  // every surviving exercise keeps its original rest period
  r.exercises.forEach((e) => assert.equal(e.rest_seconds, day().find((d) => d.name === e.name).rest_seconds));
});

test("shortenDay never removes the primary lift even at an impossible target", () => {
  const r = shortenDay(day(), 5, {});
  assert.ok(r.exercises.some((e) => e.name === "Back Squat"));
  assert.equal(r.fits, false);
  assert.ok(r.exercises.find((e) => e.name === "Back Squat").sets >= 3);
});

test("shortenDay is a no-op when the workout already fits", () => {
  const r = shortenDay(day(), 500, {});
  assert.equal(r.removed.length + r.reduced.length, 0);
  assert.equal(r.fits, true);
});

test("estimateProgram returns one row per day", () => {
  const p = validateTrainingPlan(plan([{ day: "Monday", exercises: day() }, { day: "Friday", exercises: day() }])).program;
  assert.equal(estimateProgram(p, {}).length, 2);
});

test("diffPrograms reports added/removed/changed/reordered and replaceDay touches one day only", () => {
  const a = validateTrainingPlan(plan([{ day: "Monday", exercises: [ex(), ex({ name: "Row", section: "Accessories" })] }, { day: "Friday", exercises: [ex({ name: "Bench" })] }])).program;
  const b = structuredClone(a);
  b.weekly_split[0].exercises[0].sets = 5;
  b.weekly_split[0].exercises.pop();
  b.weekly_split[0].exercises.push({ ...ex({ name: "Pullup", section: "Accessories" }), order_index: 1 });
  const d = diffPrograms(a, b);
  assert.deepEqual(d.changedDays, ["Monday"]);
  const mon = d.days.find((x) => x.day === "Monday");
  assert.deepEqual(mon.added, ["Pullup"]);
  assert.deepEqual(mon.removed, ["Row"]);
  assert.equal(mon.changed[0].fields[0].field, "sets");

  const replaced = replaceDay(a, "Monday", { focus: "new", exercises: [ex({ name: "Deadlift" })] });
  assert.equal(replaced.weekly_split[1], a.weekly_split[1]);          // untouched day is the same object
  assert.equal(replaced.weekly_split[0].exercises[0].name, "Deadlift");
  assert.equal(a.weekly_split[0].exercises[0].name, "Back Squat");     // input not mutated
});

import { buildDailyCheckinEntry, isEmptyCheckin } from "../src/lib/checkinEntry.js";
test("check-in: untouched fields stay null (no phantom 7/7, completed, on-track)", () => {
  const form = { weight: "", calories: "", protein_g: "", carbs_g: "", fats_g: "", water: "", sleep_hours: "", energy: null, mood: null, steps: "", diet: null, workout: null };
  const e = buildDailyCheckinEntry({ form, clientId: "c", date: "2026-11-02", submittedDate: "2026-11-02" });
  assert.equal(e.energy, null); assert.equal(e.mood, null); assert.equal(e.workout, null); assert.equal(e.diet, null);
  assert.equal(isEmptyCheckin(e), true);
});
test("check-in: an explicitly chosen value that equals the old default is kept", () => {
  const form = { weight: "185.5", energy: 7, mood: 7, diet: "On track", workout: "completed", steps: "", calories: "", protein_g: "", carbs_g: "", fats_g: "", water: "", sleep_hours: "" };
  const e = buildDailyCheckinEntry({ form, clientId: "c", date: "d", submittedDate: "d" });
  assert.equal(e.energy, 7); assert.equal(e.workout, "completed"); assert.equal(e.diet, "On track"); assert.equal(e.weight, 185.5);
  assert.equal(isEmptyCheckin(e), false);
});
test("check-in: junk values are dropped rather than saved", () => {
  const e = buildDailyCheckinEntry({ form: { energy: 99, mood: "x", diet: "whatever", workout: "maybe" }, clientId: "c", date: "d", submittedDate: "d" });
  assert.equal(e.energy, null); assert.equal(e.mood, null); assert.equal(e.diet, null); assert.equal(e.workout, null);
});

import { reviewProgramQuality } from "../src/lib/programming/validateProgram.js";
test("quality review flags day-count mismatch, missing compound and patterns", () => {
  const p = validateTrainingPlan(plan([
    { day: "Monday", exercises: [ex({ name: "Leg Curl", section: "Isolation", sets: 3 })] },
    { day: "Tuesday", exercises: [ex({ name: "Back Squat" })] },
    { day: "Wednesday", exercises: [ex({ name: "Back Squat" })] },
  ])).program;
  const w = reviewProgramQuality(p, { days_available: 4 }).map((x) => x.message).join(" | ");
  assert.match(w, /3 training day\(s\) but the client asked for 4/);
  assert.match(w, /Monday has no compound/);
  assert.match(w, /consecutive days/);
  assert.match(w, /no .*push/);
  assert.equal(reviewProgramQuality(p, { template_days: 3 }).some((x) => /training day\(s\)/.test(x.message)), false);
});

import { stripDurationRules, durationToWeeks, parseTemplateFrequency, buildFrameworkText } from "../api/_lib/notionTemplates.js";
test("template: duration-cap sections are removed, structure and rules are kept", () => {
  const body = ["## PROGRAM OVERVIEW", "Frequency: 4 days/week.", "Session target: 60 minutes by default; coach selects 45 or 75.", "Rest: 2-3 minutes",
    "## WEEKLY STRUCTURE", "### Day 1 — Upper A", "Bench — 3 × 5", "## SESSION TIME BUDGET", "Apply the hard rule", "## V12 AI RULE — HARD SESSION DURATION CAP", "never above 75", "### Time accounting", "count everything",
    "## AI RULES", "Keep push/pull balanced", "## V12 AI UPGRADE — SESSION DURATION, PROGRAMMING & COACH CONTROL", "### Hard session duration rule", "Max 75", "### Progression quality control", "Do not auto-add weight"].join("\n");
  const out = stripDurationRules(body);
  assert.match(out, /Day 1 — Upper A/); assert.match(out, /Keep push\/pull balanced/); assert.match(out, /Do not auto-add weight/); assert.match(out, /Rest: 2-3 minutes/);
  assert.doesNotMatch(out, /never above 75|Apply the hard rule|count everything|Max 75|Session target/);
  assert.match(buildFrameworkText({ name: "T" }, out), /superseded by the SESSION TIME BUDGET/);
});
test("template: duration -> weeks and single-number frequency", () => {
  assert.equal(durationToWeeks("12 weeks"), 12); assert.equal(durationToWeeks("3 months"), 13); assert.equal(durationToWeeks("1 month"), 4);
  assert.equal(durationToWeeks("ongoing"), null); assert.equal(durationToWeeks(null), null);
  assert.equal(parseTemplateFrequency("## OVERVIEW\nFrequency: 4 days/week."), 4);
  assert.equal(parseTemplateFrequency("frequency: 3 days"), 3);
  assert.equal(parseTemplateFrequency("Frequency: 2–3 days/week, full body"), null);
  assert.equal(parseTemplateFrequency("Frequency: 4-6 days"), null);
  assert.equal(parseTemplateFrequency("no frequency here"), null);
});

import { updateExercise, removeExercise, addExercise, moveExercise, canMove, replaceDayExercises } from "../src/lib/programming/draftEdit.js";
test("draft editing: add/remove/update/move are immutable, phase-ordered and day-scoped", () => {
  const p0 = validateTrainingPlan(plan([
    { day: "Monday", exercises: [ex(), ex({ name: "Row", section: "Accessories" }), ex({ name: "Curl", section: "Accessories" })] },
    { day: "Friday", exercises: [ex({ name: "Bench" })] },
  ])).program;
  const snapshot = JSON.stringify(p0);
  // update
  const p1 = updateExercise(p0, "Monday", 1, { sets: 5, rest_seconds: 100 });
  assert.equal(p1.weekly_split[0].exercises[1].sets, 5);
  assert.equal(p1.weekly_split[1], p0.weekly_split[1]);          // other day untouched (same object)
  // move within the same phase swaps; across phases is refused
  assert.equal(canMove(p0, "Monday", 1, -1), false);              // Row (Accessories) vs Back Squat (Main)
  assert.equal(moveExercise(p0, "Monday", 1, -1), p0);
  const p2 = moveExercise(p0, "Monday", 1, +1);
  assert.deepEqual(p2.weekly_split[0].exercises.map((e) => e.name), ["Back Squat", "Curl", "Row"]);
  assert.deepEqual(p2.weekly_split[0].exercises.map((e) => e.order_index), [0, 1, 2]);
  // add lands in phase order; remove drops by index and re-indexes
  const p3 = addExercise(p0, "Monday", { name: "Warm", section: "Warm-Up" });
  assert.equal(p3.weekly_split[0].exercises[0].name, "Warm");
  const p4 = removeExercise(p3, "Monday", 0);
  assert.deepEqual(p4.weekly_split[0].exercises.map((e) => e.name), ["Back Squat", "Row", "Curl"]);
  // replace a day's exercises (targeted AI revision / fit-to-budget) leaves others alone
  const p5 = replaceDayExercises(p0, "Friday", [ex({ name: "OHP" })]);
  assert.equal(p5.weekly_split[0], p0.weekly_split[0]);
  assert.equal(p5.weekly_split[1].exercises[0].name, "OHP");
  assert.equal(JSON.stringify(p0), snapshot);                      // input never mutated
  // result of edits still validates
  assert.equal(validateTrainingPlan(p3).ok, true);
});

import { dayExecutionStatus, workoutExecutionFrom, reportingActivityFrom, buildCompletionRow } from "../src/lib/workoutCompletion.js";
test("execution status: unreported is not missed, rest is not missed, explicit answers win", () => {
  assert.equal(dayExecutionStatus({ scheduled: true }), "unreported");
  assert.equal(dayExecutionStatus({ scheduled: false }), "rest");
  assert.equal(dayExecutionStatus({ scheduled: true, checkinWorkout: "missed" }), "missed");
  assert.equal(dayExecutionStatus({ scheduled: true, checkinWorkout: "rest" }), "rest");
  assert.equal(dayExecutionStatus({ scheduled: true, completion: { status: "completed" } }), "completed");
  assert.equal(dayExecutionStatus({ scheduled: true, completion: { status: "partial" } }), "partial");
  assert.equal(dayExecutionStatus({ scheduled: true, completion: { status: "partial" }, checkinWorkout: "completed" }), "completed");
});
test("execution summary: counts assigned/completed/unreported/rest separately, today is pending", () => {
  // 2026-11-02 is a Monday. Assigned Mon+Wed+Fri. Window = 14 days back from Mon 11-02.
  const r = workoutExecutionFrom({
    assignedWeekdays: new Set(["Monday", "Wednesday", "Friday"]), today: "2026-11-02", days: 14,
    completions: [{ date: "2026-10-30", status: "completed" }],            // Fri
    checkins: [{ date: "2026-10-28", workout: "completed" }, { date: "2026-10-26", workout: "missed" }], // Wed done, prior Mon missed (self-reported)
  });
  // Assigned dates in window (10-20 .. 11-02): Mon 10-20? no — window starts 10-20 (Tue): Wed10-21, Fri10-23, Mon10-26, Wed10-28, Fri10-30, Mon11-02(today)
  assert.equal(r.assigned, 5);                 // today excluded (pending)
  assert.equal(r.pendingToday, true);
  assert.equal(r.completed, 2);                // 10-28 check-in, 10-30 completion
  assert.equal(r.selfReportedMissed, 1);       // 10-26
  assert.equal(r.unreported, 2);               // 10-21, 10-23 — NOT counted as missed
  assert.equal(r.completed + r.partial + r.unreported + r.selfReportedMissed, r.assigned);
  assert.equal(r.restDays, 14 - 6);            // the 8 non-assigned days
});
test("execution summary: logging nothing on rest days never produces misses; explicit schedule override respected", () => {
  const r = workoutExecutionFrom({ assignedWeekdays: new Set(["Monday"]), today: "2026-11-03", days: 7,
    scheduledRows: [{ date: "2026-11-02", day_of_week: null }, { date: "2026-10-30", day_of_week: "Monday" }] });
  assert.equal(r.assigned, 1);                 // Mon 11-02 turned into a rest day; Fri 10-30 explicitly scheduled
  assert.equal(r.unreported, 1);
  assert.equal(r.selfReportedMissed, 0);
});
test("execution summary: days before the program started are ignored", () => {
  const r = workoutExecutionFrom({ assignedWeekdays: new Set(["Monday"]), today: "2026-11-09", days: 30, trackingStart: "2026-11-02" });
  assert.equal(r.assigned, 1); assert.equal(r.unreported, 1);
});
test("reporting activity is separate from execution", () => {
  const r = reportingActivityFrom({ today: "2026-11-02", days: 7,
    dailyCheckins: [{ date: "2026-11-01", workout: null, weight: 180 }, { date: "2026-11-02", calories: 2000 }, { date: "2026-10-01", calories: 1 }],
    weeklyCheckins: [{ date: "2026-10-28", bodyweight: 181 }], mealLogs: [{ date: "2026-11-01" }], habitLogs: [{ date: "2026-11-02", done: true }, { date: "2026-11-02", done: false, value: null }] });
  assert.deepEqual(r, { window: 7, dailyCheckinDays: 2, weeklyCheckins: 1, nutritionLoggedDays: 2, habitDays: 1, weightUpdates: 2 });
});
test("completion row builder trims note, validates status", () => {
  const row = buildCompletionRow({ clientId: "c", date: "d", dayOfWeek: "Monday", status: "weird", note: "  ok  ", setsLogged: 7 });
  assert.equal(row.status, "completed"); assert.equal(row.note, "ok"); assert.equal(row.sets_logged, 7);
  assert.equal(buildCompletionRow({ clientId: "c", date: "d", status: "partial", note: "  " }).note, null);
});

import { summarizePreviousProgram, analyzeExercise } from "../src/lib/programming/previousProgram.js";
test("previous program: lift trends, stalls, consistency and feedback make it into the briefing", () => {
  const exercises = [
    { id: "sq", name: "Back Squat", day_of_week: "Monday", sets: 4, reps: "5", section: "Main Compound Lift", is_bodyweight: false },
    { id: "cu", name: "Curl", day_of_week: "Monday", sets: 3, reps: "12", section: "Isolation", is_bodyweight: false },
    { id: "pu", name: "Pull-up", day_of_week: "Monday", sets: 3, reps: "8", is_bodyweight: true },
    { id: "nl", name: "Never Done", day_of_week: "Monday" },
  ];
  const mk = (id, vals) => vals.map((w, i) => ({ exercise_id: id, date: `2026-10-${String(5 + i * 7).padStart(2, "0")}`, weight: w, reps: 5, sets: 1, set_type: "working" }));
  const logs = [...mk("sq", [175, 185, 195, 205]), ...mk("cu", [30, 30, 30, 30]), { exercise_id: "pu", date: "2026-10-05", reps: 6, sets: 1 }, { exercise_id: "pu", date: "2026-10-12", reps: 8, sets: 1 },
    { exercise_id: "sq", date: "2026-10-05", weight: 400, reps: 1, sets: 1, set_type: "warmup" }];
  const r = summarizePreviousProgram({
    program: { name: "Foundation", goal: "strength", weeks: 12, start_date: "2026-10-01", phase: "build" }, exercises, logs, today: "2026-11-02",
    checkins: [{ date: "2026-10-05", weight: 190, energy: 7, sleep_hours: 7 }, { date: "2026-10-30", weight: 186, energy: 5 }],
    weekly: [{ date: "2026-10-26", felt_weaker: "left shoulder cranky on press", adjustments: "more arms please" }],
    completions: [{ date: "2026-10-05", status: "completed" }],
  });
  assert.equal(r.hasHistory, true);
  assert.match(r.text, /Back Squat.*175 lb × 5 → 205 lb × 5 over 4 sessions \[progressing\]/);   // warm-up 400 ignored
  assert.match(r.text, /Curl.*\[stalled\]/);
  assert.match(r.text, /Pull-up.*6 reps → 8 reps/);
  assert.match(r.text, /never logged: Never Done/i);
  assert.match(r.text, /190 lb \(2026-10-05\) → 186 lb/);
  assert.match(r.text, /left shoulder cranky/);
  assert.match(r.text, /Unreported does NOT mean missed/);
  assert.match(r.text, /TRANSITION RULES/);
});
test("previous program: no logs and no feedback = no briefing (new clients unaffected)", () => {
  assert.equal(summarizePreviousProgram({ program: null, today: "2026-11-02" }).hasHistory, false);
  const r = summarizePreviousProgram({ program: { name: "x", start_date: "2026-10-01" }, exercises: [{ id: "a", name: "A" }], today: "2026-11-02" });
  assert.equal(r.hasHistory, false); assert.equal(r.text, null);
  assert.equal(analyzeExercise({ id: "a", name: "A" }, []), null);
});
