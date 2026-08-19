import { useState } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { S, TT, COLORS } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";

const RANGES = { "1M": 30, "3M": 90, "6M": 180, All: Infinity };
const selStyle = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" };

// Weight lives on a ~100-250lb scale, energy/sleep on a 1-10 self-rating —
// plotting them on one shared axis would flatten whichever is smaller, and a
// second y-axis is its own well-known misread. Small multiples (three single-
// series mini charts, one shared date range) show all three at once with an
// honest scale each, no toggle required.
function MiniChart({ data, dataKey, height, domain, color, goalValue, showXAxis }) {
  const hasData = data.some((d) => d[dataKey] != null);
  if (!hasData) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: S.muted, fontSize: 12 }}>No data yet</div>;
  const tickEvery = Math.max(1, Math.floor(data.length / 8));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={S.border} vertical={false} />
          <XAxis dataKey="date" hide={!showXAxis} tick={{ fontSize: 10, fill: S.muted }} tickFormatter={(d) => d.slice(5)} interval={tickEvery} />
          <YAxis domain={domain} tick={{ fontSize: 10, fill: S.muted }} width={32} />
          <Tooltip {...TT} />
          {goalValue != null && <ReferenceLine y={goalValue} stroke={S.accent2} strokeDasharray="4 4" label={{ value: "Goal", fontSize: 9, fill: S.accent2, position: "insideTopRight" }} />}
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const MetricLabel = ({ children }) => (
  <div style={{ fontSize: 11, color: S.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{children}</div>
);

// Same `checkins` history ClientHome already loads. Weight, energy, and
// sleep now render together — a range picker instead of a metric picker.
export function ProgressChart({ checkins, goal }) {
  const [range, setRange] = useState("3M");
  const days = RANGES[range];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const data = checkins.filter((c) => days === Infinity || c.date >= cutoffStr);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20 }}>Progress Over Time</div>
        <select value={range} onChange={(e) => setRange(e.target.value)} style={selStyle}>
          {Object.keys(RANGES).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <MetricLabel>Weight (lb)</MetricLabel>
        <MiniChart data={data} dataKey="weight" height={160} domain={["auto", "auto"]} color={S.accent} goalValue={goal?.target_value} showXAxis={false} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <MetricLabel>Energy (/10)</MetricLabel>
          <MiniChart data={data} dataKey="energy" height={100} domain={[0, 10]} color={COLORS[1]} showXAxis />
        </div>
        <div>
          <MetricLabel>Sleep (/10)</MetricLabel>
          <MiniChart data={data} dataKey="sleep" height={100} domain={[0, 10]} color={COLORS[2]} showXAxis />
        </div>
      </div>
    </Card>
  );
}
