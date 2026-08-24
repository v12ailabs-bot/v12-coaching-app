import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, todayStr } from "../../../theme.jsx";
import { Card, CardTitle, Fld, RG, Inp, Btn } from "../../../components/ui/index.js";

const CHANNELS = ["call", "text", "email", "in-person", "other"];

// Conversation / touchpoint log with the client.
export function CoachConversations({ clientId }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ channel: "call", summary: "", occurred_on: todayStr(), follow_up_on: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    const { data } = await supabase.from("conversations").select("*").eq("client_id", clientId).order("occurred_on", { ascending: false });
    setItems(data || []);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.summary.trim()) return;
    setSaving(true);
    await supabase.from("conversations").insert({
      client_id: clientId, channel: form.channel, summary: form.summary.trim(),
      occurred_on: form.occurred_on || todayStr(), follow_up_on: form.follow_up_on || null,
    });
    setForm({ channel: "call", summary: "", occurred_on: todayStr(), follow_up_on: "" });
    setSaving(false); load();
  };
  const remove = async (c) => { await supabase.from("conversations").delete().eq("id", c.id); load(); };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Conversation Log</CardTitle>
      <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Fld label="Channel"><RG options={CHANNELS} value={form.channel} onChange={(v) => set("channel", v)} cap /></Fld>
        <Fld label="Date"><Inp type="date" value={form.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} /></Fld>
        <Fld label="Follow-up (optional)"><Inp type="date" value={form.follow_up_on} onChange={(e) => set("follow_up_on", e.target.value)} /></Fld>
      </div>
      <textarea rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="What did you discuss? Decisions, adjustments, how they're feeling..."
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 10 }} />
      <Btn sm onClick={add} disabled={saving}>{saving ? "Saving..." : "Log Conversation"}</Btn>
      <div style={{ marginTop: 16 }}>
        {items.length === 0 && <div style={{ color: S.muted, fontSize: 13 }}>No conversations logged yet.</div>}
        {items.map((c) => (
          <div key={c.id} style={{ background: S.surface2, border: "1px solid " + S.border, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: S.accent }}>{c.channel}</span>
              <span style={{ fontSize: 11, color: S.muted }}>{c.occurred_on}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{c.summary}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 10, color: c.follow_up_on ? S.accent2 : S.muted }}>{c.follow_up_on ? `↻ Follow up ${c.follow_up_on}` : ""}</span>
              <button onClick={() => remove(c)} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
