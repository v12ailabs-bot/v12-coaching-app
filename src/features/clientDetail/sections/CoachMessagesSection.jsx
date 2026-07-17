import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, EmptyState } from "../../../components/ui/index.js";

// Self-contained, same pattern as CoachNotes/CoachConversations: fetches and
// manages its own coach_messages history for this client. Replaces the old
// single-textarea "Client-Visible Message" (profiles.coach_message) — each
// send is now a new row with its own read-state, not an overwrite.
export function CoachMessagesSection({ clientId }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("coach_messages").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    setMessages(data || []);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    await supabase.from("coach_messages").insert({ client_id: clientId, body: body.trim() });
    setBody(""); setSending(false); load();
  };
  const remove = async (m) => { await supabase.from("coach_messages").delete().eq("id", m.id); load(); };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Coach Messages</CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
        Shows at the top of the client's Dashboard and Training Plan until they acknowledge it, then moves into their message history. Separate from your private coach notes below.
      </div>
      <textarea rows={3} value={body} onChange={e => setBody(e.target.value)}
        placeholder="e.g. Great work last week — bump squat to 3×5 and prioritize sleep. Proud of you."
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 10 }} />
      <Btn sm onClick={send} disabled={sending}>{sending ? "Sending..." : "Send Message"}</Btn>

      <div style={{ marginTop: 16 }}>
        {messages.length === 0 && <EmptyState title="No messages sent yet" />}
        {messages.map(m => (
          <div key={m.id} style={{ background: S.surface2, border: "1px solid " + S.border, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 8 }}>{m.body}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: m.acknowledged_at ? S.accent2 : S.muted }}>
                {(m.created_at || "").slice(0, 10)} · {m.acknowledged_at ? `seen ${m.acknowledged_at.slice(0, 10)}` : "not seen yet"}
              </span>
              <button onClick={() => remove(m)} style={{ background: "none", border: "none", color: "#ff6b5b", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
