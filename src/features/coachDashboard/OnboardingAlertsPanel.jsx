import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";
import { taskLabel } from "../../lib/onboardingTasks.js";

// A coach reminder for clients whose Day-0 onboarding gate (assessment ->
// coach review -> roadmap confirmed) has an active coach-owned step waiting
// on them -- so a new client never silently stalls in onboarding because the
// coach forgot to check.
export function OnboardingAlertsPanel({ alerts, nameOf, openClient }) {
  if (alerts.length === 0) return null;

  return (
    <Card>
      <SectionTitle>Onboarding Needs Attention</SectionTitle>
      {alerts.map((a) => (
        <div key={a.clientId} onClick={() => openClient(a.clientId, { section: "assessment" })}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{nameOf(a.clientId)}</div>
            <div style={{ fontSize: 11, color: S.warning, marginTop: 2 }}>{taskLabel(a.taskKey, true)}</div>
          </div>
          <Btn sm teal onClick={(e) => { e.stopPropagation(); openClient(a.clientId, { section: "assessment" }); }}>Review →</Btn>
        </div>
      ))}
    </Card>
  );
}
