import { S, RADIUS } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";

const ACTIONS = [
  { key: "generate", icon: "⚡", label: "Generate AI Program" },
  { key: "nutrition", icon: "🥗", label: "Update nutrition plan" },
  { key: "phase", icon: "📈", label: "Update program phase" },
  { key: "message", icon: "💬", label: "Send client message" },
];

// Fixed, always-visible across every tab. "Log check-in" was removed from
// this list — it's a client-side action, not something the coach does from
// here (see the header's clickable "Last check-in" instead). The other four
// trigger existing flows directly rather than requiring a detour into the
// Program Phase tab first: "Generate AI Program" runs the same full
// generation pipeline as ProgramGenerateActions using whatever template is
// currently selected there; "Update nutrition plan" and "Update program
// phase" trigger the existing regenerate/edit flows; "Send client message"
// opens the existing Coach Messages panel in a modal.
export function ClientQuickActionsRail({ onGenerateProgram, onUpdateNutrition, onUpdateProgramPhase, onSendMessage }) {
  const handlers = { generate: onGenerateProgram, nutrition: onUpdateNutrition, phase: onUpdateProgramPhase, message: onSendMessage };
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
