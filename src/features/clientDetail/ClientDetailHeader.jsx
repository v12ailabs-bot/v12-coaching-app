import { S, RADIUS, avatarFrom } from "../../theme.jsx";
import { StatusBadge } from "../../components/ui/index.js";

// Always-visible top strip across every tab — name, program type, contact,
// Active/Archived status, and last check-in. There's no "next check-in"
// scheduling concept anywhere in the app (no cadence field, no reschedule
// action) — this shows the real "last check-in" instead, as a clickable
// link into the Progress card rather than a static label. The gear icon
// opens Client Settings (goal / access date / client type / training
// location) in a modal — account configuration, not day-to-day client
// status, so it stays out of the Overview info grid.
export function ClientDetailHeader({ client, lastCheckin, onArchiveToggle, onLastCheckinClick, onSettingsClick }) {
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
        <button
          onClick={onLastCheckinClick}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 700, color: S.accent, textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          {lastCheckin || "No check-ins yet"}
        </button>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button
            onClick={() => onArchiveToggle(client, !client.archived)}
            style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}
          >
            {client.archived ? "Unarchive" : "Archive"}
          </button>
          <button
            onClick={onSettingsClick}
            title="Client settings"
            aria-label="Client settings"
            style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted, fontSize: 14, borderRadius: RADIUS.sm }}
          >
            ⚙
          </button>
        </div>
      </div>
    </div>
  );
}
