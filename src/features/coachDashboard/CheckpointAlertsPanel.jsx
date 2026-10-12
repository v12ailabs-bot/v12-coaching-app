import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

// Plan checkpoints (reassessment / nutrition review / goal review / Day 90
// review) that are due within 7 days, or overdue by up to 3 weeks, and not yet
// marked done. Computed from the roadmap's own program_phases.checkpoints and
// the program start date — real, not guessed. A coach marks one done from the
// phase's detail view; until then it keeps showing.
export function CheckpointAlertsPanel({ alerts, nameOf, openClient }) {
  if (alerts.length === 0) return null;
  const sorted = [...alerts].sort((a, b) => a.daysUntil - b.daysUntil);
  return (
    <Card>
      <SectionTitle>Plan Checkpoints Due</SectionTitle>
      {sorted.map((a, i) => {
        const overdue = a.daysUntil < 0;
        return (
          <div key={a.clientId + a.label + i} onClick={() => openClient(a.clientId, { section: "program-roadmap" })}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{nameOf(a.clientId)}</div>
              <div style={{ fontSize: 12, color: S.text, marginTop: 2 }}>{a.label} <span style={{ color: S.muted }}>· {a.phase}</span></div>
              <div style={{ fontSize: 11, color: overdue ? S.danger : S.warning, marginTop: 2 }}>
                {overdue ? `${Math.abs(a.daysUntil)}d overdue` : a.daysUntil === 0 ? "due today" : `due in ${a.daysUntil}d`}
                {a.nutritionPct != null ? ` · nutrition ${a.nutritionPct}%` : ""}
              </div>
            </div>
            <Btn sm teal onClick={(e) => { e.stopPropagation(); openClient(a.clientId, { section: "program-roadmap" }); }}>Open →</Btn>
          </div>
        );
      })}
    </Card>
  );
}
