// Pure helpers for the merged "Roadmap Check-ins Due" card: one row per client
// combining plan checkpoints and the end-of-phase check-in. No new metrics —
// the alerts come from CoachHome's existing roadmap computation.

// `reminders` is { [clientId]: { reviewed_phase } } — a phase check-in the coach
// already marked reviewed stays hidden until that client's phase changes.
export function buildRoadmapCheckins(checkpointAlerts = [], phaseAlerts = [], reminders = {}) {
  const byClient = new Map();
  const ensure = (id) => { if (!byClient.has(id)) byClient.set(id, { clientId: id, checkpoints: [], phase: null }); return byClient.get(id); };
  checkpointAlerts.forEach((a) => ensure(a.clientId).checkpoints.push(a));
  phaseAlerts.forEach((a) => { if (reminders[a.clientId]?.reviewed_phase !== a.phase) ensure(a.clientId).phase = a; });
  const rows = [...byClient.values()].filter((r) => r.checkpoints.length || r.phase);
  rows.forEach((r) => {
    r.checkpoints.sort((a, b) => a.daysUntil - b.daysUntil);
    r.days = Math.min(...r.checkpoints.map((c) => c.daysUntil), r.phase ? r.phase.daysUntilEnd : Infinity);
    r.kind = r.phase && r.checkpoints.length ? "both" : r.phase ? "phase" : "checkpoint";
  });
  return rows.sort((a, b) => a.days - b.days);
}

export const timingText = (d, ended = false) =>
  d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? (ended ? "ends today" : "due today") : ended ? `ends in ${d}d` : `due in ${d}d`;

// One plain line for the next session, built only from the checkpoint/phase
// text and the next phase's planned changes — no AI call.
export function suggestReminder(row, nextChanges = []) {
  const parts = row.checkpoints.map((c) => `Run the ${c.label} check`);
  if (row.phase) {
    const next = row.phase.nextPhase;
    const first = nextChanges[0];
    const what = first ? `${first.action || "change"} ${[first.from, first.to].filter(Boolean).join(" → ")}`.trim() : null;
    parts.push(next ? `Move to ${next}${what ? ` (${what}${nextChanges.length > 1 ? ` +${nextChanges.length - 1} more` : ""})` : ""}` : `Review the end of ${row.phase.phase}`);
  }
  return parts.join("; ");
}
