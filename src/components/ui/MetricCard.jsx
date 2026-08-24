import { S, RADIUS } from "../../theme.jsx";

// Richer variant of Stat for hero-header/summary tiles — adds an optional
// trend indicator (e.g. "▲ 2.1 lb this week") without disturbing the plain
// Stat tiles already used throughout the dashboard/overview grids. `icon`
// is optional (an emoji/short glyph) — omit it to render exactly as before.
export function MetricCard({ label, value, unit, trend, icon }) {
  return (
    <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted }}>{label}</div>
        {icon && (
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,106,0,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{icon}</div>
        )}
      </div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 12, color: S.muted }}>{unit}</span>
      </div>
      {trend && (
        <div style={{ fontSize: 11, marginTop: 6, color: trend.tone === "bad" ? S.danger : trend.tone === "good" ? S.accent2 : S.muted }}>
          {trend.text}
        </div>
      )}
    </div>
  );
}
