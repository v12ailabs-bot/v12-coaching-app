import { useState } from "react";
import { S } from "../../theme.jsx";

// Generalized accordion primitive for progressive disclosure — same chevron/
// toggle idiom as the existing DayFolder, but with an optional right-side
// summary/badge slot and support for controlled expand state (so a parent
// page can track which sections are open across the whole page in one place,
// e.g. the unified client detail page's session-only expand state).
//
// Deliberately chromeless (no background/border/shadow of its own): every
// section this wraps already renders its own Card, so giving the wrapper a
// second box would just stack rectangles inside rectangles. This is a plain
// clickable header with a hairline divider — whitespace does the separating.
export function CollapsibleSection({ title, summary, defaultExpanded = false, expanded, onToggle, children }) {
  const isControlled = expanded !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultExpanded);
  const open = isControlled ? expanded : internalOpen;
  const toggle = () => (isControlled ? onToggle?.(!open) : setInternalOpen((o) => !o));

  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={toggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "transparent", border: "none", borderBottom: "1px solid " + S.border, cursor: "pointer",
          padding: "12px 4px", textAlign: "left", color: S.text }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: S.accent, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        </span>
        {summary != null && (
          <span style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{summary}</span>
        )}
      </button>
      {open && <div style={{ paddingTop: 16 }}>{children}</div>}
    </div>
  );
}
