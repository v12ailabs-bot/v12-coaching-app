import { useMemo, useState } from "react";
import { S, avatarFrom, COLORS } from "../theme.jsx";
import { StatusBadge } from "./ui/index.js";

// Searchable, scrollable client directory for the Clients split workspace.
// Pure UI: takes the already-loaded client list and reports the selected id
// back up. The view (All/Coaching/Program Only/Archived) can be controlled
// (pass `view`+`onViewChange`) when the parent already tracks that state for
// other logic (e.g. keeping the selection valid), or left uncontrolled.
const LOGGING_COLOR = { good: "#00c9a7", fair: "#f5a623", poor: S.danger };

// Optional `badgeFor(client)` renders a small secondary badge (e.g. logging
// consistency) to the right of each row, alongside the Active/Archived
// status badge — returns null/undefined to skip it for a given client.
export function ClientSelector({ clients, selectedId, onSelect, showViewTabs = true, view, onViewChange, badgeFor }) {
  const [query, setQuery] = useState("");
  const [internalView, setInternalView] = useState("coaching");
  const isControlled = view !== undefined;
  const activeView = isControlled ? view : internalView;
  const setView = (v) => (isControlled ? onViewChange?.(v) : setInternalView(v));

  const coachingCount = clients.filter((c) => !c.archived && c.client_type !== "program_only").length;
  const programOnlyCount = clients.filter((c) => !c.archived && c.client_type === "program_only").length;
  const archivedCount = clients.filter((c) => c.archived).length;

  const filtered = useMemo(() => {
    const pool = clients.filter((c) => {
      if (activeView === "all") return true;
      if (activeView === "archived") return c.archived;
      if (c.archived) return false;
      return activeView === "program_only" ? c.client_type === "program_only" : c.client_type !== "program_only";
    });
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.goal || "").toLowerCase().includes(q)
    );
  }, [clients, activeView, query]);

  const emptyLabel = {
    all: "No clients yet.", coaching: "No coaching clients yet.",
    program_only: "No program-only clients yet.", archived: "No archived clients.",
  }[activeView];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients..."
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "14px 16px", fontSize: 15, outline: "none", borderRadius: 10 }}
      />
      {showViewTabs && (
        // A 2x2 grid, not the shared horizontally-scrolling Tabs bar — four
        // labels with count badges ("Program Only" alone is 12+ characters)
        // never fit this column's ~280px of usable width in one row without
        // scrolling to see the rest.
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { key: "all", label: "All", badge: clients.length },
            { key: "coaching", label: "Coaching", badge: coachingCount },
            { key: "program_only", label: "Program Only", badge: programOnlyCount },
            { key: "archived", label: "Archived", badge: archivedCount },
          ].map((t) => {
            const isActive = t.key === activeView;
            return (
              <button key={t.key} onClick={() => setView(t.key)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 6px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  cursor: "pointer", borderRadius: 8, border: "1px solid " + (isActive ? S.accent : S.border),
                  background: isActive ? "rgba(255,106,0,.12)" : "transparent", color: isActive ? S.accent : S.text }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, flexShrink: 0,
                  background: isActive ? "rgba(255,106,0,.16)" : S.surface2, color: isActive ? S.accent : S.muted }}>
                  {t.badge}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ maxHeight: 560, overflowY: "auto", border: "1px solid " + S.border, borderRadius: 10, background: S.surface }}>
        {filtered.length === 0 && (
          <div style={{ padding: "18px 16px", color: S.muted, fontSize: 13 }}>
            {query ? "No clients match your search." : emptyLabel}
          </div>
        )}
        {filtered.map((c, i) => {
          const isSel = selectedId === c.id;
          return (
            <button key={c.id} onClick={() => onSelect(c.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "none",
                borderBottom: i < filtered.length - 1 ? "1px solid " + S.border : "none",
                boxShadow: isSel ? "inset 3px 0 0 " + S.accent : "none",
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
              <StatusBadge label={c.archived ? "Archived" : "Active"} tone={c.archived ? "neutral" : "green"} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
