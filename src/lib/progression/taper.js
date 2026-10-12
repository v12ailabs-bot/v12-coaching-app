// Performance taper — an event-driven programming method (NOT linear progression
// and NOT an ordinary deload). Deterministic, no AI. Volume, intensity,
// frequency and exercise selection are separate variables: this engine
// calculates VOLUME only; intensity and exercise selection are passed through
// exactly as the coach configured them, and frequency comes from the coach's
// session weekdays.
//
// DEFAULTS ARE TEMPLATE SUGGESTIONS, not rules: a 7-14 day window and a 30-60%
// volume reduction are common starting points for a strength-focused event, but
// they are not claimed to be optimal for every sport, athlete or event. Values
// outside them are only a warning; the hard validation is about
// impossible/unsafe numbers (negative volume, 100%+ reduction, dates that don't fit).
export const TAPER_TEMPLATE = {
  suggestedDurationDays: [7, 14],
  suggestedReductionPct: [30, 60],
  distribution: "flat",           // flat | linear_decrease
  lastSessionDaysBeforeEvent: 0,  // coach decides whether to rest the day(s) before; 0 = no assumption
  maxSessionVolumePctOfBaseline: 100, // a taper session never exceeds the baseline per-session volume
  minReferenceTrainingDays: 2,    // fewer than this isn't a baseline
  note: "Strength-focused template. Defaults only; the coach sets every value.",
};
export const VOLUME_UNITS = ["sets", "reps", "volume_load"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY = 86400000;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const parseDay = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null; const [y, m, d] = s.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCMonth() === m - 1 ? dt : null; };
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);

// Normalizes the date inputs: event + duration derive the start; event + start
// derive the duration; all three must agree. Taper window = [start, event - 1].
function resolveWindow(config, errors) {
  const event = parseDay(config.eventDate);
  if (!event) { errors.push("eventDate must be a real date (YYYY-MM-DD)."); return null; }
  let start = config.startDate != null ? parseDay(config.startDate) : null;
  if (config.startDate != null && !start) { errors.push("startDate must be a real date (YYYY-MM-DD)."); return null; }
  let dur = config.durationDays;
  if (dur != null && (!Number.isInteger(dur) || dur < 1 || dur > 60)) { errors.push("durationDays must be a whole number from 1 to 60."); return null; }
  if (start && dur != null && fmt(addDays(start, dur)) !== fmt(event)) { errors.push(`startDate + durationDays (${fmt(addDays(start, dur))}) doesn't land on the event date ${fmt(event)}; the taper runs up to the day before the event.`); return null; }
  if (!start && dur == null) { errors.push("Give durationDays or a startDate (the taper window must be defined)."); return null; }
  if (!start) start = addDays(event, -dur);
  if (dur == null) dur = Math.round((event - start) / DAY);
  if (start >= event) { errors.push("The taper must start before the event date."); return null; }
  if (dur < 1 || dur > 60) { errors.push("The taper window must be between 1 and 60 days."); return null; }
  return { start, event, durationDays: dur };
}

