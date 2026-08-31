import { S, RADIUS, avatarFrom, useIsMobile } from "../../theme.jsx";
import { StatusBadge } from "../../components/ui/index.js";
import { V12_CALENDLY_DASHBOARD_URL } from "../../lib/constants.js";

const TAB_ICON = { overview: "📊", goals: "🎯", nutrition: "🥗", "program-phase": "📋" };

// Mobile-only action row: Message / Call / Weekly Review / More. "Call"
// opens a WhatsApp chat with the number on file (new profiles.phone field,
// set via Client Settings) instead of a plain tel: link — WhatsApp gives a
// call AND a message thread from the same tap, which is what's actually
// wanted here. Degrades to a clear message when no number is on file rather
// than a dead link. "Weekly Review" sends the COACH to their own logged-in
// Calendly scheduled-events dashboard (who booked, for when) — the client
// gets the public booking link instead (see WeeklyCheckin in App.jsx and
// ClientQuickActionsRail's "Schedule Call") since sending the coach to the
// public booking page would just let them book themselves a slot.
function MobileActionRow({ client, onSendMessage, onSettingsClick }) {
  const openWhatsApp = () => {
    if (!client.phone) { window.alert("No phone number on file — add one in Settings."); return; }
    window.open(`https://wa.me/${client.phone.replace(/[^\d]/g, "")}`, "_blank", "noopener");
  };
  const actions = [
    { key: "message", icon: "💬", label: "Message", onClick: onSendMessage },
    { key: "call", icon: "📱", label: "WhatsApp", onClick: openWhatsApp },
    { key: "review", icon: "🗓", label: "Weekly Review", onClick: () => window.open(V12_CALENDLY_DASHBOARD_URL, "_blank", "noopener") },
    { key: "more", icon: "⋯", label: "More", onClick: onSettingsClick },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
      {actions.map((a) => (
        <button key={a.key} onClick={a.onClick}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 4px", background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, color: S.text, cursor: "pointer" }}>
          <span style={{ fontSize: 16 }}>{a.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 600 }}>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

// Always-visible top strip across every tab — name, program type, contact,
// Active/Archived status, last check-in, and access-until (so a fixed-term
// client's end date is visible at a glance instead of only living inside the
// gear-icon settings modal). There's no "next check-in" scheduling concept
// anywhere in the app (no cadence field, no reschedule action) — this shows
// the real "last check-in" date as plain text next to a circular Progress
// button (color-matched to the same circle language as the client-facing
// reminder circles) rather than a plain rectangular button. Settings gets
// its own circle in a distinct color so the two are never confused at a
// glance.
//
// The Overview/Goals/Nutrition/Program Phase tab strip lives inside this
// same card, directly under the identity row, instead of as a separate bar
// underneath it — one visual unit instead of two stacked ones. Rendered as
// bold pill buttons (not the shared underline Tabs primitive) so they read
// as substantial, clickable destinations rather than small text labels.
export function ClientDetailHeader({ client, lastCheckin, onArchiveToggle, onOpenProgress, onSettingsClick, onSendMessage, tabs, activeTab, onTabChange }) {
  const isMobile = useIsMobile();
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
          {client.access_until && (
            <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>Access until <strong style={{ color: S.text }}>{client.access_until}</strong></div>
          )}
          {isMobile && client.created_at && (
            <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>Client since {client.created_at.slice(0, 10)}</div>
          )}
        </div>

        {!isMobile && <div style={{ display: "flex", alignItems: "center", gap: 22, flexShrink: 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6, whiteSpace: "nowrap" }}>{lastCheckin || "No check-ins"}</div>
            <button onClick={onOpenProgress} title="Open Progress" aria-label="Open Progress"
              style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid " + S.accent2, background: "rgba(0,201,167,.14)", color: S.accent2, fontSize: 19 }}>
              📈
            </button>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: S.accent2, marginTop: 5 }}>Progress</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <button onClick={() => onArchiveToggle(client, !client.archived)} title={client.archived ? "Unarchive" : "Archive"} aria-label={client.archived ? "Unarchive" : "Archive"}
              style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid " + S.border, background: "transparent", color: S.muted, fontSize: 18 }}>
              {client.archived ? "↺" : "🗄"}
            </button>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: S.muted, marginTop: 5 }}>{client.archived ? "Unarchive" : "Archive"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <button onClick={onSettingsClick} title="Client settings" aria-label="Client settings"
              style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid #8B5CF6", background: "rgba(139,92,246,.14)", color: "#8B5CF6", fontSize: 19 }}>
              ⚙
            </button>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "#8B5CF6", marginTop: 5 }}>Settings</div>
          </div>
        </div>}
      </div>
      {isMobile && <MobileActionRow client={client} onSendMessage={onSendMessage} onSettingsClick={onSettingsClick} />}
      {/* Sibling, not nested, so the mobile sticky rule (.client-tabs-sticky
          detaches this to the top of the viewport on scroll) never has to
          fight the identity row's rounded-card box above it. Matching side
          borders + bottom-only radius make the two read as one card. */}
      <div className="client-tabs-sticky" style={{ background: S.surface, border: "1px solid " + S.border, borderTop: "none", borderRadius: `0 0 ${RADIUS.lg}px ${RADIUS.lg}px`, padding: "14px 20px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {tabs.map((t) => {
            const isActive = t.key === activeTab;
            return (
              <button key={t.key} onClick={() => onTabChange(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, cursor: "pointer",
                  border: "1px solid " + (isActive ? S.accent : S.border),
                  background: isActive ? S.accent : "transparent",
                  color: isActive ? "white" : S.text,
                  flex: "1 1 140px", justifyContent: "center", minWidth: 130,
                }}>
                <span style={{ fontSize: 15 }}>{TAB_ICON[t.key] || "•"}</span>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 0.5 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
