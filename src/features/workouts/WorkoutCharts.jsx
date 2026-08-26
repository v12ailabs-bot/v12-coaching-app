import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from "recharts";
import { S, TT } from "../../theme.jsx";
import { CC, Btn } from "../../components/ui/index.js";

// Shared by the client-facing Workouts page and the coach's mobile/desktop
// Workout Review (Section 9) — one chart implementation, not two, per the
// redesign brief. `chartData` is [{date, weight, reps}] ascending by date.

// "5-8" / "8 to 12" / "AMRAP 10+" -> {min,max} target rep range for the
// reference band; null when the target isn't a parseable range (e.g. "AMRAP"
// alone, or no target set) — the chart still renders, just without a band.
export function targetRepRange(reps) {
  const m = String(reps || "").match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (!m) return null;
  const min = Number(m[1]), max = Number(m[2]);
  return min < max ? { min, max } : null;
}

export { topSetPerDay } from "../../lib/workoutLogs.js";

// Set-log rows older than this are dropped from workout-review lists (not
// from the underlying data, and not from Best Lift/trend, which stay
// all-time) so months of training don't turn a review list into a
// never-ending scroll. Shared by the coach's and client's Workout Review.
export const REVIEW_WINDOW_DAYS = 30;
export function withinReviewWindow(dateStr) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REVIEW_WINDOW_DAYS);
  return dateStr >= cutoff.toISOString().split("T")[0];
}

// Scrollable log-entry list: fixed height so it doesn't grow the page (or
// shift under the reader's finger while scrolling) once there are more than
// a handful of sessions — internal scroll takes over instead.
export function LogEntryList({ rows }) {
  if (!rows.length) return <div style={{ fontSize: 12, color: S.muted, padding: "8px 0" }}>No sessions in the last {REVIEW_WINDOW_DAYS} days.</div>;
  return (
    <div style={{ maxHeight: rows.length > 5 ? 220 : "none", overflowY: rows.length > 5 ? "auto" : "visible", border: "1px solid " + S.border }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid " + S.border : "none" }}>
              <td style={{ padding: "7px 10px", fontSize: 11, color: S.muted, whiteSpace: "nowrap" }}>{r.date}</td>
              {r.exerciseName && <td style={{ padding: "7px 10px", fontSize: 11, color: S.text, whiteSpace: "nowrap" }}>{r.exerciseName}</td>}
              <td style={{ padding: "7px 10px", fontSize: 11, color: S.text, whiteSpace: "nowrap" }}>Set {r.sets ?? "—"}</td>
              <td style={{ padding: "7px 10px", fontSize: 11, color: S.text, whiteSpace: "nowrap" }}>{r.weight != null ? `${r.weight} lb` : "—"}</td>
              <td style={{ padding: "7px 10px", fontSize: 11, color: S.text, whiteSpace: "nowrap" }}>{r.reps != null ? `${r.reps} reps` : (r.time || "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoData({ label, onLogFirst }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 12 }}>
      <div style={{ fontSize: 12, color: S.muted }}>No sessions logged yet — {label} will appear here once you do.</div>
      <div style={{ width: "80%", height: 40, border: "1px dashed " + S.border, borderRadius: 4, position: "relative" }}>
        <div style={{ position: "absolute", bottom: 2, left: 4, fontSize: 9, color: S.border }}>0</div>
      </div>
      {onLogFirst && <Btn sm onClick={onLogFirst}>Log first session</Btn>}
    </div>
  );
}

export function WeightOverTimeChart({ chartData, isBodyweight, onLogFirst, compact }) {
  const dataKey = isBodyweight ? "reps" : "weight";
  const latest = chartData.length ? chartData[chartData.length - 1] : null;
  return (
    <CC title="Weight Over Time" sub={isBodyweight ? "Top-set reps · dates on x-axis" : "Top-set weight · dates on x-axis, lbs on y-axis"} height={compact ? 90 : 230}>
      {chartData.length === 0 ? (
        <NoData label="your weight trend" onLogFirst={onLogFirst} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: compact ? 16 : 20, right: 12, left: 0, bottom: compact ? 12 : 18 }}>
            {!compact && <CartesianGrid strokeDasharray="3 3" stroke={S.border} />}
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} hide={compact}
              label={{ value: "Date", position: "insideBottom", offset: compact ? -10 : -12, fontSize: 9, fill: "#888" }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} hide={compact} width={compact ? 0 : 34}
              label={isBodyweight ? undefined : { value: "lbs", angle: -90, position: "insideLeft", offset: 8, fontSize: 9, fill: "#888" }} />
            {!compact && <Tooltip {...TT} />}
            <Line type="monotone" dataKey={dataKey} stroke={S.accent2} strokeWidth={2}
              dot={(props) => {
                const isLast = latest && props.payload.date === latest.date;
                return isLast
                  ? <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill={S.accent2} stroke={S.surface} strokeWidth={2} />
                  : <circle key={props.key} cx={props.cx} cy={props.cy} r={compact ? 0 : 2} fill={S.accent2} />;
              }}
              label={(props) => {
                const isLast = props.index === chartData.length - 1;
                if (compact && !isLast) return null;
                return (
                  <text key={"lbl"+props.index} x={props.x} y={props.y - (compact ? 6 : 10)} textAnchor="middle"
                    fontSize={compact ? 10 : 10} fontWeight={isLast ? 700 : 500} fill={isLast ? S.accent2 : S.text}>
                    {props.value}
                  </text>
                );
              }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </CC>
  );
}

export function TopSetRepsChart({ chartData, targetRange, onLogFirst, compact }) {
  return (
    <CC title="Top-Set Reps" sub={targetRange ? `Target range ${targetRange.min}-${targetRange.max}` : "One bar per session"} height={compact ? 90 : 230}>
      {chartData.length === 0 ? (
        <NoData label="your rep trend" onLogFirst={onLogFirst} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: compact ? 16 : 22, right: 12, left: 0, bottom: compact ? 12 : 18 }}>
            {!compact && <CartesianGrid strokeDasharray="3 3" stroke={S.border} />}
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} hide={compact}
              label={{ value: "Date", position: "insideBottom", offset: compact ? -10 : -12, fontSize: 9, fill: "#888" }} />
            <YAxis tick={{ fontSize: 10, fill: "#666" }} hide={compact} width={compact ? 0 : 30}
              label={{ value: "Reps", angle: -90, position: "insideLeft", offset: 8, fontSize: 9, fill: "#888" }} />
            {!compact && <Tooltip {...TT} />}
            {targetRange && (
              <ReferenceArea y1={targetRange.min} y2={targetRange.max} fill={S.accent2} fillOpacity={0.12} stroke={S.accent2} strokeDasharray="4 4" strokeOpacity={0.5} />
            )}
            <Bar dataKey="reps" fill={S.accent} radius={[4, 4, 0, 0]}
              label={(props) => {
                const isLast = props.index === chartData.length - 1;
                if (compact && !isLast) return null;
                return (
                  <text key={"lbl"+props.index} x={props.x + props.width / 2} y={props.y - (compact ? 4 : 6)} textAnchor="middle"
                    fontSize={10} fontWeight={isLast ? 700 : 500} fill={S.text}>
                    {props.value}
                  </text>
                );
              }} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </CC>
  );
}
