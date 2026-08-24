import { S, RADIUS } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";

const ACTIONS = [
  { key: "checkin", icon: "✅", label: "Log check-in" },
  { key: "nutrition", icon: "🥗", label: "Update nutrition plan" },
  { key: "phase", icon: "📈", label: "Update program phase" },
  { key: "message", icon: "💬", label: "Send client message" },
];

// Fixed, always-visible across every tab. Each action jumps to or triggers
// something that already exists rather than adding new functionality:
// "Log check-in" opens the Progress card (the client's real check-in
// history) since there's no coach-side manual check-in entry; "Update
// nutrition plan" and "Update program phase" trigger the existing
// regenerate/edit flows; "Send client message" opens the existing Coach
// Messages panel in a modal.
export function ClientQuickActionsRail({ onLogCheckin, onUpdateNutrition, onUpdateProgramPhase, onSendMessage }) {
  const handlers = { checkin: onLogCheckin, nutrition: onUpdateNutrition, phase: onUpdateProgramPhase, message: onSendMessage };
  return (
    <Card style={{ marginBottom: 0 }}>
      <CardTitle>Quick Actions</CardTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={handlers[a.key]}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, color: S.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <span>{a.icon}</span>{a.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
