// Compact per-exercise strength trend, built from raw workout_logs rows —
// shared by the monthly recap (api/summary.js) and the goal insight
// (api/goal-insight.js) so both AI generators can cite real top-set
// weight/rep movement instead of only nutrition/adherence numbers.
//
// `logs` is workout_logs rows with { exercise_id, date, weight, reps } for
// the window being summarized. `exerciseNameById` maps exercise_id -> name
// (and optionally is_bodyweight) so the trend reads with a real exercise
// name instead of a raw id. Only exercises with at least two distinct
// logged dates get a trend — a single session has no direction to report.
export function strengthTrendsFrom(logs, exerciseById) {
  const byExercise = {};
  (logs || []).forEach((l) => {
    if (!l.exercise_id) return;
    (byExercise[l.exercise_id] = byExercise[l.exercise_id] || []).push(l);
  });

  const trends = [];
  for (const [exerciseId, rows] of Object.entries(byExercise)) {
    const ex = exerciseById?.[exerciseId];
    const name = ex?.name || "Unknown exercise";
    const isBodyweight = !!ex?.is_bodyweight;
    // One "top set" per date: heaviest weight (or, for bodyweight moves,
    // most reps) logged that day — mirrors how the client-facing chart
    // picks a single point per session.
    const byDate = {};
    rows.forEach((r) => {
      const cur = byDate[r.date];
      const val = isBodyweight ? r.reps : r.weight;
      if (val == null) return;
      const curVal = cur ? (isBodyweight ? cur.reps : cur.weight) : null;
      if (cur == null || curVal == null || val > curVal) byDate[r.date] = r;
    });
    const sessions = Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (sessions.length < 2) continue;
    const first = sessions[0], latest = sessions[sessions.length - 1];
    const key = isBodyweight ? "reps" : "weight";
    if (first[key] == null || latest[key] == null) continue;
    trends.push({
      exercise: name,
      metric: isBodyweight ? "reps" : "weight_lb",
      first_date: first.date, first_value: first[key],
      latest_date: latest.date, latest_value: latest[key],
      delta: Math.round((latest[key] - first[key]) * 10) / 10,
      sessions: sessions.length,
    });
  }
  // Biggest movers first (positive or negative) — the AI has a token budget,
  // not every exercise needs to be cited.
  return trends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
}
