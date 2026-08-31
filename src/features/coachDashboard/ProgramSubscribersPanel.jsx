import { S } from "../../theme.jsx";
import { CollapsibleSection } from "../../components/ui/index.js";
import { TrendPill } from "./QuickAnalytics.jsx";

const SCROLL_AFTER = 8;

// Program-only clients have no coach relationship, no check-in feature, and
// no risk/goal tracking — At Risk and Inactive don't apply to them, so they
// get their own simple list instead of being mixed into (and skewing) the
// coaching Client Overview table above. Collapsed by default (a dropdown,
// not an always-open table) so a large Program Only roster doesn't push the
// coaching board further down the page by default. Scrolls internally
// (sticky header) once open and the roster grows past SCROLL_AFTER.
// `monthlyRevenue`/`revenueTrendPct` are optional — the same dashboard-wide
// figure CoachStatCards shows (there's no per-subscriber price anywhere in
// the schema to break out a cohort-specific number from).
export function ProgramSubscribersPanel({ rows, openClient, monthlyRevenue, revenueTrendPct }) {
  if (rows.length === 0) return null;
  const scrolls = rows.length > SCROLL_AFTER;
  return (
    <CollapsibleSection title="Program Subscribers" summary={`${rows.length} client${rows.length === 1 ? "" : "s"}`}>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 14 }}>Self-guided program access, no coaching relationship — listed separately from coaching clients above.</div>
      {monthlyRevenue != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>Monthly Revenue</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>${monthlyRevenue.toLocaleString()}</span>
          <TrendPill deltaPct={revenueTrendPct} />
        </div>
      )}
      <div style={{ overflow: "auto", maxHeight: scrolls ? 420 : "none" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              {["Client", "Program", "Last Activity"].map((h) => (
                <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: S.surface, fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, textAlign: "left", padding: "8px 12px", borderBottom: "1px solid " + S.border, boxShadow: "0 1px 0 " + S.border }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => openClient(r.id)} style={{ cursor: "pointer" }}>
                <td style={{ padding: "12px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid " + S.border }}>{r.name}</td>
                <td style={{ padding: "12px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{r.programName}</td>
                <td style={{ padding: "12px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{r.lastActivity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
