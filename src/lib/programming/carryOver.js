import { addExercise } from "./draftEdit.js";
import { exerciseKey } from "../strengthRecords.js";

// When a new program is approved, the client's previous exercises are retired (their
// history stays on record). The ONLY ones worth carrying into the new program are lifts an
// ACTIVE milestone is still tracking (e.g. "squat +100 lb") that the new draft doesn't
// already include. Those are added INTO the draft — on the best-fitting day, in the right
// workout-phase order — rather than left in whatever slot the old program had them.
// Pure (no I/O).

const TRACKED = new Set(["strength", "rep_performance", "exercise_progression"]);
const norm = (v) => String(v || "").trim().toLowerCase();

export function planKeys(plan) {
  return new Set((plan?.weekly_split || []).flatMap((d) => (d.exercises || []).map((e) => exerciseKey(e.name))));
}

// The draft day that best fits an exercise: shares the most movement category/section with it,
// with a nudge for the day it was on before, then the lightest day.
export function suggestDay(plan, ex) {
  const days = plan?.weekly_split || [];
  if (!days.length) return null;
  const score = (d) => {
    const list = d.exercises || [];
    return list.filter((e) => norm(e.category) && norm(e.category) === norm(ex.category)).length * 2
      + list.filter((e) => norm(e.section) && norm(e.section) === norm(ex.section)).length
      + (d.day === ex.day_of_week ? 1 : 0);
  };
  return days.slice().sort((a, b) => score(b) - score(a) || (a.exercises || []).length - (b.exercises || []).length)[0].day;
}

// current: the client's active (non-retired) AI exercises. milestones: their goals rows.
// Returns the lifts to offer for carry-over, each with the milestone that justifies it.
export function planCarryOver({ current = [], milestones = [], plan }) {
  const inPlan = planKeys(plan);
  const byKey = new Map();
  current.forEach((e) => { if (!byKey.has(exerciseKey(e.name))) byKey.set(exerciseKey(e.name), e); });
  const out = [], seen = new Set();
  milestones.forEach((m) => {
    if (m.status && m.status !== "active") return;
    if (m.achieved_at || !TRACKED.has(m.category) || !m.exercise_name) return;
    const key = exerciseKey(m.exercise_name);
    if (inPlan.has(key) || seen.has(key)) return;   // the new program already trains it
    const ex = byKey.get(key);
    if (!ex) return;                                 // nothing to carry (never programmed)
    seen.add(key);
    out.push({ exercise: ex, milestone: m, day: suggestDay(plan, ex) });
  });
  return out;
}

export const milestoneLabel = (m) => `${m.exercise_name}${m.baseline_value != null && m.target_value != null ? `: ${m.baseline_value} → ${m.target_value} ${m.unit || ""}`.trimEnd() : ""}`;

// Adds each chosen lift to its chosen day (draftEdit re-sorts the day by workout phase).
export function applyCarryOver(plan, chosen) {
  return chosen.reduce((p, c) => addExercise(p, c.day, {
    name: c.exercise.name, sets: c.exercise.sets ?? 3, reps: c.exercise.reps || "5", rest_seconds: c.exercise.rest_seconds ?? 120,
    section: c.exercise.section || "Main Compound Lift", exercise_type: c.exercise.exercise_type || "Compound",
    category: c.exercise.category || null, is_bodyweight: !!c.exercise.is_bodyweight, notes: c.exercise.notes || null,
  }), plan);
}
