import { useState } from "react";
import { S } from "../../../theme.jsx";
import { StatusBadge } from "../../../components/ui/index.js";

// Read-only plan history (program_phase_revisions, newest first). Version 1 is
// the original plan; later versions are revisions. There is deliberately no
// restore button: history is a record, and restoring would be a destructive
// write the coach should do by editing the draft.
export function PlanHistory({ revisions }) {
  const [open, setOpen] = useState(null);
  if (!revisions.length) return null;
  const original = revisions[revisions.length - 1];
  return (
    <div style={{ marginTop: 22, borderTop: "1px solid " + S.border, paddingTop: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 8 }}>Plan history</div>
      {revisions.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid " + S.border, padding: "8px 0" }}>
          <button onClick={() => setOpen(open === r.id ? null : r.id)} style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", background: "none", border: "none", cursor: "pointer", color: S.text, textAlign: "left", padding: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>v{r.version}</span>
            <span style={{ fontSize: 12, color: S.muted, flex: 1 }}>{new Date(r.created_at).toLocaleString()}</span>
            {r.id === original.id && <StatusBadge label="Original" tone="green" />}
            <StatusBadge label={r.source === "ai_generated" ? "AI-generated" : "Edited"} tone="neutral" />
            <span style={{ color: S.muted, fontSize: 11 }}>{open === r.id ? "▲" : "▼"}</span>
          </button>
          {open === r.id && (
            <div style={{ marginTop: 8, fontSize: 12, color: S.muted, lineHeight: 1.6 }}>
              {(r.snapshot || []).map((p, i) => (
                <div key={i}>{i + 1}. <span style={{ color: S.text }}>{p.phase}</span>{p.week_start != null ? ` — weeks ${p.week_start}–${p.week_end}` : ""}{p.training_focus ? ` · ${p.training_focus}` : ""}{(p.exit_criteria || []).length ? ` · ${p.exit_criteria.length} exit criteria` : ""}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