export function validateTaperConfig(config = {}) {
  const errors = [], warnings = [];
  const win = resolveWindow(config, errors);
  if (!VOLUME_UNITS.includes(config.volumeUnit)) errors.push(`volumeUnit must be one of ${VOLUME_UNITS.join(", ")} (the unit baseline and target volume are measured in).`);
  if (!isNum(config.reductionPct) || config.reductionPct < 0 || config.reductionPct >= 100) errors.push("reductionPct must be a number from 0 up to (but not including) 100.");
  const ref = config.referencePeriod;
  const rs = ref ? parseDay(ref.start) : null, re = ref ? parseDay(ref.end) : null;
  if (!rs || !re) errors.push("referencePeriod {start, end} is required: the coach-selected period the baseline volume is measured over.");
  else {
    if (re < rs) errors.push("referencePeriod ends before it starts.");
    else if ((re - rs) / DAY + 1 < 7) errors.push("referencePeriod must cover at least 7 days so a weekly baseline can be measured.");
    if (win && re >= win.start) errors.push("referencePeriod must end before the taper starts.");
  }
  const wd = config.sessionWeekdays;
  if (!Array.isArray(wd) || wd.length === 0 || wd.some((d) => !WEEKDAYS.includes(d)) || new Set(wd).size !== wd.length) errors.push(`sessionWeekdays must list the taper training days using ${WEEKDAYS.join("/")} (no duplicates).`);
  const dist = config.distribution ?? TAPER_TEMPLATE.distribution;
  if (!["flat", "linear_decrease"].includes(dist)) errors.push("distribution must be flat or linear_decrease.");
  const rt = config.roundTo ?? 1;
  if (!isNum(rt) || rt <= 0) errors.push("roundTo must be a positive number.");
  const cap = config.maxSessionVolumePct ?? TAPER_TEMPLATE.maxSessionVolumePctOfBaseline;
  if (!isNum(cap) || cap <= 0 || cap > 100) errors.push("maxSessionVolumePct must be above 0 and at most 100.");
  const last = config.lastSessionDaysBeforeEvent ?? TAPER_TEMPLATE.lastSessionDaysBeforeEvent;
  if (!Number.isInteger(last) || last < 0) errors.push("lastSessionDaysBeforeEvent must be a whole number of days, 0 or more.");
  (config.exercises || []).forEach((e, i) => {
    if (!e.name || typeof e.name !== "string") errors.push(`exercises[${i}] needs a name.`);
    if (e.role && !["event_specific", "general"].includes(e.role)) errors.push(`exercises[${i}].role must be event_specific or general.`);
    if (e.reductionPct != null && (!isNum(e.reductionPct) || e.reductionPct < 0 || e.reductionPct >= 100)) errors.push(`exercises[${i}].reductionPct must be from 0 up to 100.`);
  });
  for (const role of Object.keys(config.reductionPctByRole || {})) {
    const v = config.reductionPctByRole[role];
    if (!["event_specific", "general"].includes(role) || !isNum(v) || v < 0 || v >= 100) errors.push("reductionPctByRole must map event_specific/general to a number from 0 up to 100.");
  }
  const inten = config.intensity || {};
  Object.entries({ ...(inten.default ? { default: inten.default } : {}), ...(inten.byExercise || {}) }).forEach(([k, r]) => {
    if (!["pct1rm", "load_lb", "rpe"].includes(r?.type) || !isNum(r?.min) || !isNum(r?.max) || r.min > r.max || r.min < 0) errors.push(`intensity for "${k}" needs a type (pct1rm/load_lb/rpe) and a valid min <= max.`);
    else if (r.type === "pct1rm" && r.max > 100) errors.push(`intensity for "${k}": pct1rm can't exceed 100.`);
    else if (r.type === "rpe" && (r.min < 1 || r.max > 10)) errors.push(`intensity for "${k}": rpe must be between 1 and 10.`);
  });
  if (win) {
    const [dlo, dhi] = TAPER_TEMPLATE.suggestedDurationDays;
    if (win.durationDays < dlo || win.durationDays > dhi) warnings.push(`A ${win.durationDays}-day taper is outside the ${dlo}-${dhi} day template suggestion (allowed; you set this).`);
  }
  if (isNum(config.reductionPct) && config.reductionPct >= 0 && config.reductionPct < 100) {
    const [rlo, rhi] = TAPER_TEMPLATE.suggestedReductionPct;
    if (config.reductionPct < rlo || config.reductionPct > rhi) warnings.push(`A ${config.reductionPct}% reduction is outside the ${rlo}-${rhi}% template suggestion (allowed; you set this).`);
  }
  return { ok: errors.length === 0, errors, warnings, window: win, referencePeriod: rs && re ? { start: rs, end: re } : null };
}

