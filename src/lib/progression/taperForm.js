// Turns the taper form's text fields into the config planTaper() validates.
// Blank optional fields are left OUT (so the engine's own defaults/validation
// apply) — nothing is silently filled in here. Pure, so it's tested.
const num = (v) => (v === "" || v == null ? undefined : Number(v));
const int = (v) => (v === "" || v == null ? undefined : parseInt(v, 10));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const DAY = 86400000;
const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (d) => d.toISOString().slice(0, 10);

// Suggested reference period: the two weeks before the taper starts. Only a
// starting suggestion in the form — the coach picks the real one.
export function defaultReferencePeriod(eventDate, durationDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate || "") || !Number.isInteger(durationDays) || durationDays < 1) return null;
  const end = new Date(parse(eventDate).getTime() - (durationDays + 1) * DAY);
  return { start: fmt(new Date(end.getTime() - 13 * DAY)), end: fmt(end) };
}

export function buildTaperConfig(f) {
  const cfg = clean({
    eventDate: f.eventDate || undefined,
    durationDays: int(f.durationDays),
    reductionPct: num(f.reductionPct),
    volumeUnit: f.volumeUnit || undefined,
    referencePeriod: f.refStart || f.refEnd ? { start: f.refStart, end: f.refEnd } : undefined,
    sessionWeekdays: f.sessionWeekdays || [],
    distribution: f.distribution || undefined,
    roundTo: num(f.roundTo),
    maxSessionVolumePct: num(f.maxSessionVolumePct),
    lastSessionDaysBeforeEvent: int(f.lastSessionDaysBeforeEvent),
    performanceDropPct: num(f.performanceDropPct),
  });
  const ex = (f.exercises || []).filter((e) => e.role).map((e) => ({ name: e.name, role: e.role }));
  if (ex.length) cfg.exercises = ex;
  const byRole = clean({ event_specific: num(f.eventSpecificReductionPct), general: num(f.generalReductionPct) });
  if (Object.keys(byRole).length) cfg.reductionPctByRole = byRole;
  if (f.intensityType && f.intensityMin !== "" && f.intensityMax !== "") cfg.intensity = { default: { type: f.intensityType, min: num(f.intensityMin), max: num(f.intensityMax) } };
  if (f.readinessField) cfg.readiness = clean({ field: f.readinessField, min: num(f.readinessMin), consecutiveDays: int(f.readinessDays) });
  return cfg;
}
