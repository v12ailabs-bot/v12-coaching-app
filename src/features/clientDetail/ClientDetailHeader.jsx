import { S, RADIUS, avatarFrom } from "../../theme.jsx";
import { StatusBadge, Btn, Tabs } from "../../components/ui/index.js";

// Always-visible top strip across every tab — name, program type, contact,
// Active/Archived status, last check-in, and access-until (so a fixed-term
// client's end date is visible at a glance instead of only living inside the
// gear-icon settings modal). There's no "next check-in" scheduling concept
// anywhere in the app (no cadence field, no reschedule action) — this shows
// the real "last check-in" date as plain text, with a separate "Progress"
// button to open the full Progress view (the date itself isn't the click
// target). The gear icon still opens Client Settings (goal / access date /
// client type / training location) for editing — account configuration, not
// day-to-day client status — but the access date itself is now readable
// without opening it.
//
// The Overview/Goals/Nutrition/Program Phase tab strip lives inside this
// same card, directly under the identity row, instead of as a separate bar
// underneath it — one visual unit instead of two stacked ones.
export function ClientDetailHeader({ client, lastCheckin, onArchiveToggle, onOpenProgress, onSettingsClick, tabs, activeTab, onTabChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: S.surface, border: "1px solid " + S.border, borderBottom: "none", borderRadius: `${RADIUS.lg}px ${RADIUS.lg}px 0 0`, padding: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
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
          <div style={{ fontSize: 14, fontWeight: 700, color: S.text, marginBottom: client.access_until ? 2 : 8 }}>{lastCheckin || "No check-ins yet"}</div>
          {client.access_until && (
            <div style={{ fontSize: 11, color: S.muted, marginBottom: 8 }}>Access until <strong style={{ color: S.text }}>{client.access_until}</strong></div>
          )}
          <Btn sm onClick={onOpenProgress}>Progress</Btn>
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
      {/* Sibling, not nested, so the mobile sticky rule (.client-tabs-sticky
          detaches this to the top of the viewport on scroll) never has to
          fight the identity row's rounded-card box above it. Matching side
          borders + bottom-only radius make the two read as one card. */}
      <div className="client-tabs-sticky" style={{ background: S.surface, border: "1px solid " + S.border, borderTop: "none", borderRadius: `0 0 ${RADIUS.lg}px ${RADIUS.lg}px`, padding: "0 20px" }}>
        <Tabs tabs={tabs} active={activeTab} onChange={onTabChange} />
      </div>
    </div>
  );
}
