import { useState } from "react";
import { S, RADIUS } from "../../theme.jsx";

// Collapsible "folder" for grouping content by training day. Closed by default;
// clicking the header row toggles it. Shared by the client Training Plan and the
// coach exercise editor so a multi-day program reads as folders, not one long list.
export function DayFolder({ title, meta, children, defaultOpen = false, headerAction }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.sm, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: open ? S.surface2 : "transparent", padding: "15px 18px" }}>
        <button onClick={() => setOpen((o) => !o)}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left", color: S.text }}>
          <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: S.accent, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
            {meta && <span style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{meta}</span>}
          </span>
          <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, flexShrink: 0 }}>{open ? "Hide" : "Open"}</span>
        </button>
        {headerAction && <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: 12 }}>{headerAction}</div>}
      </div>
      {open && <div style={{ padding: "16px 18px 18px" }}>{children}</div>}
    </div>
  );
}
