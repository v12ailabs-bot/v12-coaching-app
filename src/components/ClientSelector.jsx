import { useMemo, useState } from "react";
import { S, avatarFrom, COLORS } from "../theme.jsx";
import { StatusBadge, Tabs } from "./ui/index.js";

// Searchable, scrollable client directory for the Clients split workspace.
// Pure UI: takes the already-loaded client list and reports the selected id
// back up. The All/Active/Archived view can be controlled (pass
// `view`+`onViewChange`) when the parent already tracks that state for other
// logic (e.g. keeping the selection valid), or left uncontrolled.
const LOGGING_COLOR = { good: "#00c9a7", fair: "#f5a623", poor: S.danger };

// Optional `badgeFor(client)` renders a small secondary badge (e.g. logging
// consistency) to the right of each row, alongside the Active/Archived
// status badge — returns null/undefined to skip it for a given client.
export function ClientSelector({ clients, selectedId, onSelect, showViewTabs = true, view, onViewChange, badgeFor }) {
  const [query, setQuery] = useState("");
  const [internalView, setInternalView] = useState("active");
  const isControlled = view !== undefined;
  const activeView = isControlled ? view : internalView;
  const setView = (v) => (isControlled ? onViewChange?.(v) : setInternalView(v));

  const activeCount = clients.filter((c) => !c.archived).length;
  const archivedCount = clients.filter((c) => c.archived).length;

  const filtered = useMemo(() => {
    const pool = activeView === "all" ? clients : clients.filter((c) => (activeView === "archived" ? c.archived : !c.archived));
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.goal || "").toLowerCase().includes(q)
    );
  }, [clients, activeView, query]);

  // Coaching and program-only clients are different day-to-day workflows —
  // split into two labeled groups instead of one mixed list, on every view
  // (Archived stays a single flat list since the split matters less there).
  const groups = useMemo(() => {
    if (activeView === "archived") return [{ label: null, items: filtered }];
    const coaching = filtered.filter((c) => c.client_type !== "program_only");
    const programOnly = filtered.filter((c) => c.client_type === "program_only");
    const out = [];
    if (coaching.length) out.push({ label: "Coaching", items: coaching });
    if (programOnly.length) out.push({ label: "Program Only", items: programOnly });
    return out;
  }, [filtered, activeView]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients..."
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "14px 16px", fontSize: 15, outline: "none", borderRadius: 10 }}
      />
      {showViewTabs && (
        <Tabs
          tabs={[
            { key: "all", label: "All", badge: clients.length },
            { key: "active", label: "Active", badge: activeCount },
            { key: "archived", label: "Archived", badge: archivedCount },
          ]}
          active={activeView}
          onChange={setView}
        />
      )}

      <div style={{ maxHeight: 560, overflowY: "auto", border: "1px solid " + S.border, borderRadius: 10, background: S.surface }}>
        {filtered.length === 0 && (
          <div style={{ padding: "18px 16px", color: S.muted, fontSize: 13 }}>
            {query ? "No clients match your search." : activeView === "archived" ? "No archived clients." : activeView === "active" ? "No active clients yet." : "No clients yet."}
          </div>
        )}
        {(() => {
          let flatIndex = -1;
          return groups.map((group, gi) => (
            <div key={group.label || "flat"}>
              {group.label && (
                <div style={{ padding: "8px 14px", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, background: S.surface2, borderBottom: "1px solid " + S.border, borderTop: gi > 0 ? "1px solid " + S.border : "none" }}>
                  {group.label} ({group.items.length})
                </div>
              )}
              {group.items.map((c, i) => {
                flatIndex++;
                const isSel = selectedId === c.id;
                const isLastRow = gi === groups.length - 1 && i === group.items.length - 1;
                return (
                  <button key={c.id} onClick={() => onSelect(c.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "none",
                      borderBottom: isLastRow ? "none" : "1px solid " + S.border,
                      boxShadow: isSel ? "inset 3px 0 0 " + S.accent : "none",
                      background: isSel ? "rgba(255,106,0,.08)" : "transparent", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: COLORS[flatIndex % COLORS.length],
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
          ));
        })()}
      </div>
    </div>
  );
}
