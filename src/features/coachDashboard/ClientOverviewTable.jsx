import { useState } from "react";
import { S } from "../../theme.jsx";
import { Card, CardTitle, StatusBadge } from "../../components/ui/index.js";

const STATUS_TONE = { "On Track": "green", "Needs Attention": "amber", "At Risk": "red" };
const FILTERS = [
  { id: "all", label: "All Clients" },
  { id: "active", label: "Active" },
  { id: "at_risk", label: "At Risk" },
  { id: "inactive", label: "Inactive" },
];

// `rows` are precomputed by CoachHome from assessClientRisk/loggingAssessment —
// this component only filters and renders. `bucket` (active/at_risk/inactive)
// is a mutually-exclusive grouping for the filter tabs, separate from the
// finer-grained `status` badge shown per row (On Track/Needs Attention/At Risk).
export function ClientOverviewTable({ rows, openClient }) {
  const [filter, setFilter] = useState("all");
  const counts = { all: rows.length, active: rows.filter((r) => r.bucket === "active").length, at_risk: rows.filter((r) => r.bucket === "at_risk").length, inactive: rows.filter((r) => r.bucket === "inactive").length };
  const shown = filter === "all" ? rows : rows.filter((r) => r.bucket === filter);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <CardTitle>Client Overview</CardTitle>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + (filter === f.id ? S.accent : S.border), background: filter === f.id ? "rgba(255,106,0,.1)" : "transparent", color: filter === f.id ? S.accent : S.muted, borderRadius: 8 }}>
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13, padding: "16px 0" }}>No clients in this group.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                {["Client", "Program", "Progress", "Check-In", "Status", "Last Activity"].map((h) => (
                  <th key={h} style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, textAlign: "left", padding: "8px 12px", borderBottom: "1px solid " + S.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => openClient(r.id)} style={{ cursor: "pointer" }}>
                  <td style={{ padding: "12px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid " + S.border }}>{r.name}</td>
                  <td style={{ padding: "12px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>
                    {r.programName}{r.phaseLabel ? <div style={{ fontSize: 10 }}>{r.phaseLabel}</div> : null}
                  </td>
                  <td style={{ padding: "12px", borderBottom: "1px solid " + S.border, minWidth: 100 }}>
                    {r.progress == null ? (
                      <span style={{ fontSize: 12, color: S.muted }}>—</span>
                    ) : (
                      <>
                        <div style={{ height: 6, background: S.surface2, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: r.progress + "%", height: "100%", background: S.accent }} />
                        </div>
                        <div style={{ fontSize: 11, color: S.muted, marginTop: 3 }}>{r.progress}%</div>
                      </>
                    )}
                  </td>
                  <td style={{ padding: "12px", fontSize: 13, color: S.text, borderBottom: "1px solid " + S.border }}>{r.checkin == null ? <span style={{ color: S.muted }}>—</span> : r.checkin + "%"}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid " + S.border }}><StatusBadge label={r.status} tone={STATUS_TONE[r.status]} /></td>
                  <td style={{ padding: "12px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{r.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
