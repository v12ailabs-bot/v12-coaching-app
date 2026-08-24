import { S, RADIUS, todayStr, avatarFrom, COLORS } from "../../theme.jsx";
import { timeSince } from "./crmHelpers.js";

// Deterministic color per lead (same hashing approach ClientSelector uses for
// avatars) so a given lead's dot doesn't change color on every reload.
const colorFor = (key) => {
  const sum = String(key).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return COLORS[sum % COLORS.length];
};

// Compact card shown inside a kanban column: name, email, source, and either
// the follow-up due date (red once overdue) or time-since-added — no phone
// field, since none exists in the leads schema.
export function LeadCard({ lead, onClick }) {
  const today = todayStr();
  const isDue = lead.follow_up_date && lead.follow_up_date <= today;
  return (
    <div
      onClick={onClick}
      style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, minWidth: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: colorFor(lead.id), color: "#0B0B0D", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {avatarFrom(lead.name || lead.email)}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {lead.name || lead.email}
        </div>
      </div>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {lead.email}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lead.source || "—"}
        </span>
        {lead.follow_up_date ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: isDue ? S.danger : S.neon, whiteSpace: "nowrap" }}>
            {lead.follow_up_date}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: S.muted, whiteSpace: "nowrap" }}>{timeSince(lead.created_at)}</span>
        )}
      </div>
    </div>
  );
}
