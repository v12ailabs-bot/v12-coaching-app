import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

const SCROLL_AFTER = 10;

// Most recent coach_notes across all clients (existing table, existing
// per-client notes feature) — read-only except for delete, which removes the
// note outright (same as the per-client Coach Notes section it's mirrored
// from — no confirmation dialog there either). Scrolls internally once past
// SCROLL_AFTER items instead of growing the page indefinitely.
export function RecentNotes({ nameOf, openClient }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("coach_notes").select("id,client_id,body,created_at").order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => { setNotes(data || []); setLoading(false); });
  }, []);

  const remove = async (e, id) => {
    e.stopPropagation();
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("coach_notes").delete().eq("id", id);
  };

  return (
    <Card>
      <SectionTitle>Notes &amp; Updates</SectionTitle>
      {loading ? (
        <div className="spinner" style={{ margin: "20px auto" }} />
      ) : notes.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13 }}>No notes yet.</div>
      ) : (
        <div style={{ maxHeight: notes.length > SCROLL_AFTER ? 420 : "none", overflowY: "auto" }}>
          {notes.map((n, i) => (
            <div key={n.id} onClick={() => openClient(n.client_id)}
              style={{ padding: "9px 2px", borderBottom: i < notes.length - 1 ? "1px solid " + S.border : "none", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: S.text }}>{nameOf(n.client_id)}</span>
                  <span style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap" }}>{(n.created_at || "").slice(0, 10)}</span>
                </div>
                <div style={{ fontSize: 12, color: S.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.body}</div>
              </div>
              <button onClick={(e) => remove(e, n.id)} title="Remove note"
                style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 15, padding: "0 2px", flexShrink: 0, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
