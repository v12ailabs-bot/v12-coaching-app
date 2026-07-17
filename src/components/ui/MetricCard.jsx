import { S } from "../../theme.jsx";

// Richer variant of Stat for hero-header/summary tiles — adds an optional
// trend indicator (e.g. "▲ 2.1 lb this week") without disturbing the plain
// Stat tiles already used throughout the dashboard/overview grids.
export function MetricCard({ label, value, unit, trend }) {
  return (
    <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: 10, padding: 18 }}>
      <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 12, color: S.muted }}>{unit}</span>
      </div>
      {trend && (
        <div style={{ fontSize: 11, marginTop: 6, color: trend.tone === "bad" ? "#ff6b5b" : trend.tone === "good" ? S.accent2 : S.muted }}>
          {trend.text}
        </div>
      )}
    </div>
  );
}
