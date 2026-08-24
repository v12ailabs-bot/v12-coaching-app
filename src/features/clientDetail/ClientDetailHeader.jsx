import { S, RADIUS, avatarFrom } from "../../theme.jsx";
import { StatusBadge } from "../../components/ui/index.js";

// Always-visible top strip across every tab — name, program type, contact,
// Active/Archived status, and last check-in. There's no "next check-in"
// scheduling concept anywhere in the app (no cadence field, no reschedule
// action) — this shows the real "last check-in" instead of fabricating a
// forward-looking date that doesn't exist. Consolidates the identity block
// that used to live in the old ClientHeaderSection; its AI-generation
// actions moved into the Program Phase tab (see ProgramGenerateActions.jsx),
// and Client Settings moved into the Overview tab as a collapsible card.
export function ClientDetailHeader({ client, lastCheckin, onArchiveToggle }) {
  return (
    <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.lg, padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: S.accent, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
        {avatarFrom(client.name || client.email)}
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, lineHeight: 1 }}>{client.name || "—"}</div>
          <StatusBadge label={client.archived ? "Archived" : "Active"} tone={client.archived ? "neutral" : "green"} />
        </div>
        <div style={{ fontSize: 13, color: S.text, marginTop: 4 }}>{client.goal || "No goal set"}</div>
        <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>{client.email}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Last check-in</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{lastCheckin || "No check-ins yet"}</div>
        <button
          onClick={() => onArchiveToggle(client, !client.archived)}
          style={{ marginTop: 10, padding: "6px 12px", fontSize: 10, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}
        >
          {client.archived ? "Unarchive" : "Archive"}
        </button>
      </div>
    </div>
  );
}
