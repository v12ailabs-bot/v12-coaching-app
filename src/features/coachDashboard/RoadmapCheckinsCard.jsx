import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";
import { timingText } from "../../lib/roadmapCheckins.js";

// One card replacing "Plan Checkpoints Due" + "Phase Check-ins Due": one row
// per client, both kinds of item listed together, one REVIEW button that opens
// RoadmapCheckinModal. Rows arrive sorted most-overdue first.
export function RoadmapCheckinsCard({ rows, nameOf, onReview, reminders = {} }) {
  if (rows.length === 0) return null;
  const tone = (d) => (d < 0 ? S.danger : S.warning);
  return (
    <Card>
      <SectionTitle>Roadmap Check-ins Due</SectionTitle>
      {rows.map((r) => (
        <div key={r.clientId} onClick={() => onReview(r.clientId)}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{nameOf(r.clientId)}</div>
            {r.checkpoints.map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: S.text, marginTop: 2 }}>◆ {c.label} <span style={{ color: S.muted }}>· {c.phase}</span> <span style={{ color: tone(c.daysUntil) }}>· {timingText(c.daysUntil)}</span></div>
            ))}
            {r.phase && (
              <div style={{ fontSize: 12, color: S.text, marginTop: 2 }}>Phase check-in <span style={{ color: S.muted }}>· {r.phase.phase}{r.phase.nextPhase ? ` → ${r.phase.nextPhase}` : ""}</span> <span style={{ color: tone(r.phase.daysUntilEnd) }}>· {r.phase.daysUntilEnd < 0 ? `ended ${Math.abs(r.phase.daysUntilEnd)}d ago` : timingText(r.phase.daysUntilEnd, true)}</span></div>
            )}
            {reminders[r.clientId]?.reminder && <div style={{ fontSize: 11, color: S.accent, marginTop: 3 }}>Reminder: {reminders[r.clientId].reminder}</div>}
          </div>
          <Btn sm teal onClick={(e) => { e.stopPropagation(); onReview(r.clientId); }}>Review</Btn>
        </div>
      ))}
    </Card>
  );
}
