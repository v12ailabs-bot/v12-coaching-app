import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

// A coach reminder for a client whose current program phase is ending soon
// (or already ran past its planned end date without being moved forward) --
// computed from the coach's own roadmap (program_phases + programs.start_date),
// so it's real, not a guess. Shows what's next per the roadmap so the coach
// doesn't have to open the client to check.
export function PhaseAlertsPanel({ alerts, nameOf, openClient }) {
  if (alerts.length === 0) return null;
  const sorted = [...alerts].sort((a, b) => a.daysUntilEnd - b.daysUntilEnd);

  return (
    <Card>
      <SectionTitle>Phase Check-ins Due</SectionTitle>
      {sorted.map((a) => {
        const overdue = a.daysUntilEnd < 0;
        return (
          <div key={a.clientId} onClick={() => openClient(a.clientId, { section: "phase-review" })}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{nameOf(a.clientId)}</div>
              <div style={{ fontSize: 11, color: overdue ? S.danger : S.warning, marginTop: 2 }}>
                {a.phase} {overdue ? `ended ${Math.abs(a.daysUntilEnd)}d ago` : a.daysUntilEnd === 0 ? "ends today" : `ends in ${a.daysUntilEnd}d`}
              </div>
              {a.nextPhase && <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>Next: {a.nextPhase}</div>}
            </div>
            <Btn sm teal onClick={(e) => { e.stopPropagation(); openClient(a.clientId, { section: "phase-review" }); }}>Review →</Btn>
          </div>
        );
      })}
    </Card>
  );
}
