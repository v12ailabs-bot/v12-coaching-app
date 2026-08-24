import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn } from "../../../components/ui/index.js";

// Private coach notes on a client.
export function CoachNotes({ clientId }) {
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("coach_notes").select("*").eq("client_id", clientId)
      .order("pinned", { ascending: false }).order("created_at", { ascending: false });
    setNotes(data || []);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await supabase.from("coach_notes").insert({ client_id: clientId, body: body.trim() });
    setBody(""); setSaving(false); load();
  };
  const togglePin = async (n) => { await supabase.from("coach_notes").update({ pinned: !n.pinned }).eq("id", n.id); load(); };
  const remove = async (n) => { await supabase.from("coach_notes").delete().eq("id", n.id); load(); };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Coach Notes (private)</CardTitle>
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a private note about this client..."
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 10 }} />
      <Btn sm onClick={add} disabled={saving}>{saving ? "Saving..." : "Add Note"}</Btn>
      <div style={{ marginTop: 16 }}>
        {notes.length === 0 && <div style={{ color: S.muted, fontSize: 13 }}>No notes yet.</div>}
        {notes.map((n) => (
          <div key={n.id} style={{ background: S.surface2, border: "1px solid " + S.border, borderLeft: n.pinned ? "3px solid " + S.neon : "1px solid " + S.border, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 8 }}>{n.body}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: S.muted }}>{(n.created_at || "").slice(0, 10)}</span>
              <div style={{ display: "flex", gap: 14 }}>
                <button onClick={() => togglePin(n)} style={{ background: "none", border: "none", color: n.pinned ? S.neon : S.muted, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{n.pinned ? "Unpin" : "Pin"}</button>
                <button onClick={() => remove(n)} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
