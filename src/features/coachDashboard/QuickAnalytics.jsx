import { LineChart, Line, ResponsiveContainer } from "recharts";
import { S, RADIUS } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

// Sparkline per the "trend" figure spec: a de-emphasized line (S.muted) with
// only the current/latest point picked out in the accent color — not a full
// chart, so no axes/gridlines/legend.
function Sparkline({ data, color }) {
  if (!data || data.filter((d) => d.value != null).length < 2) {
    return <div style={{ width: "100%", height: 36 }} />;
  }
  return (
    <div style={{ width: "100%", height: 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone" dataKey="value" stroke={S.muted} strokeWidth={2}
            isAnimationActive={false} connectNulls
            dot={(props) => {
              if (props.index !== data.length - 1 || props.payload.value == null) return null;
              return <circle key="end" cx={props.cx} cy={props.cy} r={4} fill={color} stroke={S.surface2} strokeWidth={2} />;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendPill({ deltaPct }) {
  if (deltaPct == null) return null;
  const tone = deltaPct > 0 ? { bg: "rgba(0,201,167,.14)", fg: S.accent2 } : deltaPct < 0 ? { bg: "rgba(239,68,68,.14)", fg: S.danger } : { bg: S.surface, fg: S.muted };
  const arrow = deltaPct > 0 ? "↑" : deltaPct < 0 ? "↓" : "→";
  return (
    <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: tone.bg, color: tone.fg, whiteSpace: "nowrap" }}>
      {arrow} {Math.abs(deltaPct)}%
    </span>
  );
}

// One metric tile — same visual language as the top stat cards (bordered
// surface2 block, Bebas Neue value, a small colored trend pill) instead of a
// bare row of text, so this reads as part of the same design system.
function MetricTile({ label, current, deltaPct, series, color }) {
  return (
    <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 16, flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>{label}</div>
        <TrendPill deltaPct={deltaPct} />
      </div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, lineHeight: 1, color: S.text, marginBottom: 10 }}>
        {current == null ? "—" : current + "%"}
      </div>
      <Sparkline data={series} color={color} />
    </div>
  );
}

// `checkin`/`progress` are each { current, deltaPct, series } — series is 6
// weekly buckets (oldest → newest), computed by CoachHome from the same
// daily_checkins/goal data every other panel already reads. No new tracking
// or historical-snapshot table: each bucket is computed on the fly from the
// window of check-ins already fetched.
export function QuickAnalytics({ checkin, progress }) {
  return (
    <Card>
      <SectionTitle>Quick Analytics <span style={{ fontSize: 11, color: S.muted, fontWeight: 400, marginLeft: 6 }}>Last 6 Weeks</span></SectionTitle>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MetricTile label="Check-In Completion" current={checkin.current} deltaPct={checkin.deltaPct} series={checkin.series} color={S.accent} />
        <MetricTile label="Avg Client Progress" current={progress.current} deltaPct={progress.deltaPct} series={progress.series} color={S.accent2} />
      </div>
    </Card>
  );
}
