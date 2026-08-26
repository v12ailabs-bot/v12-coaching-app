// Collapses a client's logs down to one row per date — the heaviest set that
// day (or, for bodyweight moves, the highest-rep set), not just whichever set
// was logged first. Feeds both the weight-over-time and top-set-reps charts,
// so a heavier second set on the same day always overtakes an earlier
// lighter one instead of being silently dropped.
export function topSetPerDay(logs, isBodyweight) {
  const byDate = new Map();
  (logs || []).forEach((log) => {
    const existing = byDate.get(log.date);
    const value = isBodyweight ? log.reps : log.weight;
    if (value == null) return;
    if (!existing || value > (isBodyweight ? existing.reps : existing.weight)) {
      byDate.set(log.date, { date: log.date, weight: log.weight, reps: log.reps });
    }
  });
  return Array.from(byDate.values());
}
