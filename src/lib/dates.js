// Extracted out of theme.jsx (a UI/styling file) so pure date logic can be
// imported from server-side (Node) code without pulling in JSX -- found
// necessary when api/_lib/headCoachCoreState.ts tried to reuse
// assessClientRisk (src/lib/scoring.js), which depended on this through
// theme.jsx and failed to load outside a bundler. theme.jsx re-exports both
// names unchanged, so none of its existing importers needed to change.

// Formats a Date as YYYY-MM-DD using its local calendar fields (not UTC).
// `new Date().toISOString()` converts to UTC first, which rolls to
// "tomorrow" in the evening for any timezone west of UTC (e.g. from
// ~4-8pm in US timezones) -- that off-by-one broke check-in dates for
// evening submissions, so this formats from local getFullYear/getMonth/
// getDate instead.
export function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayStr = () => localDateStr(new Date());

// How far back a client may backdate a daily check-in.
export function isWithinBackdateWindow(dateStr, days = 7, today = todayStr()) {
  const diff = Math.round((new Date(today) - new Date(dateStr)) / 86400000);
  return diff >= 0 && diff <= days;
}

// Week-start (Sunday) for the week containing `today` — matches the
// Sunday-based week key daily_checkins/weekly_checkins already use elsewhere.
export function weekStartStr(today = todayStr()) {
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return localDateStr(d);
}

// Weekly check-ins are keyed to week-start Sundays, so a literal day-count
// doesn't map cleanly onto "how far back can I log." A client may log the
// current week or the immediately preceding week, regardless of exactly how
// many days that is.
export function isWithinWeeklyBackdateWindow(weekDateStr, today = todayStr()) {
  const current = weekStartStr(today);
  const prior = (() => { const d = new Date(current + "T00:00:00"); d.setDate(d.getDate() - 7); return localDateStr(d); })();
  return weekDateStr === current || weekDateStr === prior;
}

// Start date for a Progress-tab range selector ("30D"/"3M"/"6M"/"1Y"/"All").
// "All" has no lower bound -- callers should skip filtering entirely rather
// than compare against a sentinel date.
const RANGE_DAYS = { "30D": 30, "3M": 91, "6M": 182, "1Y": 365 };
export function rangeStartStr(range, today = todayStr()) {
  if (range === "All" || !RANGE_DAYS[range]) return null;
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() - RANGE_DAYS[range]);
  return localDateStr(d);
}
