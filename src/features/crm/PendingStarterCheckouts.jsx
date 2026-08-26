import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";
import { timeSince } from "./crmHelpers.js";

// Test-mode bridge until Payoneer credentials are wired up: lets the coach
// manually confirm a pending Starter checkout so the full signup ->
// activation -> CRM -> account flow can be exercised end-to-end today. Once
// a real Payoneer webhook exists, this becomes redundant (sessions will
// confirm themselves) but stays useful as a manual override/recovery tool.
// Renders nothing once there's nothing pending, so it never clutters the
// board for a coach who isn't testing Starter.
export function PendingStarterCheckouts() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const { data } = await supabase.from("starter_checkout_sessions").select("*").eq("status", "pending").order("created_at", { ascending: false });
    setSessions(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const confirm = async (id) => {
    setConfirming(id); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const r = await fetch("/api/starter-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ action: "confirm", sessionId: id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Failed to confirm.");
      setMsg({ ok: true, text: "Confirmed — Starter account activated." });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    await load();
    setConfirming(null);
  };

  if (loading || sessions.length === 0) return null;

  return (
    <Card style={{ borderLeft: "3px solid " + S.warning }}>
      <CardTitle>Pending Starter Checkouts (test mode)</CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 12 }}>
        Payoneer isn't connected yet — confirm a session manually here to test the signup flow end-to-end.
      </div>
      {msg && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</div>}
      {sessions.map((s) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid " + S.border }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.email}</div>
            <div style={{ fontSize: 11, color: S.muted }}>{timeSince(s.created_at)}</div>
          </div>
          <Btn sm onClick={() => confirm(s.id)} disabled={confirming === s.id}>{confirming === s.id ? "Confirming..." : "Confirm Payment"}</Btn>
        </div>
      ))}
    </Card>
  );
}
