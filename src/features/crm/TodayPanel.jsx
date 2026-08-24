import { useState } from "react";
import { S, RADIUS, todayStr } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";

// Narrow right-hand panel: follow-ups due today, soonest-overdue first, each
// with an Open button (jumps into the same lead detail modal the board
// uses). "View calendar" doesn't link to a page that doesn't exist in this
// app (no calendar/schedule route) — instead it expands this same panel to
// the full upcoming follow-up list (still just leads.follow_up_date data,
// no new page/fields).
export function TodayPanel({ leads, onOpen }) {
  const [showAll, setShowAll] = useState(false);
  const today = todayStr();
  const dueToday = leads
    .filter((l) => l.follow_up_date && l.follow_up_date <= today)
    .sort((a, b) => (a.follow_up_date < b.follow_up_date ? -1 : 1));
  const upcoming = leads
    .filter((l) => l.follow_up_date && l.follow_up_date > today)
    .sort((a, b) => (a.follow_up_date < b.follow_up_date ? -1 : 1));

  return (
    <Card style={{ marginBottom: 0 }}>
      <CardTitle>Today</CardTitle>
      {dueToday.length === 0 ? (
        <div style={{ fontSize: 12, color: S.muted, marginBottom: 14 }}>No follow-ups due today.</div>
      ) : (
        dueToday.map((l) => (
          <div key={l.id} style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name || l.email}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: S.danger }}>Due today</div>
            </div>
            <Btn sm onClick={() => onOpen(l)}>Open</Btn>
          </div>
        ))
      )}

      {showAll && upcoming.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid " + S.border }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 10 }}>Upcoming follow-ups</div>
          {upcoming.map((l) => (
            <div key={l.id} onClick={() => onOpen(l)} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
              <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name || l.email}</span>
              <span style={{ fontSize: 11, color: S.muted, flexShrink: 0 }}>{l.follow_up_date}</span>
            </div>
          ))}
        </div>
      )}

      <div
        onClick={() => setShowAll((v) => !v)}
        style={{ fontSize: 11, fontWeight: 600, color: S.accent, cursor: "pointer", marginTop: 12, textAlign: "center" }}
      >
        {showAll ? "Hide calendar ▲" : "View calendar ▾"}
      </div>
    </Card>
  );
}