// Baseline from workout_logs-shaped rows { date, exercise, sets, reps, weight, set_type }.
// Working sets only. Volume units: sets (1 per row), reps, volume_load (reps x load; a row
// with no load is left out and reported — never counted as zero load).
export function baselineVolume({ logs = [], referencePeriod, volumeUnit, exercises }) {
  const from = fmt(referencePeriod.start), to = fmt(referencePeriod.end);
  const wanted = exercises && exercises.length ? new Set(exercises.map((e) => e.name.trim().toLowerCase())) : null;
  const rows = logs.filter((r) => r.date >= from && r.date <= to && (r.set_type || "working") === "working" && (!wanted || wanted.has(String(r.exercise || "").trim().toLowerCase())));
  const excluded = [];
  const byEx = {};
  const days = new Set();
  rows.forEach((r) => {
    const name = String(r.exercise || "").trim();
    const reps = Number(r.reps), load = r.weight == null || r.weight === "" ? null : Number(r.weight);
    let v;
    if (volumeUnit === "sets") v = 1;
    else if (!Number.isFinite(reps) || reps < 0) { excluded.push(`${name || "?"} ${r.date}: reps missing`); return; }
    else if (volumeUnit === "reps") v = reps;
    else if (load === null || !Number.isFinite(load) || load < 0) { excluded.push(`${name || "?"} ${r.date}: no load, can't count volume load`); return; }
    else v = reps * load;
    byEx[name] = (byEx[name] || 0) + v;
    days.add(r.date);
  });
  const periodDays = Math.round((referencePeriod.end - referencePeriod.start) / DAY) + 1;
  const weeks = periodDays / 7;
  const total = Object.values(byEx).reduce((a, b) => a + b, 0);
  return {
    unit: volumeUnit, periodDays, weeks, total, trainingDays: days.size,
    weekly: total / weeks, sessionsPerWeek: days.size / weeks,
    perSession: days.size ? total / days.size : 0,
    byExercise: Object.fromEntries(Object.entries(byEx).map(([k, v]) => [k, { total: v, weekly: v / weeks, perSession: days.size ? v / days.size : 0 }])),
    excluded,
  };
}

// Largest-remainder allocation of `total` into `weights.length` parts that are
// multiples of `unit`, each part <= cap. Parts sum to total unless the caps
// bind (the unplaced remainder is reported, never silently pushed over a cap).
export function allocate(total, weights, unit, cap = Infinity) {
  const units = Math.round(total / unit);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const capUnits = Number.isFinite(cap) ? Math.floor(cap / unit + 1e-9) : Infinity;
  const raw = weights.map((w) => (units * w) / wsum);
  const parts = raw.map((r) => Math.min(Math.floor(r + 1e-9), capUnits));
  let left = units - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r + 1e-9) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let pass = 0; pass < 2 && left > 0; pass++) {
    for (const { i } of order) { if (left <= 0) break; if (parts[i] < capUnits) { parts[i]++; left--; } }
  }
  return { parts: parts.map((p) => p * unit), unplaced: left * unit };
}

