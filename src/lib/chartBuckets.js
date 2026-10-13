import { todayStr, weekStartStr, localDateStr } from "./dates.js";

// Trend-chart bucketing. 7D = one point per day; 30D = one point per week
// (Sunday-start, the same week key the app's weekly check-ins use); 3M/6M/1Y/All
// = one point per month. Each point is the AVERAGE of the days that have a real
// value — a missing day is skipped, never counted as zero — and carries how many
// entries it is based on (`n_<key>`). Computed from raw rows; storage untouched.
export const RANGES = ["7D", "30D", "3M", "6M", "1Y", "All"];
const RANGE_DAYS = { "7D": 7, "30D": 30, "3M": 91, "6M": 182, "1Y": 365 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parse = (s) => new Date(s + "T00:00:00");
const md = (s) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`;

export const granularityFor = (range) => (range === "7D" ? "day" : range === "30D" ? "week" : "month");

function bucketOf(date, gran) {
  if (gran === "day") return { key: date, label: date.slice(5), full: md(date) + ", " + date.slice(0, 4) };
  if (gran === "week") {
    const start = weekStartStr(date);
    const end = parse(start); end.setDate(end.getDate() + 6);
    const endStr = localDateStr(end);
    const label = start.slice(5, 7) === endStr.slice(5, 7) ? `${md(start)}-${Number(endStr.slice(8, 10))}` : `${md(start)}-${md(endStr)}`;
    return { key: start, label, full: `Week of ${md(start)}, ${start.slice(0, 4)}` };
  }
  const key = date.slice(0, 7), name = MONTHS[Number(key.slice(5)) - 1];
  return { key, label: name, full: `${name} ${key.slice(0, 4)}` };
}

export function bucketSeries(rows, keys, range, today = todayStr()) {
  const days = RANGE_DAYS[range];
  let from = null;
  if (days) { const d = parse(today); d.setDate(d.getDate() - (days - 1)); from = localDateStr(d); }
  const gran = granularityFor(range);
  const map = new Map();
  for (const r of rows || []) {
    if (!r.date || (from && r.date < from) || r.date > today) continue;
    const b = bucketOf(r.date, gran);
    const acc = map.get(b.key) || { ...b, sums: {}, ns: {} };
    for (const k of keys) {
      const v = r[k];
      if (typeof v !== "number" || !Number.isFinite(v)) continue; // missing ≠ 0
      acc.sums[k] = (acc.sums[k] || 0) + v;
      acc.ns[k] = (acc.ns[k] || 0) + 1;
    }
    map.set(b.key, acc);
  }
  return [...map.values()]
    .filter((b) => keys.some((k) => b.ns[k]))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => {
      const p = { key: b.key, label: b.label, full: b.full };
      for (const k of keys) if (b.ns[k]) { p[k] = Math.round((b.sums[k] / b.ns[k]) * 100) / 100; p["n_" + k] = b.ns[k]; }
      return p;
    });
}

// At most `max` evenly spread x-axis keys (always including first and last).
export function pickTicks(points, max) {
  const n = points.length;
  if (n <= max) return points.map((p) => p.key);
  const idx = new Set();
  for (let i = 0; i < max; i++) idx.add(Math.round((i * (n - 1)) / (max - 1)));
  return [...idx].sort((a, b) => a - b).map((i) => points[i].key);
}

// How many labels fit without touching, capped at 6: ~6.2px per character at the
// 10px axis font plus a gap, measured against the widest label.
export function maxLabelsFor(width, points) {
  const widest = points.reduce((m, p) => Math.max(m, p.label.length), 1);
  return Math.max(2, Math.min(6, Math.floor(width / (widest * 6.2 + 16))));
}
