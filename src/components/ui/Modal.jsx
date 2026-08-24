import { S, RADIUS, SHADOW } from "../../theme.jsx";

// No modal/overlay primitive existed anywhere in the app before this pass —
// built from scratch for the CRM lead detail/add panel and reusable
// wherever else this redesign needs a focused overlay (e.g. Client Detail's
// quick actions). Backdrop click and an explicit close button both close it.
export function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: width, background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.lg, boxShadow: SHADOW.card, padding: 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: S.muted, fontSize: 20, lineHeight: 1, padding: 4, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
