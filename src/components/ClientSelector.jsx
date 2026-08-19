import { useMemo, useState } from "react";
import { S, avatarFrom, COLORS } from "../theme.jsx";

// Searchable, scrollable client picker — replaces the unpaginated button-grid
// that used to be duplicated in ClientsPanel and CoachProgress. Pure UI: takes
// the already-loaded client list and reports the selected id back up, so each
// page keeps its own data-fetching untouched. The archived/active toggle can
// be controlled (pass `archived`+`onToggleArchived`) when the parent already
// tracks that state for other logic (e.g. keeping the selection valid), or
// left uncontrolled for a simple drop-in.
const LOGGING_COLOR = { good: "#00c9a7", fair: "#f5a623", poor: "#ff6b5b" };

// Optional `badgeFor(client)` renders a small status badge (e.g. logging
// consistency) to the right of each row — returns null/undefined to skip it
// for a given client (e.g. program-only clients with no check-in data).
export function ClientSelector({ clients, selectedId, onSelect, showArchivedToggle = true, archived, onToggleArchived, badgeFor }) {
  const [query, setQuery] = useState("");
  const [internalArchived, setInternalArchived] = useState(false);
  const isControlled = archived !== undefined;
  const showArchived = isControlled ? archived : internalArchived;
  const setShowArchived = (next) => (isControlled ? onToggleArchived?.(next) : setInternalArchived(next));

  const activeCount = clients.filter(c => !c.archived).length;
  const archivedCount = clients.filter(c => c.archived).length;

  const filtered = useMemo(() => {
    const pool = clients.filter(c => showArchived ? c.archived : !c.archived);
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.goal || "").toLowerCase().includes(q)
    );
  }, [clients, showArchived, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search clients…"
          style={{ flex: "1 1 180px", minWidth: 140, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 13, outline: "none", borderRadius: 8 }}
        />
        {showArchivedToggle && (
          <button onClick={() => setShowArchived(!showArchived)}
            style={{ padding: "9px 14px", fontSize: 10, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", border: "1px solid " + S.border, borderRadius: 8, background: "transparent", color: showArchived ? S.accent : S.muted, whiteSpace: "nowrap" }}>
            {showArchived ? `← Active (${activeCount})` : `Archived (${archivedCount})`}
          </button>
        )}
      </div>

      <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid " + S.border, borderRadius: 10, background: S.surface }}>
        {filtered.length === 0 && (
          <div style={{ padding: "18px 16px", color: S.muted, fontSize: 13 }}>
            {query ? "No clients match your search." : showArchived ? "No archived clients." : "No active clients yet."}
          </div>
        )}
        {filtered.map((c, i) => {
          const isSel = selectedId === c.id;
          return (
            <button key={c.id} onClick={() => onSelect(c.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "none",
                borderBottom: i < filtered.length - 1 ? "1px solid " + S.border : "none",
                background: isSel ? "rgba(255,106,0,.08)" : "transparent", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: COLORS[i % COLORS.length],
                color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                {avatarFrom(c.name || c.email)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isSel ? S.accent : S.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name || c.email}
                </div>
                <div style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.goal || "No goal set"}
                </div>
              </div>
              {badgeFor && badgeFor(c) && (
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: LOGGING_COLOR[badgeFor(c).level] || S.muted, flexShrink: 0, whiteSpace: "nowrap" }}>
                  {badgeFor(c).label}
                </span>
              )}
              {c.archived && (
                <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, flexShrink: 0 }}>Archived</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