// config + logs -> the calculated taper (or a validation error). Never invents a baseline.
export function planTaper({ config = {}, logs = [] }) {
  const v = validateTaperConfig(config);
  if (!v.ok) return { status: "invalid", errors: v.errors, warnings: v.warnings, reasons: v.errors };
  const win = v.window, rp = v.referencePeriod;
  const base = baselineVolume({ logs, referencePeriod: rp, volumeUnit: config.volumeUnit, exercises: config.exercises });
  if (base.trainingDays < TAPER_TEMPLATE.minReferenceTrainingDays || base.total <= 0) {
    return { status: "insufficient_data", errors: [], warnings: v.warnings, reasons: [`The reference period (${fmt(rp.start)} to ${fmt(rp.end)}) has ${base.trainingDays} training day${base.trainingDays === 1 ? "" : "s"} and ${base.total} ${config.volumeUnit}; at least ${TAPER_TEMPLATE.minReferenceTrainingDays} training days with logged volume are needed. Choose a different reference period or enter the baseline — nothing is assumed.`], baseline: base };
  }
  const last = config.lastSessionDaysBeforeEvent ?? TAPER_TEMPLATE.lastSessionDaysBeforeEvent;
  const lastAllowed = addDays(win.event, -1 - last); // window ends the day before the event
  const dates = [];
  for (let d = win.start; d <= lastAllowed; d = addDays(d, 1)) if (config.sessionWeekdays.includes(WEEKDAYS[d.getUTCDay()])) dates.push(d);
  if (!dates.length) return { status: "invalid", errors: ["No taper sessions fit: none of sessionWeekdays fall inside the taper window."], warnings: v.warnings, reasons: ["No taper sessions fit the window."] };

  const dist = config.distribution ?? TAPER_TEMPLATE.distribution;
  const weights = dates.map((_, i) => (dist === "linear_decrease" ? dates.length - i : 1));
  const roundTo = config.roundTo ?? 1;
  const capPct = (config.maxSessionVolumePct ?? TAPER_TEMPLATE.maxSessionVolumePctOfBaseline) / 100;
  const windowWeeks = win.durationDays / 7;

  const names = Object.keys(base.byExercise);
  const roleOf = (n) => (config.exercises || []).find((e) => e.name.trim().toLowerCase() === n.toLowerCase())?.role || "general";
  const redOf = (n) => {
    const own = (config.exercises || []).find((e) => e.name.trim().toLowerCase() === n.toLowerCase())?.reductionPct;
    return own ?? config.reductionPctByRole?.[roleOf(n)] ?? config.reductionPct;
  };
  const sessions = dates.map((d) => ({ date: fmt(d), weekday: WEEKDAYS[d.getUTCDay()], volumeByExercise: {}, total: 0 }));
  // 1) Each exercise's target for the whole window (its own reduction by role, if set).
  const exercises = {};
  names.forEach((n) => {
    const b = base.byExercise[n];
    const reduction = redOf(n);
    exercises[n] = { role: roleOf(n), reductionPct: reduction, baselineWeekly: b.weekly, baselineWindowVolume: b.weekly * windowWeeks, targetVolume: b.weekly * windowWeeks * (1 - reduction / 100), plannedVolume: 0 };
  });
  const targetTotal = names.reduce((a, n) => a + exercises[n].targetVolume, 0);
  // 2) Session totals: spread the target over the sessions, no session above the cap
  //    (a share of the baseline volume per training day).
  const { parts: sessionTotals, unplaced } = allocate(targetTotal, weights, roundTo, base.perSession * capPct);
  // 3) Inside each session, split by each exercise's share of the target — the mix of
  //    exercises is preserved (selection isn't changed), only volume moves.
  const shares = names.map((n) => exercises[n].targetVolume);
  sessionTotals.forEach((tot, i) => {
    if (tot <= 0 || shares.every((x) => x <= 0)) return;
    const { parts } = allocate(tot, shares.map((x) => Math.max(x, 0)), roundTo);
    names.forEach((n, k) => { sessions[i].volumeByExercise[n] = parts[k]; sessions[i].total += parts[k]; exercises[n].plannedVolume += parts[k]; });
  });
  const baselineWindow = base.weekly * windowWeeks;
  const planned = sessions.reduce((a, s) => a + s.total, 0);
  const warnings = [...v.warnings];
  if (base.excluded.length) warnings.push(`${base.excluded.length} logged row(s) were left out of the baseline (${base.excluded.slice(0, 3).join("; ")}${base.excluded.length > 3 ? "; …" : ""}).`);
  if (unplaced > 0) warnings.push(`${unplaced} ${config.volumeUnit} of the target could not be placed without exceeding the per-session limit (${config.maxSessionVolumePct ?? 100}% of baseline per-session volume), so the planned total is below the target.`);
  const taperPerWeek = dates.length / windowWeeks;
  return {
    status: "prescription",
    window: { start: fmt(win.start), end: fmt(addDays(win.event, -1)), eventDate: fmt(win.event), durationDays: win.durationDays },
    unit: config.volumeUnit,
    baseline: { referencePeriod: { start: fmt(rp.start), end: fmt(rp.end) }, weeklyVolume: base.weekly, trainingDays: base.trainingDays, sessionsPerWeek: base.sessionsPerWeek, perSession: base.perSession, total: base.total },
    reductionPct: config.reductionPct,
    baselineWindowVolume: baselineWindow,
    targetVolume: baselineWindow * (1 - config.reductionPct / 100),
    plannedVolume: planned,
    frequency: { baselinePerWeek: base.sessionsPerWeek, taperPerWeek, sessions: dates.length },
    sessions,
    exercises,
    // Passed through unchanged: the engine does not change intensity or exercise selection.
    intensity: config.intensity || null,
    distribution: dist,
    warnings,
    reasons: [
      `Baseline: ${base.total} ${config.volumeUnit} over ${base.periodDays} days (${base.weekly.toFixed(1)}/week, ${base.trainingDays} training days).`,
      `Target: ${config.reductionPct}% less than the ${baselineWindow.toFixed(1)} ${config.volumeUnit} that baseline would give over the ${win.durationDays}-day window = ${(baselineWindow * (1 - config.reductionPct / 100)).toFixed(1)}.`,
      `Spread over ${dates.length} session${dates.length === 1 ? "" : "s"} (${dist.replace("_", " ")}), rounded to ${roundTo}; planned total ${planned}.`,
      "Intensity and exercise selection are exactly as configured; the taper ends the day before the event and is not restarted or extended automatically.",
    ],
  };
}

