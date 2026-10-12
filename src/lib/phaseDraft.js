// Deterministic phase-draft builder (no AI): start from the program's current
// exercises and apply a phase's planned changes. Pure; never mutates inputs.
// Exercises are only changed when the plan says so — continuity is the default
// (same lifts, same slots), so progress stays comparable across phases.
//
// Matching of `from` names is case-insensitive/trimmed, the same convention
// used for locked exercises and exercise upgrades elsewhere in the app.

const KEEP = ["name", "category", "day_of_week", "sets", "reps", "is_bodyweight", "notes", "order_index", "section", "exercise_type", "block_type", "group_id", "progression_method", "progression_config"];
const norm = (s) => String(s || "").trim().toLowerCase();

export function buildPhaseDraft(currentExercises, plannedChanges) {
  const list = (currentExercises || []).map((e) => {
    const copy = {};
    KEEP.forEach((k) => { if (e[k] !== undefined) copy[k] = e[k]; });
    return { ...copy, source_exercise_id: e.id || null };
  });
  const unapplied = [];

  const findIdx = (name) => list.findIndex((e) => norm(e.name) === norm(name));
  (plannedChanges || []).forEach((c) => {
    const label = `${c.action}: ${c.from && c.to ? `${c.from} → ${c.to}` : c.to || c.from}`;
    const change = { action: c.action, from: c.from || null, to: c.to || null, reason: c.reason || null };
    if (c.action === "replace") {
      const i = findIdx(c.from);
      if (i === -1) return unapplied.push({ change, reason: `"${c.from}" is not in the current program, so it can't be replaced.` });
      if (!c.to) return unapplied.push({ change, reason: "No replacement exercise was named." });
      // The new lift inherits the slot (day, sets, reps, category) but NOT the
      // old lift's progression assignment — that belongs to the old exercise.
      list[i] = { ...list[i], name: c.to, progression_method: null, progression_config: {}, change, needs_review: true };
    } else if (c.action === "remove") {
      const i = findIdx(c.from);
      if (i === -1) return unapplied.push({ change, reason: `"${c.from}" is not in the current program, so it can't be removed.` });
      list.splice(i, 1);
    } else if (c.action === "add") {
      if (!c.to) return unapplied.push({ change, reason: "No exercise was named to add." });
      const counts = {};
      list.forEach((e) => { if (e.day_of_week) counts[e.day_of_week] = (counts[e.day_of_week] || 0) + 1; });
      const days = Object.keys(counts);
      if (!days.length) return unapplied.push({ change, reason: "The program has no training days to add this to." });
      const day = days.sort((a, b) => counts[a] - counts[b])[0]; // the lightest day
      list.push({ name: c.to, day_of_week: day, sets: 3, reps: "8-12", category: null, is_bodyweight: false, order_index: counts[day], block_type: "straight_set", progression_method: null, progression_config: {}, source_exercise_id: null, change, needs_review: true });
    } else if (c.action === "progress") {
      const i = findIdx(c.from || c.to);
      if (i === -1) return unapplied.push({ change, reason: `"${c.from || c.to}" is not in the current program.` });
      list[i] = { ...list[i], change }; // same exercise; the coach adjusts load/reps via its progression settings
    } else {
      unapplied.push({ change, reason: `Unknown change type "${label}".` });
    }
  });
  return { exercises: list, unapplied };
}
