import { S } from "../../theme.jsx";
import { Card, CardTitle, ProgressRing } from "../../components/ui/index.js";

const ROWS = [
  { key: "completed", label: "Completed", color: "success" },
  { key: "partial", label: "Partial", color: "warning" },
  { key: "missed", label: "Missed", color: "danger" },
];

// `counts` = how many coached clients completed (6-7/7 days), partially
// completed (1-5/7), or missed (0/7) their daily check-ins this week —
// computed by CoachHome from the same daily_checkins rows already loaded.
export function CheckInOverview({ counts, total }) {
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <Card>
      <CardTitle>Check-In Overview · This Week</CardTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <ProgressRing value={pct(counts.completed)} size={90} caption="Completed" />
        <div style={{ flex: 1 }}>
          {ROWS.map((r) => (
            <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
              <span style={{ fontSize: 12, color: S.text, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: S[r.color], display: "inline-block" }} />
                {r.label}
              </span>
              <span style={{ fontSize: 12, color: S.muted }}>{pct(counts[r.key])}% ({counts[r.key]})</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
