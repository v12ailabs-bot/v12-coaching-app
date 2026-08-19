import { LineChart, Line, ResponsiveContainer } from "recharts";
import { S } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

// Sparkline per the "trend" figure spec: a de-emphasized line (S.muted) with
// only the current/latest point picked out in the accent color — not a full
// chart, so no axes/gridlines/legend.
function Sparkline({ data, color }) {
  if (!data || data.filter((d) => d.value != null).length < 2) {
    return <div style={{ width: 84, height: 34, flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: 84, height: 34, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone" dataKey="value" stroke={S.muted} strokeWidth={2}
            isAnimationActive={false} connectNulls
            dot={(props) => {
              if (props.index !== data.length - 1 || props.payload.value == null) return null;
              return <circle key="end" cx={props.cx} cy={props.cy} r={4} fill={color} stroke={S.surface} strokeWidth={2} />;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Row({ label, current, deltaPct, series, color }) {
  const hasDelta = deltaPct != null;
  const tone = !hasDelta ? S.muted : deltaPct > 0 ? S.accent2 : deltaPct < 0 ? "#ff6b5b" : S.muted;
  const arrow = !hasDelta ? "" : deltaPct > 0 ? "↑" : deltaPct < 0 ? "↓" : "→";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "10px 0", borderBottom: "1px solid " + S.border }}>
      <div>
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 4 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, lineHeight: 1 }}>{current == null ? "—" : current + "%"}</div>
          {hasDelta && <div style={{ fontSize: 11, fontWeight: 600, color: tone }}>{arrow} {Math.abs(deltaPct)}% vs last week</div>}
        </div>
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
      <SectionTitle>Quick Analytics <span style={{ fontSize: 10, color: S.muted, fontWeight: 400, marginLeft: 6 }}>Last 6 Weeks</span></SectionTitle>
      <Row label="Check-In Completion" current={checkin.current} deltaPct={checkin.deltaPct} series={checkin.series} color={S.accent} />
      <Row label="Avg Client Progress" current={progress.current} deltaPct={progress.deltaPct} series={progress.series} color={S.accent2} />
    </Card>
  );
}
