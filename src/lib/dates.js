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
