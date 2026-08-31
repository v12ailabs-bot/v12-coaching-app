import { S } from "../../theme.jsx";
import { COACH_WHATSAPP_URL } from "../../lib/constants.js";

// Replaces the old full-width rectangular "Daily check-in is due" / "Weekly
// check-in is due" banner blocks with small circular buttons — Daily,
// Weekly, Dashboard (previously a link out to the client's personalized
// Notion page; now the in-app Dashboard page — see ClientDashboardPage.jsx),
// and Message Coach (opens a WhatsApp chat with the coach directly). Due/
// not-due visibility is unchanged from the old banners: Daily/Weekly only
// show when actually due; Dashboard and Message Coach always show, since
// neither is a reminder — both are just a quick way to get somewhere.
const CIRCLES = [
  { key: "daily", icon: "✅", label: "Daily", color: S.accent, title: "Daily check-in is due" },
  { key: "weekly", icon: "📅", label: "Weekly", color: S.accent2, title: "Weekly check-in is due" },
  { key: "clientdashboard", icon: "📊", label: "Dashboard", color: "#8B5CF6", title: "Open your dashboard" },
  { key: "message-coach", icon: "💬", label: "Message Coach", color: S.accent, external: COACH_WHATSAPP_URL, title: "Message your coach on WhatsApp" },
];

export function ReminderCircles({ profile, doneToday, weeklyDone, setPage }) {
  const show = {
    daily: !doneToday,
    weekly: !weeklyDone,
    clientdashboard: true,
    "message-coach": true,
  };
  const visible = CIRCLES.filter((c) => show[c.key]);
  if (!visible.length) return null;

  return (
    <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
      {visible.map((c) => {
        const body = (
          <>
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: c.color + "1F", border: "2px solid " + c.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
              {c.icon}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: c.color, marginTop: 6, textAlign: "center" }}>{c.label}</div>
          </>
        );
        const style = { display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "none" };
        return c.external ? (
          <a key={c.key} href={c.external} target="_blank" rel="noopener noreferrer" title={c.title} style={style}>{body}</a>
        ) : (
          <button key={c.key} title={c.title} onClick={() => setPage(c.key)} style={style}>{body}</button>
        );
      })}
    </div>
  );
}
