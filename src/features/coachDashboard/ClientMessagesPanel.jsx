import { useState } from "react";
import { S, useIsMobile } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

// Same `messages` data (weekly check-in questions/adjustments/low-confidence/
// felt-weaker flags, last 14 days) the old full-width "Client Messages &
// Flags" collapsible bar showed — now a compact panel living in the Overview
// grid's side column instead of a separate dropdown bar below it. On mobile
// it starts collapsed (a coach can have several of these at once and it was
// eating the whole screen fully expanded); desktop keeps it always open.
export function ClientMessagesPanel({ messages, nameOf, openClient }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const body = (
    messages.length === 0 ? (
      <div style={{ color: S.muted, fontSize: 13 }}>No questions or flags from the last 14 days.</div>
    ) : (
      messages.slice(0, 5).map((m, i) => (
        <div key={i} onClick={() => openClient(m.id)}
          style={{ background: S.surface2, border: "1px solid " + S.border, borderLeft: "3px solid " + (m.items.some((x) => x.tone === "red") ? S.danger : S.warning), padding: "10px 14px", cursor: "pointer", marginBottom: i < messages.length - 1 ? 8 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{nameOf(m.id)}</div>
            <div style={{ fontSize: 10, color: S.muted, whiteSpace: "nowrap" }}>{m.date}</div>
          </div>
          {m.items.slice(0, 2).map((it, j) => (
            <div key={j} style={{ marginBottom: 4 }}>
              <span style={{ padding: "2px 7px", fontSize: 9, fontWeight: 600, marginRight: 6, background: it.tone === "red" ? "rgba(255,107,91,.16)" : "rgba(250,204,21,.14)", color: it.tone === "red" ? S.danger : S.warning }}>{it.label}</span>
              {it.text && <span style={{ fontSize: 12, color: S.text }}>{it.text.length > 90 ? it.text.slice(0, 90) + "…" : it.text}</span>}
            </div>
          ))}
        </div>
      ))
    )
  );

  if (!isMobile) {
    return (
      <Card>
        <SectionTitle>Client Messages &amp; Flags</SectionTitle>
        {body}
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "transparent", border: "none", padding: "18px 20px", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: S.text }}>Client Messages &amp; Flags {messages.length > 0 && <span style={{ fontSize: 12, color: S.muted, fontWeight: 400 }}>({messages.length})</span>}</span>
        <span style={{ fontSize: 12, color: S.accent, transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", flexShrink: 0 }}>▶</span>
      </button>
      {open && <div style={{ padding: "0 20px 20px" }}>{body}</div>}
    </Card>
  );
}
