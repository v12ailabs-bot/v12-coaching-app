import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

// Milestone achieved / approaching, computed live from workout_logs in
// CoachHome (same exercise-based milestones MilestonesCard manages) --
// per spec, achievement can surface automatically (unlike phase advances,
// which always require an explicit coach decision).
export function MilestoneAlertsPanel({ alerts, nameOf, openClient }) {
  if (alerts.length === 0) return null;
  const sorted = [...alerts].sort((a, b) => (a.kind === "achieved" ? -1 : 1) - (b.kind === "achieved" ? -1 : 1));

  return (
    <Card>
      <SectionTitle>Milestones</SectionTitle>
      {sorted.map((a, i) => (
        <div key={i} onClick={() => openClient(a.clientId, { section: "milestones" })}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{nameOf(a.clientId)}</div>
            <div style={{ fontSize: 11, color: a.kind === "achieved" ? S.success : S.warning, marginTop: 2 }}>
              {a.exercise} {a.kind === "achieved" ? "milestone reached" : `${a.pct}% complete`}
            </div>
          </div>
          <Btn sm teal onClick={(e) => { e.stopPropagation(); openClient(a.clientId, { section: "milestones" }); }}>Review →</Btn>
        </div>
      ))}
    </Card>
  );
}
