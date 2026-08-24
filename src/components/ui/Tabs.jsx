import { S, FOCUS_RING } from "../../theme.jsx";

// Persistent horizontal tabs — the shared primitive the app never had.
// Replaces hand-rolled, per-call-site button rows (CRM status filters,
// workout exercise selector, client-detail accordions) with one accessible
// component. `tabs` is [{ key, label, badge? }]; `active` is the current key.
// Never wraps to a second line (that shifts everything below it up/down on
// resize) — `overflowX: auto` scrolls sideways instead if it doesn't fit.
// `compact` shrinks padding/font for tight spaces (e.g. the ~320px client
// directory column) so 4 tabs fit without needing to scroll at all.
export function Tabs({ tabs, active, onChange, compact = false }) {
  return (
    <div role="tablist" style={{ display: "flex", flexWrap: "nowrap", gap: compact ? 2 : 4, borderBottom: "1px solid " + S.border, overflowX: "auto" }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              padding: compact ? "9px 8px" : "12px 16px",
              fontSize: compact ? 12 : 13,
              fontWeight: 600,
              color: isActive ? S.text : S.muted,
              borderBottom: "2px solid " + (isActive ? S.accent : "transparent"),
              marginBottom: -1,
              display: "flex",
              alignItems: "center",
              gap: compact ? 5 : 8,
              flexShrink: 0,
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = FOCUS_RING; }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
          >
            {t.label}
            {t.badge != null && (
              <span style={{
                fontSize: compact ? 9 : 10, fontWeight: 700, padding: compact ? "1px 4px" : "1px 6px", borderRadius: 10,
                background: isActive ? "rgba(255,106,0,.16)" : S.surface2,
                color: isActive ? S.accent : S.muted,
              }}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
