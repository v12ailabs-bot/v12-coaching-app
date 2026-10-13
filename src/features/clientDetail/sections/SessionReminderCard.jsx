import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, Btn } from "../../../components/ui/index.js";

// Coach-only "what to do at the next session" note (coach_session_reminders,
// whose only RLS policy is is_coach()). Rendered on the coach client page only.
export function SessionReminderCard({ clientId }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    supabase.from("coach_session_reminders").select("reminder").eq("client_id", clientId).maybeSingle().then(({ data }) => setText(data?.reminder || null));
  }, [clientId]);
  if (!text) return null;
  const clear = async () => {
    const { error } = await supabase.from("coach_session_reminders").update({ reminder: null, updated_at: new Date().toISOString() }).eq("client_id", clientId);
    if (!error) setText(null);
  };
  return (
    <Card style={{ marginBottom: 12, borderColor: S.accent }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: S.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Session reminder · only you see this</div>
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{text}</div>
      <div style={{ marginTop: 10 }}><Btn sm onClick={clear}>Clear reminder</Btn></div>
    </Card>
  );
}
