// Each error has `blocking`: true (default) = the data is invalid and can't be
// saved (reversed/half/non-integer weeks); false = a real conflict (overlap,
// duplicate name) the coach may still choose to save, since existing programs
// may already contain them and must stay editable.
// Pure validation for a coach's roadmap draft (program_phases rows as the
// editor holds them: week_start/week_end are "" or numeric strings). Errors
// block saving; warnings are shown but don't. Never mutates or "fixes" the
// rows — a conflict is reported and the coach decides, per the rule that
// dates are never silently moved.
export function validateRoadmap(rows, { programWeeks = null } = {}) {
  const errors = [];
  const warnings = [];
  const named = rows.map((r, index) => ({ r, index })).filter(({ r }) => (r.phase || "").trim());
  const num = (v) => (v === "" || v == null ? null : Number(v));

  const seen = new Map();
  named.forEach(({ r, index }) => {
    const label = r.phase.trim();
    const key = label.toLowerCase();
    if (seen.has(key)) errors.push({ index, blocking: false, message: `"${label}" is used for more than one phase.` });
    seen.set(key, index);

    const s = num(r.week_start), e = num(r.week_end);
    if ((s == null) !== (e == null)) errors.push({ index, message: `"${label}" needs both a start and end week (or neither).` });
    else if (s != null) {
      if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < 1) errors.push({ index, message: `"${label}" weeks must be whole numbers from 1.` });
      else if (e < s) errors.push({ index, message: `"${label}" ends (week ${e}) before it starts (week ${s}).` });
      else if (programWeeks && e > programWeeks) warnings.push({ index, message: `"${label}" runs to week ${e}, past the program's ${programWeeks} weeks.` });
    }
    if (s == null) warnings.push({ index, message: `"${label}" has no dates yet.` });
  });

  const dated = named
    .map(({ r, index }) => ({ label: r.phase.trim(), index, s: num(r.week_start), e: num(r.week_end) }))
    .filter((p) => p.s != null && p.e != null && p.e >= p.s);

  for (let a = 0; a < dated.length; a++) {
    for (let b = a + 1; b < dated.length; b++) {
      const A = dated[a], B = dated[b];
      if (A.s <= B.e && B.s <= A.e) errors.push({ index: B.index, blocking: false, message: `"${A.label}" (weeks ${A.s}–${A.e}) overlaps "${B.label}" (weeks ${B.s}–${B.e}).` });
    }
  }
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1], cur = dated[i];
    if (cur.s < prev.s) warnings.push({ index: cur.index, message: `"${cur.label}" starts before "${prev.label}" but is listed after it.` });
    else if (cur.s > prev.e + 1) warnings.push({ index: cur.index, message: `Gap between "${prev.label}" (ends week ${prev.e}) and "${cur.label}" (starts week ${cur.s}).` });
  }
  return { errors, warnings };
}

// Suggests (never applies) the next phase's weeks: starts the week after the
// last dated phase and runs `duration` weeks.
export function suggestNextWeeks(rows, duration = 4) {
  const ends = rows.map((r) => (r.week_end === "" || r.week_end == null ? null : Number(r.week_end))).filter((n) => Number.isFinite(n));
  const start = ends.length ? Math.max(...ends) + 1 : 1;
  return { week_start: start, week_end: start + duration - 1 };
}
