import { useEffect } from "react";
import { S, RADIUS, SHADOW } from "../../theme.jsx";

// No modal/overlay primitive existed anywhere in the app before this pass —
// built from scratch for the CRM lead detail/add panel and reusable
// wherever else this redesign needs a focused overlay (e.g. Client Detail's
// quick actions). Backdrop click and an explicit close button both close it.
// The panel itself never moves while you scroll: the page behind is locked
// and the title stays put while the content scrolls inside the panel (long
// editors used to scroll the whole popup, header and all, up out of view).
export function Modal({ title, onClose, children, width = 560 }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const narrow = typeof window !== "undefined" && window.innerWidth < 600;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: narrow ? "max(12px, env(safe-area-inset-top)) 8px max(12px, env(safe-area-inset-bottom))" : "32px 16px", overflow: "hidden", overscrollBehavior: "contain" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: width, maxHeight: "100%", minWidth: 0, display: "flex", flexDirection: "column", background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.lg, boxShadow: SHADOW.card, padding: narrow ? 14 : 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12, flexShrink: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: S.muted, fontSize: 20, lineHeight: 1, padding: 4, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", minHeight: 0, flex: 1, margin: "0 -8px", padding: "0 8px" }}>{children}</div>
      </div>
    </div>
  );
}
