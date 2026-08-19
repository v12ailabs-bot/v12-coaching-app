import { S } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

const SCROLL_AFTER = 8;

// Program-only clients have no coach relationship, no check-in feature, and
// no risk/goal tracking — At Risk and Inactive don't apply to them, so they
// get their own simple list instead of being mixed into (and skewing) the
// coaching Client Overview table above. Scrolls internally (sticky header)
// once the roster grows past SCROLL_AFTER, same pattern as Client Overview.
export function ProgramSubscribersPanel({ rows, openClient }) {
  if (rows.length === 0) return null;
  const scrolls = rows.length > SCROLL_AFTER;
  return (
    <Card>
      <SectionTitle>Program Subscribers <span style={{ fontSize: 12, color: S.muted, fontWeight: 400, marginLeft: 6 }}>({rows.length})</span></SectionTitle>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 14 }}>Self-guided program access, no coaching relationship — listed separately from coaching clients above.</div>
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
    </Card>
  );
}
