import { useState } from "react";
import { S } from "../../theme.jsx";
import { Card, CardTitle, StatusBadge, Btn } from "../../components/ui/index.js";

// Compact version of the old "Needs Attention" card — same `needs` data
// (assessClientRisk, sorted by severity) and the same click-to-expand detail
// (flag detail + recommended action), just restyled to a shorter list with
// a link to the full Clients view instead of every client expanded at once.
export function AlertsPanel({ needs, openClient, setPage }) {
  const [openId, setOpenId] = useState(null);
  const top = needs.slice(0, 5);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <CardTitle>Alerts &amp; At-Risk Clients</CardTitle>
        {needs.length > 0 && <Btn sm teal onClick={() => setPage("clients")}>View All</Btn>}
      </div>
      {top.length === 0 ? (
        <div style={{ color: S.success, fontSize: 13, padding: "8px 0" }}>All clients are on track. Nice work.</div>
      ) : (
        top.map((a) => {
          const open = openId === a.client.id;
          return (
            <div key={a.client.id} style={{ borderBottom: "1px solid " + S.border }}>
              <div onClick={() => setOpenId(open ? null : a.client.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{a.client.name || a.client.email}</div>
                  <div style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.flags[0]?.label || "Needs attention"}</div>
                </div>
                <StatusBadge label={a.riskLevel === "High" ? "At Risk" : "Needs Attention"} tone={a.riskLevel === "High" ? "red" : "amber"} />
              </div>
              {open && (
                <div style={{ padding: "0 0 14px 4px" }}>
                  {a.flags.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: S.text, padding: "6px 0", borderTop: i === 0 ? "1px solid " + S.border : "none", paddingTop: i === 0 ? 10 : 6 }}>
                      <div><span style={{ fontWeight: 600, color: f.tone === "red" ? S.danger : S.warning }}>{f.label}.</span> {f.detail}</div>
                      {f.action && <div style={{ color: S.muted, marginTop: 2 }}>→ {f.action}</div>}
                    </div>
                  ))}
                  <div style={{ marginTop: 10 }}><Btn sm teal onClick={() => openClient(a.client.id)}>Open Client →</Btn></div>
                </div>
              )}
            </div>
          );
        })
      )}
    </Card>
  );
}
