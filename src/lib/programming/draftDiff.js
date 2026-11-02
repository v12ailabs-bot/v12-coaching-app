// Compare two normalised training plans (e.g. the original AI draft vs the
// coach's current edits) so the coach can see exactly what changed.
// Returns { days: [{ day, status, added[], removed[], changed[] }], changedDays }.
// status: "unchanged" | "modified" | "added" | "removed".

const FIELDS = ["sets", "reps", "rest_seconds", "block_type", "section"];

const keyOf = (e) => String(e.name || "").trim().toLowerCase();

export function diffPrograms(before, after) {
  const bDays = new Map((before?.weekly_split || []).map((d) => [d.day, d]));
  const aDays = new Map((after?.weekly_split || []).map((d) => [d.day, d]));
  const names = [...new Set([...bDays.keys(), ...aDays.keys()])];
  const days = names.map((day) => {
    const b = bDays.get(day), a = aDays.get(day);
    if (!b) return { day, status: "added", added: (a.exercises || []).map((e) => e.name), removed: [], changed: [], reordered: false };
    if (!a) return { day, status: "removed", added: [], removed: (b.exercises || []).map((e) => e.name), changed: [], reordered: false };
    const bm = new Map((b.exercises || []).map((e) => [keyOf(e), e]));
    const am = new Map((a.exercises || []).map((e) => [keyOf(e), e]));
    const added = [], removed = [], changed = [];
    am.forEach((e, k) => { if (!bm.has(k)) added.push(e.name); });
    bm.forEach((e, k) => { if (!am.has(k)) removed.push(e.name); });
    am.forEach((e, k) => {
      const o = bm.get(k);
      if (!o) return;
      const fields = FIELDS.filter((f) => String(o[f] ?? "") !== String(e[f] ?? ""));
      if (fields.length) changed.push({ name: e.name, fields: fields.map((f) => ({ field: f, from: o[f] ?? null, to: e[f] ?? null })) });
    });
    const order = (d) => (d.exercises || []).map(keyOf).filter((k) => am.has(k) && bm.has(k));
    const reordered = order(b).join("|") !== order(a).join("|");
    const modified = added.length || removed.length || changed.length || reordered;
    return { day, status: modified ? "modified" : "unchanged", added, removed, changed, reordered };
  });
  return { days, changedDays: days.filter((d) => d.status !== "unchanged").map((d) => d.day) };
}

// Replace ONE day of a plan (used by targeted AI revisions) without touching
// any other day. Returns a new plan; the input is not mutated.
export function replaceDay(program, dayName, newDay) {
  return {
    ...program,
    weekly_split: (program.weekly_split || []).map((d) => (d.day === dayName ? { ...newDay, day: dayName } : d)),
  };
}
