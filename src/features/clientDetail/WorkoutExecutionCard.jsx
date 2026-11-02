import { Card, CardTitle } from "../../components/ui/index.js";
import { S, RADIUS } from "../../theme.jsx";

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: color || S.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: S.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Execution (what the client actually did with assigned workouts) and reporting
// (how much they've told us) are shown side by side but never blended into one
// score: a quiet client isn't a failing client, and a chatty one isn't a
// training one.
export function WorkoutExecutionCard({ exec, reporting, days = 30 }) {
  if (!exec) return null;
  const confirmed = exec.completed + exec.partial;
  return (
    <Card style={{ marginBottom: 14 }}>
      <CardTitle>Workout execution — last {days} days</CardTitle>
      {exec.assigned === 0 ? (
        <div style={{ fontSize: 13, color: S.muted }}>No workouts were assigned in this window{exec.restDays ? ` (${exec.restDays} rest days)` : ""}.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            <b style={{ color: S.accent2 }}>{confirmed}</b> of <b>{exec.assigned}</b> assigned workouts confirmed
            {exec.partial ? ` (${exec.partial} partial)` : ""}
            {exec.pendingToday ? " · today still open" : ""}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
            <Tile label="Completed" value={exec.completed} color={S.accent2} sub="client confirmed" />
            <Tile label="Unreported" value={exec.unreported} color={exec.unreported ? S.warning : S.text} sub="no answer — not 'missed'" />
            <Tile label="Said missed" value={exec.selfReportedMissed} color={exec.selfReportedMissed ? S.danger : S.text} sub="client's own check-in" />
            <Tile label="Rest days" value={exec.restDays + exec.selfReportedRest} sub="not assigned / rest" />
          </div>
        </>
      )}
      {reporting && (
        <>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, margin: "16px 0 8px" }}>Reporting activity (separate from training)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
            <Tile label="Daily check-ins" value={`${reporting.dailyCheckinDays}/${days}`} sub="days submitted" />
            <Tile label="Weekly check-ins" value={reporting.weeklyCheckins} sub="submitted" />
            <Tile label="Nutrition logged" value={`${reporting.nutritionLoggedDays}/${days}`} sub="days with any entry" />
            <Tile label="Habits tracked" value={`${reporting.habitDays}/${days}`} sub="days with any entry" />
            <Tile label="Weight updates" value={reporting.weightUpdates} sub="daily + weekly" />
          </div>
          <div style={{ fontSize: 11, color: S.muted, marginTop: 10 }}>A day with no nutrition entry isn't a failed nutrition day, and a submitted check-in doesn't prove every assigned task was done.</div>
        </>
      )}
    </Card>
  );
}
