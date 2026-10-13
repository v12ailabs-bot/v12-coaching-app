import { useRef, useState, useEffect, useMemo } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Legend, ResponsiveContainer } from "recharts";
import { S, TT } from "../../theme.jsx";
import { bucketSeries, pickTicks, maxLabelsFor } from "../../lib/chartBuckets.js";

// Range-aware trend chart: raw daily rows in, averaged points out (7D daily,
// 30D weekly, longer monthly — see lib/chartBuckets.js). Tapping a point shows
// the average and how many entries it is based on. `series` is
// [{ key, name, color, axis? }]; `refLines` is [{ y, color, label? }].
function Tip({ active, payload, series, unit }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ ...TT.contentStyle, padding: "8px 10px" }}>
      <div style={{ color: S.muted, marginBottom: 4 }}>{p.full}</div>
      {series.map((s) => p[s.key] == null ? null : (
        <div key={s.key} style={{ color: s.color }}>
          {series.length > 1 ? s.name + ": " : ""}<b>{p[s.key]}{unit || ""}</b>
          <span style={{ color: S.muted }}> · {p["n_" + s.key] === 1 ? "1 entry" : `avg of ${p["n_" + s.key]} entries`}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ rows, series, range, domain = ["auto", "auto"], refLines = [], unit, legend = false, fmtY }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(300);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const keys = series.map((s) => s.key);
  const points = useMemo(() => bucketSeries(rows, keys, range), [rows, range]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!points.length) return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: S.muted }}>No entries in this range</div>;
  const ticks = pickTicks(points, maxLabelsFor(width - 44, points));
  const labelOf = Object.fromEntries(points.map((p) => [p.key, p.label]));
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
          <XAxis dataKey="key" ticks={ticks} interval={0} tickFormatter={(k) => labelOf[k]} tick={{ fontSize: 10, fill: S.muted }} />
          <YAxis yAxisId="l" domain={domain} tick={{ fontSize: 10, fill: S.muted }} tickFormatter={fmtY} width={40} />
          {series.some((x) => x.axis === "right") && <YAxis yAxisId="r" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: S.muted }} width={34} />}
          <Tooltip content={<Tip series={series} unit={unit} />} />
          {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {refLines.map((r, i) => <ReferenceLine key={i} yAxisId="l" y={r.y} stroke={r.color || S.muted} strokeDasharray="4 4" label={r.label ? { value: r.label, fontSize: 9, fill: r.color || S.muted, position: "insideTopRight" } : undefined} />)}
          {series.map((s) => <Line key={s.key} yAxisId={s.axis === "right" ? "r" : "l"} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
