import { topSetPerDay } from "../workoutLogs.js";
import { workoutExecutionFrom } from "../workoutCompletion.js";

// Builds the "what this client just did" briefing the AI receives when it writes
// their NEXT program, so the new block continues from where they actually
// finished (loads, what progressed, what stalled, how consistent they were, what
// they said) instead of starting from a blank slate. Pure: the API fetches the
// rows, this turns them into facts + a prompt block.

const MAX_EXERCISES = 16;
const MAX_FEEDBACK = 4;
const clip = (s, n = 220) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

export function analyzeExercise(exercise, logs) {
  const working = (logs || []).filter((l) => l.set_type !== "warmup");
  const perDay = topSetPerDay(working, exercise.is_bodyweight).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!perDay.length) return null;
  const metric = exercise.is_bodyweight ? "reps" : "weight";
  const vals = perDay.map((d) => Number(d[metric])).filter(Number.isFinite);
  const first = perDay[0], last = perDay[perDay.length - 1];
  let status = "too little data";
  if (vals.length >= 2) {
    const delta = vals[vals.length - 1] - vals[0];
    const stalled = vals.length >= 4 && Math.max(...vals.slice(-3)) <= vals[vals.length - 4];
    status = stalled ? "stalled" : delta > 0 ? "progressing" : delta < 0 ? "regressed" : "flat";
  }
  return { name: exercise.name, sessions: perDay.length, first, last, metric, status, bodyweight: !!exercise.is_bodyweight };
}

const fmtSet = (s, bodyweight) => (bodyweight ? `${s.reps ?? "?"} reps` : `${s.weight ?? "?"} lb${s.reps ? ` × ${s.reps}` : ""}`);

export function summarizePreviousProgram({ program, exercises = [], logs = [], checkins = [], weekly = [], completions = [], scheduled = [], today }) {
  if (!program) return { hasHistory: false, text: null, stats: null };

  const logsBy = new Map();
  logs.forEach((l) => { (logsBy.get(l.exercise_id) || logsBy.set(l.exercise_id, []).get(l.exercise_id)).push(l); });
  const perf = exercises.map((e) => ({ e, a: analyzeExercise(e, logsBy.get(e.id)) })).filter((x) => x.a)
    .sort((x, y) => y.a.sessions - x.a.sessions).slice(0, MAX_EXERCISES);
  const neverLogged = exercises.filter((e) => !logsBy.has(e.id)).map((e) => e.name);

  const feedback = weekly.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX_FEEDBACK).map((w) => {
    const parts = [["went well", w.what_went_well], ["lifts improved", w.lifts_improved], ["felt weaker", w.felt_weaker], ["exercise feedback", w.exercise_feedback],
      ["holding back", w.holding_back], ["asked to adjust", w.adjustments]].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${clip(v)}`);
    return parts.length ? `  ${w.date}: ${parts.join("; ")}` : null;
  }).filter(Boolean);

  const startDate = program.start_date || (program.created_at ? program.created_at.slice(0, 10) : null);
  const elapsedDays = startDate ? Math.max(1, daysBetween(startDate, today) + 1) : 90;
  const windowDays = Math.min(120, elapsedDays);
  const exec = workoutExecutionFrom({
    assignedWeekdays: new Set(exercises.map((e) => e.day_of_week).filter(Boolean)),
    scheduledRows: scheduled, checkins, completions, days: windowDays, today, trackingStart: startDate,
  });

  const weights = checkins.filter((c) => c.weight != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const avg = (key) => { const v = checkins.map((c) => Number(c[key])).filter((n) => Number.isFinite(n) && c0(n)); return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : null; };
  const c0 = (n) => n > 0;
  const energy = avg("energy"), sleep = avg("sleep_hours");

  const hasLogs = perf.length > 0;
  const hasHistory = hasLogs || feedback.length > 0;
  if (!hasHistory) return { hasHistory: false, text: null, stats: { exec } };

  const lines = [];
  lines.push(`PREVIOUS PROGRAM — what this client just completed (use it to build a smooth TRANSITION into the new block):`);
  lines.push(`- Program: "${program.name || "Unnamed"}"${program.goal ? `, goal: ${program.goal}` : ""}${program.weeks ? `, planned ${program.weeks} weeks` : ""}${startDate ? `, started ${startDate} (${Math.round(elapsedDays / 7)} weeks ago)` : ""}${program.phase ? `, last phase: ${program.phase}` : ""}.`);
  if (exec.assigned > 0) {
    lines.push(`- Consistency (last ${windowDays} days): ${exec.completed + exec.partial} of ${exec.assigned} assigned workouts confirmed complete, ${exec.unreported} unreported, ${exec.selfReportedMissed} self-reported missed. Unreported does NOT mean missed.`);
  }
  if (weights.length >= 2) lines.push(`- Bodyweight: ${weights[0].weight} lb (${weights[0].date}) → ${weights[weights.length - 1].weight} lb (${weights[weights.length - 1].date}).`);
  if (energy != null || sleep != null) lines.push(`- Recovery averages: ${energy != null ? `energy ${energy}/10` : ""}${energy != null && sleep != null ? ", " : ""}${sleep != null ? `sleep ${sleep} h` : ""} (only days the client reported them).`);
  if (hasLogs) {
    lines.push(`- Lift history (first → latest top set per session; trend over the program):`);
    perf.forEach(({ e, a }) => {
      lines.push(`  • ${e.name}${e.day_of_week ? ` (${e.day_of_week}` : " ("}${e.sets ? `, ${e.sets}×${e.reps || "?"}` : ""}${e.section ? `, ${e.section}` : ""}): ${fmtSet(a.first, a.bodyweight)} → ${fmtSet(a.last, a.bodyweight)} over ${a.sessions} session${a.sessions === 1 ? "" : "s"} [${a.status}]`);
    });
  }
  if (neverLogged.length) lines.push(`- Prescribed but never logged: ${neverLogged.slice(0, 8).join(", ")}${neverLogged.length > 8 ? ` (+${neverLogged.length - 8} more)` : ""}.`);
  if (feedback.length) { lines.push(`- Client feedback (most recent weekly check-ins):`); lines.push(...feedback); }
  lines.push(`TRANSITION RULES (apply when designing the new program):
  1. Continuity of loading: write each repeated or similar lift's starting load/target in its "notes" based on where the client FINISHED (e.g. "start ~5 lb under last top set of 205×5") — do not reset to a generic baseline.
  2. Keep and build on lifts marked [progressing], especially the primary lifts. For [stalled] or [regressed] lifts, change the stimulus (variation, rep range, tempo, or a replacement) and say why in "notes".
  3. Rotate accessories that ran the whole program unchanged to a similar movement; do not drop a movement pattern the client trains well.
  4. If consistency was low (many unreported/missed), make the new block simpler and more repeatable rather than more ambitious; if it was high, progress volume or intensity modestly.
  5. Address the client's own feedback above (pain, weak points, preferences) over inference. Injury/equipment constraints still override everything.
  6. Use bodyweight/recovery trends to set volume; if energy or sleep was low, keep volume conservative.
  7. If an exercise has no history, treat it as new and start conservatively.`);
  return { hasHistory: true, text: lines.join("\n"), stats: { exec, exercisesWithHistory: perf.length, feedback: feedback.length, weeksAgo: Math.round(elapsedDays / 7) } };
}
