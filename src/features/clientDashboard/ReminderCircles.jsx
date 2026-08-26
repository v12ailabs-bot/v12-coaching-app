import { S } from "../../theme.jsx";

// Replaces the old full-width rectangular "Daily check-in is due" / "Weekly
// check-in is due" banner blocks with three small circular buttons — Daily,
// Weekly, and Dashboard (the client's personalized Notion link, previously a
// small, easily-missed link in the topbar — see TopBar in App.jsx, which no
// longer renders it for coaching clients now that it lives here instead).
// Due/not-due visibility is unchanged from the old banners: Daily/Weekly
// only show when actually due; Dashboard always shows when the client has
// one, since it isn't a reminder.
const CIRCLES = [
  { key: "daily", icon: "✅", label: "Daily", color: S.accent, title: "Daily check-in is due" },
  { key: "weekly", icon: "📅", label: "Weekly", color: S.accent2, title: "Weekly check-in is due" },
  { key: "dashboard", icon: "📊", label: "Dashboard", color: "#8B5CF6", title: "Open your Notion dashboard" },
];

export function ReminderCircles({ profile, doneToday, weeklyDone, setPage }) {
  const show = {
    daily: !doneToday,
    weekly: !weeklyDone,
    dashboard: !!profile?.dashboard_url,
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
        const wrapperStyle = { display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "none" };
        return c.key === "dashboard" ? (
          <a key={c.key} href={profile.dashboard_url} target="_blank" rel="noopener noreferrer" title={c.title} style={wrapperStyle}>{body}</a>
        ) : (
          <button key={c.key} title={c.title} onClick={() => setPage(c.key)} style={wrapperStyle}>{body}</button>
        );
      })}
    </div>
  );
}
