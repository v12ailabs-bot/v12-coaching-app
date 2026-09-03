import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, EmptyState } from "../../../components/ui/index.js";

// AI-generated observations about the client — the same client_goal_insights
// row GoalsSection's "Generate insight" button writes and the client's own
// Progress > Goals tab reads. Surfaced here too since it's the only
// genuinely AI-generated text in the app, matching the reference mockup's
// "Goals checklist" slot both in position and in being something the coach
// scans at a glance rather than edits.
export function ClientInsightCard({ client }) {
  const [goal, setGoal] = useState(null);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    const [{ data: g }, { data: ins }] = await Promise.all([
      supabase.from("client_goals").select("id").eq("client_id", client.id).eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("client_goal_insights").select("*").eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setGoal(g || null);
    setInsight(ins || null);
    setLoading(false);
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (!goal) return;
    setGenerating(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/goal-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ goal_id: goal.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate an insight.");
      setInsight(json.insight);
    } catch (e) { setErr(e.message); }
    finally { setGenerating(false); }
  };

  return (
    <Card style={{ marginBottom: 0, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <CardTitle>Client Insights</CardTitle>
        {!loading && goal && <Btn sm teal onClick={generate} disabled={generating}>{generating ? "Generating..." : "Generate insight"}</Btn>}
      </div>
      {err && <div style={{ color: S.danger, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {loading ? null : !goal ? (
        <EmptyState title="No active goal" sub="Set a goal in the Goals tab to start generating insights." />
      ) : insight ? (
        <div style={{ fontSize: 13.5, color: S.text, opacity: 0.92, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{insight.insight_text}</div>
      ) : (
        <div style={{ fontSize: 13, color: S.muted }}>No insight generated yet.</div>
      )}
    </Card>
  );
}
