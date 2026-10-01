import { S } from "../../theme.jsx";
import { Fld } from "./Fld.jsx";
import { Inp } from "./Inp.jsx";
import { todayStr } from "../../lib/dates.js";

// Lets a client pick a past date to log/catch up a missed check-in, bounded
// by `min`/`max` so the browser's own date picker can't select outside the
// allowed window (isWithinBackdateWindow/isWithinWeeklyBackdateWindow in
// src/lib/dates.js still re-validate before any write, since the browser
// constraint alone isn't trustworthy).
export function BackdateField({ value, onChange, min, label = "Date" }) {
  const max = todayStr();
  const isToday = value === max;
  return (
    <Fld label={label}>
      <Inp type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
      {!isToday && <div style={{ fontSize: 11, color: S.warning, marginTop: 6 }}>Logging for a past date — this will be flagged as backdated.</div>}
    </Fld>
  );
}
