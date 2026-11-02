import { PHASE_ORDER } from "../constants.js";
import { normalizeSection } from "./validateProgram.js";

// Pure, immutable edit operations on a draft plan (the coach's editor state).
// Each returns a NEW plan; the input is never mutated. Exercise order within a
// day follows workout phase first (warm-up → … → cooldown), then position, the
// same rule the client's workout screen uses — so "move" only swaps with a
// neighbour in the same phase, and everything else is re-sorted by phase.

const rank = (section) => { const s = normalizeSection(section); const i = PHASE_ORDER.indexOf(s); return i === -1 ? PHASE_ORDER.indexOf("Accessories") : i; };

function settle(exercises) {
  const sorted = exercises.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e.section) - rank(b.e.section) || a.i - b.i).map((x) => x.e);
  return sorted.map((e, i) => ({ ...e, order_index: i, group_id: e.block_type && e.block_type !== "straight_set" ? e.group_id : String(i) }));
}

const mapDay = (plan, day, fn) => ({ ...plan, weekly_split: plan.weekly_split.map((d) => (d.day === day ? { ...d, exercises: settle(fn(d.exercises)) } : d)) });

export function updateExercise(plan, day, index, patch) {
  return mapDay(plan, day, (ex) => ex.map((e, i) => (i === index ? { ...e, ...patch } : e)));
}

export function removeExercise(plan, day, index) {
  return mapDay(plan, day, (ex) => ex.filter((_, i) => i !== index));
}

export function addExercise(plan, day, exercise = {}) {
  const blank = { name: "", sets: 3, reps: "10", rest_seconds: 75, section: "Accessories", exercise_type: "Accessory", block_type: "straight_set", group_id: null, is_bodyweight: false, notes: null, category: null };
  return mapDay(plan, day, (ex) => [...ex, { ...blank, ...exercise }]);
}

// Swap with the neighbour above/below (dir = -1 | +1) when both are in the same
// workout phase. Returns the plan unchanged if the move isn't allowed.
export function moveExercise(plan, day, index, dir) {
  const d = plan.weekly_split.find((x) => x.day === day);
  const j = index + dir;
  if (!d || j < 0 || j >= d.exercises.length) return plan;
  if (rank(d.exercises[index].section) !== rank(d.exercises[j].section)) return plan;
  return mapDay(plan, day, (ex) => { const n = ex.slice(); [n[index], n[j]] = [n[j], n[index]]; return n; });
}

export function canMove(plan, day, index, dir) {
  const d = plan.weekly_split.find((x) => x.day === day);
  const j = index + dir;
  return !!d && j >= 0 && j < d.exercises.length && rank(d.exercises[index].section) === rank(d.exercises[j].section);
}

export function replaceDayExercises(plan, day, exercises) {
  return mapDay(plan, day, () => exercises);
}
