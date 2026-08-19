import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";

// Most recent coach_notes across all clients (existing table, existing
// per-client notes feature) — a read-only feed here; adding a note still
// happens from that client's detail page, since a note always belongs to one.
export function RecentNotes({ nameOf, openClient }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("coach_notes").select("id,client_id,body,created_at").order("created_at", { ascending: false }).limit(6)
      .then(({ data }) => { setNotes(data || []); setLoading(false); });
  }, []);

  return (
    <Card>
      <CardTitle>Notes &amp; Updates</CardTitle>
      {loading ? (
        <div className="spinner" style={{ margin: "20px auto" }} />
      ) : notes.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13 }}>No notes yet.</div>
      ) : (
        notes.map((n, i) => (
          <div key={n.id} onClick={() => openClient(n.client_id)}
            style={{ padding: "9px 0", borderBottom: i < notes.length - 1 ? "1px solid " + S.border : "none", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: S.text }}>{nameOf(n.client_id)}</span>
              <span style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap" }}>{(n.created_at || "").slice(0, 10)}</span>
            </div>
            <div style={{ fontSize: 12, color: S.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.body}</div>
          </div>
        ))
      )}
    </Card>
  );
}
