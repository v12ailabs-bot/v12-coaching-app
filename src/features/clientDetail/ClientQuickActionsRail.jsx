import { useState } from "react";
import { S, RADIUS } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { V12_CALENDLY_URL } from "../../lib/constants.js";

const ACTIONS = [
  { key: "note", icon: "📝", label: "Add Note" },
  { key: "phase", icon: "📈", label: "Adjust Program" },
  { key: "message", icon: "💬", label: "Send Message" },
  { key: "call", icon: "🗓", label: "Schedule Call" },
  { key: "more", icon: "⋯", label: "More Actions" },
];
const MORE_ACTIONS = [
  { key: "generate", icon: "⚡", label: "Generate AI Program" },
  { key: "nutrition", icon: "🥗", label: "Update nutrition plan" },
];

// Fixed, always-visible across every tab. "Log check-in" was never in this
// list — it's a client-side action, not something the coach does from here
// (see the header's clickable "Last check-in" instead). Expanded from the
// original 4 actions: "Add Note" jumps to the Coach Notes section, "Schedule
// Call" links to the coach's Calendly (no in-app booking system exists),
// and the two less-common actions (Generate AI Program, Update nutrition
// plan) sit behind "More Actions" instead of competing for top billing.
export function ClientQuickActionsRail({ onGenerateProgram, onUpdateNutrition, onUpdateProgramPhase, onSendMessage, onAddNote }) {
  const [showMore, setShowMore] = useState(false);
  const handlers = {
    note: onAddNote,
    phase: onUpdateProgramPhase,
    message: onSendMessage,
    call: () => window.open(V12_CALENDLY_URL, "_blank", "noopener"),
    more: () => setShowMore((v) => !v),
  };
  const moreHandlers = { generate: onGenerateProgram, nutrition: onUpdateNutrition };
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
        {showMore && MORE_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={moreHandlers[a.key]}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px 10px 26px", background: "transparent", border: "1px solid " + S.border, borderRadius: RADIUS.sm, color: S.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <span>{a.icon}</span>{a.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
