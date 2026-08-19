import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { S, bS } from "../theme.jsx";
import { Card, Btn } from "./ui/index.js";

// Client-visible coach messages (coach_messages table) with real history and
// read-state. The oldest unacknowledged message shows as a banner; clicking
// "Got it" acknowledges it (permanently — it never reappears) and reveals the
// next one, if any. Everything acknowledged lives in a collapsed history
// list below. Placed at the top of the Dashboard and the Training Plan.
export function CoachMessage({ profile }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("coach_messages").select("*").eq("client_id", profile.id).order("created_at", { ascending: false });
    setMessages(data || []);
    setLoading(false);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return null;

  const unacknowledged = [...messages].filter(m => !m.acknowledged_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
  const history = messages.filter(m => m.id !== unacknowledged?.id);

  const acknowledge = async () => {
    if (!unacknowledged) return;
    setAcking(true);
    await supabase.from("coach_messages").update({ acknowledged_at: new Date().toISOString() }).eq("id", unacknowledged.id);
    setAcking(false);
    load();
  };

  if (!unacknowledged && history.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {unacknowledged && (
        <Card style={{ borderLeft: "3px solid " + S.accent2, marginBottom: history.length ? 10 : 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent2, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span>💬</span> Message from your coach
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: S.text, whiteSpace: "pre-wrap", marginBottom: 14 }}>{unacknowledged.body}</div>
          <Btn sm teal onClick={acknowledge} disabled={acking}>{acking ? "..." : "Got it"}</Btn>
        </Card>
      )}
      {history.length > 0 && (
        <>
          <button onClick={() => setShowHistory(v => !v)}
            style={{ background: "none", border: "none", color: S.muted, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}>
            {showHistory ? "Hide" : "View"} message history ({history.length})
          </button>
          {showHistory && history.map(m => (
            <div key={m.id} style={{ background: S.surface, border: "1px solid " + S.border, padding: "12px 14px", marginTop: 8 }}>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 6 }}>{(m.created_at || "").slice(0, 10)}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: S.text, whiteSpace: "pre-wrap" }}>{m.body}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Client-visible surface for a coach-generated AI goal insight
// (client_goal_insights) — same read-state pattern as CoachMessage above:
// the newest unacknowledged insight shows as a banner on Home with a "Got
// it" button, then never reappears here (it stays viewable under Progress ->
// Goals for as long as the goal is active).
export function GoalInsightBanner({ profile }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("client_goal_insights").select("*").eq("client_id", profile.id)
      .is("acknowledged_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setInsight(data || null);
    setLoading(false);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !insight) return null;

  const acknowledge = async () => {
    setAcking(true);
    await supabase.from("client_goal_insights").update({ acknowledged_at: new Date().toISOString() }).eq("id", insight.id);
    setAcking(false);
    load();
  };

  return (
    <Card style={{ borderLeft: "3px solid " + S.accent, marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🎯</span> New Coaching Insight
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: S.text, whiteSpace: "pre-wrap", marginBottom: 14 }}>{insight.insight_text}</div>
      <Btn sm teal onClick={acknowledge} disabled={acking}>{acking ? "..." : "Got it"}</Btn>
    </Card>
  );
}

const SUMMARY_MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const summaryMonthLabel = (period) => { const [y,m] = (period||"").split("-"); return m ? `${SUMMARY_MONTH_NAMES[+m-1]} ${y}` : period; };

// Client-visible "new recap ready" banner for the AI monthly summary
// (client_summaries) — same read-state pattern as CoachMessage/
// GoalInsightBanner above: the newest unacknowledged recap shows as a banner
// on Home, and "View Recap" both acknowledges it and sends the client to
// Progress, where the full recap lives (read-only, in AISummarySection.jsx).
export function NewSummaryBanner({ profile, setPage }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("client_summaries").select("id,period").eq("client_id", profile.id)
      .is("acknowledged_at", null).order("period", { ascending: false }).limit(1).maybeSingle();
    setSummary(data || null);
    setLoading(false);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !summary) return null;

  const view = async () => {
    setAcking(true);
    await supabase.from("client_summaries").update({ acknowledged_at: new Date().toISOString() }).eq("id", summary.id);
    setAcking(false);
    setPage("progress");
  };

  return (
    <Card style={{ borderLeft: "3px solid " + S.accent2, marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent2, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊</span> New Monthly Recap
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: S.text, marginBottom: 14 }}>Your recap for {summaryMonthLabel(summary.period)} is ready to view.</div>
      <Btn sm teal onClick={view} disabled={acking}>{acking ? "..." : "View Recap"}</Btn>
    </Card>
  );
}

// Client-side surface for the manual PayPal invoice link the coach pastes in
// after Accept (CRMPanel) -- shown until the coach marks the lead paid.
export function InvoiceCard({ profile }) {
  const [lead, setLead] = useState(null);
  useEffect(() => {
    supabase.from("leads").select("invoice_link,paid").eq("client_id", profile.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLead(data));
  }, [profile.id]);
  if (!lead?.invoice_link || lead.paid) return null;
  return (
    <Card style={{ borderLeft: "3px solid " + S.accent }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent, marginBottom: 10 }}>Complete Your Enrollment</div>
      <div style={{ fontSize: 13, color: S.text, marginBottom: 12, lineHeight: 1.6 }}>Finish signing up by completing payment below.</div>
      <a href={lead.invoice_link} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
        <button style={{ ...bS({ padding: "10px 22px" }), background: S.accent, color: "white" }}>Pay Now →</button>
      </a>
    </Card>
  );
}
