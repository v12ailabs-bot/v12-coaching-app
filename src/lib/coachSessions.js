// Pure helpers for the coach "Today" schedule. A session is either one-off
// (session_date) or recurring (weekdays: 0=Sun … 6=Sat).
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function sessionsOnDate(sessions, dateStr) {
  const wd = new Date(dateStr + "T00:00:00").getDay();
  return sessions
    .filter((s) => (s.session_date ? s.session_date === dateStr : (s.weekdays || []).includes(wd)))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

export function timeLabel(t) {
  const [h, m] = String(t).split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export const repeatLabel = (s) => (s.session_date ? "One-off" : (s.weekdays || []).slice().sort().map((d) => WEEKDAY_LABELS[d]).join("/"));
