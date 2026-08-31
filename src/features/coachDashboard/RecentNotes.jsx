import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

const SCROLL_AFTER = 10;

// Most recent coach_notes across all clients (existing table, existing
// per-client notes feature) — delete, same as before, plus a "+ New Note"
// inline create form (a team-wide note needs a client to attach to, same
// as the per-client Coach Notes section this mirrors — picks the most
// recently active client by default rather than forcing a full picker for
// what's meant to be a quick team update). Scrolls internally once past
// SCROLL_AFTER items instead of growing the page indefinitely.
export function RecentNotes({ nameOf, openClient, clientIds }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("coach_notes").select("id,client_id,body,created_at").order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => { setNotes(data || []); setLoading(false); });
  }, []);

  const remove = async (e, id) => {
    e.stopPropagation();
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("coach_notes").delete().eq("id", id);
  };

  const startAdd = () => { setAdding(true); setClientId((clientIds || [])[0] || ""); setBody(""); };
  const save = async () => {
    if (!clientId || !body.trim()) return;
    setSaving(true);
    const { data } = await supabase.from("coach_notes").insert({ client_id: clientId, body: body.trim() }).select("id,client_id,body,created_at").maybeSingle();
    setSaving(false);
    if (data) setNotes((prev) => [data, ...prev]);
    setAdding(false); setBody("");
  };

  return (
    <Card>
      <SectionTitle action={<Btn sm teal onClick={startAdd}>+ New Note</Btn>}>Notes &amp; Updates</SectionTitle>
      {adding && (
        <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            style={{ width: "100%", background: S.surface, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none", marginBottom: 8 }}>
            {(clientIds || []).map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
          </select>
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Note..."
            style={{ width: "100%", background: S.surface, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none", resize: "vertical", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn sm onClick={save} disabled={saving || !body.trim()}>{saving ? "Saving..." : "Save"}</Btn>
            <button onClick={() => setAdding(false)} style={{ padding: "6px 12px", fontSize: 11, background: "transparent", color: S.muted, border: "1px solid " + S.border, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="spinner" style={{ margin: "20px auto" }} />
      ) : notes.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13 }}>No notes yet.</div>
      ) : (
        <div style={{ maxHeight: notes.length > SCROLL_AFTER ? 420 : "none", overflowY: "auto" }}>
          {notes.map((n, i) => (
            <div key={n.id} onClick={() => openClient(n.client_id)}
              style={{ padding: "12px 4px", borderBottom: i < notes.length - 1 ? "1px solid " + S.border : "none", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{nameOf(n.client_id)}</span>
                  <span style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap" }}>{(n.created_at || "").slice(0, 10)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: S.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.body}</div>
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