// Where "today" sits relative to the event. Never restarts or extends.
export function taperPhase(plan, today) {
  const d = parseDay(typeof today === "string" ? today : fmt(today));
  if (!plan?.window || !d) return null;
  const s = parseDay(plan.window.start), e = parseDay(plan.window.eventDate);
  if (d < s) return "before";
  if (d < e) return "active";
  if (d.getTime() === e.getTime()) return "event_day";
  return "ended";
}

// Coach-review flags from data that ACTUALLY exists. Nothing is invented: a rule
// that isn't configured, or data that isn't there, produces no flag (and is listed
// as unavailable). It never changes intensity.
// input: { config, readinessRows: [{date, energy|sleep|mood}], painReports: [{date, note}],
//          performance: { baseline, current } }
export function evaluateTaperWatch({ config = {}, window: win, readinessRows = [], painReports = [], performance = null }) {
  const flags = [], unavailable = [];
  const inWin = (d) => win && d >= win.start && d <= win.end;
  const rd = config.readiness;
  if (rd) {
    if (!["energy", "sleep", "mood"].includes(rd.field) || !isNum(rd.min)) flags.push({ type: "config", reason: "readiness needs a field and a numeric min." });
    else {
      const rows = readinessRows.filter((r) => inWin(r.date) && isNum(Number(r[rd.field]))).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!rows.length) unavailable.push(`No ${rd.field} readings in the taper window.`);
      else {
        const need = rd.consecutiveDays ?? 1;
        let run = 0, hit = false;
        rows.forEach((r) => { run = Number(r[rd.field]) < rd.min ? run + 1 : 0; if (run >= need) hit = true; });
        if (hit) flags.push({ type: "readiness", reason: `${rd.field} was below ${rd.min} for ${need} reading${need === 1 ? "" : "s"} in a row.` });
      }
    }
  } else unavailable.push("No readiness rule configured.");
  const pain = painReports.filter((p) => inWin(p.date));
  if (pain.length) flags.push({ type: "pain", reason: `Pain reported on ${pain.map((p) => p.date).join(", ")}.` });
  if (isNum(config.performanceDropPct)) {
    if (performance && isNum(performance.baseline) && isNum(performance.current) && performance.baseline > 0) {
      const drop = ((performance.baseline - performance.current) / performance.baseline) * 100;
      if (drop > config.performanceDropPct) flags.push({ type: "performance", reason: `Performance is ${drop.toFixed(1)}% below baseline (limit ${config.performanceDropPct}%).` });
    } else unavailable.push("No baseline/current performance values to check.");
  }
  return { flags, unavailable, coachReview: flags.length > 0 };
}

// Coach override of the in-force plan. The ORIGINAL config and calculated plan are never
// touched; the override and who/why are appended to an audit log. Overrides may exceed the
// programmed limit (the coach has authority) but that is recorded.
export function applyTaperOverride({ plan, calculated, log = [], override, by, at = new Date().toISOString() }) {
  const errors = [];
  if (!override || !override.note || !String(override.note).trim()) errors.push("An override needs a note explaining why.");
  const target = (plan.sessions || []).find((s) => s.date === override?.date);
  if (!target) errors.push(`No taper session on ${override?.date}.`);
  const patch = override?.volumeByExercise || {};
  Object.entries(patch).forEach(([n, v]) => {
    if (!isNum(v) || v < 0) errors.push(`${n}: volume must be zero or more.`);
    if (target && !(n in target.volumeByExercise)) errors.push(`${n} isn't part of this taper.`);
  });
  if (!Object.keys(patch).length) errors.push("No volume changes were given.");
  if (errors.length) return { ok: false, errors };
  const before = JSON.parse(JSON.stringify(target));
  const next = { ...plan, sessions: plan.sessions.map((s) => {
    if (s.date !== target.date) return s;
    const vbe = { ...s.volumeByExercise, ...patch };
    return { ...s, volumeByExercise: vbe, total: Object.values(vbe).reduce((a, b) => a + b, 0), overridden: true };
  }) };
  next.plannedVolume = next.sessions.reduce((a, s) => a + s.total, 0);
  const after = next.sessions.find((s) => s.date === target.date);
  const entry = { at, by: by || null, date: target.date, note: String(override.note).trim(), before: { volumeByExercise: before.volumeByExercise, total: before.total }, after: { volumeByExercise: after.volumeByExercise, total: after.total } };
  return { ok: true, plan: next, calculated, log: [...log, entry], entry };
}
