import { useState } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { S, TT } from "../../theme.jsx";
import { CC } from "../../components/ui/index.js";

const METRICS = {
  weight: { label: "Weight", key: "weight", unit: "lb" },
  energy: { label: "Energy", key: "energy", unit: "/10" },
  sleep: { label: "Sleep", key: "sleep", unit: "/10" },
};
const RANGES = { "1M": 30, "3M": 90, "6M": 180, All: Infinity };

const selStyle = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" };

// Same `checkins` history ClientHome already loads — this just adds a
// metric/range picker on top instead of two fixed full-history charts.
export function ProgressChart({ checkins, goal }) {
  const [metric, setMetric] = useState("weight");
  const [range, setRange] = useState("3M");

  const days = RANGES[range];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const data = checkins.filter((c) => c[METRICS[metric].key] != null && (days === Infinity || c.date >= cutoffStr));
  const tickEvery = Math.max(1, Math.floor(data.length / 8));
  const m = METRICS[metric];

  return (
    <CC
      title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} style={selStyle}>
          {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </span>}
      sub={<select value={range} onChange={(e) => setRange(e.target.value)} style={selStyle}>
        {Object.keys(RANGES).map((r) => <option key={r} value={r}>{r}</option>)}
      </select>}
    >
      {data.length < 2 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: S.muted, fontSize: 13 }}>Not enough data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: S.muted }} tickFormatter={(d) => d.slice(5)} interval={tickEvery} />
            <YAxis domain={metric === "weight" ? ["auto", "auto"] : [0, 10]} tick={{ fontSize: 10, fill: S.muted }} />
            <Tooltip {...TT} />
            {metric === "weight" && goal && <ReferenceLine y={goal.target_value} stroke={S.accent2} strokeDasharray="4 4" label={{ value: "Goal", fontSize: 9, fill: S.accent2, position: "insideTopRight" }} />}
            <Line type="monotone" dataKey={m.key} stroke={S.accent} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </CC>
  );
}
