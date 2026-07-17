import { useState } from "react";
import { S, RADIUS } from "../../theme.jsx";

// Generalized accordion primitive for progressive disclosure — same box
// treatment as the existing DayFolder (used by the Library page), so every
// collapsible section across the app reads the same at a glance instead of
// looking flat/empty before it's opened. Adds an optional right-side
// summary/badge slot and support for controlled expand state (so a parent
// page can track which sections are open across the whole page in one place,
// e.g. the unified client detail page's session-only expand state).
export function CollapsibleSection({ title, summary, defaultExpanded = false, expanded, onToggle, children }) {
  const isControlled = expanded !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultExpanded);
  const open = isControlled ? expanded : internalOpen;
  const toggle = () => (isControlled ? onToggle?.(!open) : setInternalOpen((o) => !o));

  return (
    <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.sm, overflow: "hidden", marginBottom: 12 }}>
      <button onClick={toggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: open ? S.surface2 : "transparent", border: "none", cursor: "pointer",
          padding: "15px 18px", textAlign: "left", color: S.text }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: S.accent, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          {summary != null && <span style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{summary}</span>}
        </span>
        <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, flexShrink: 0 }}>{open ? "Hide" : "Open"}</span>
      </button>
      {open && <div style={{ padding: "16px 18px 18px" }}>{children}</div>}
    </div>
  );
}
