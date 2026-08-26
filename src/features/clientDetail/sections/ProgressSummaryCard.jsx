import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, MetricCard } from "../../../components/ui/index.js";
import { adherenceFrom, nutritionScoreFrom } from "../../../lib/scoring.js";
import { computeGoalScore } from "../../../lib/scoring/goalScoring.js";

// Compact equivalent of the reference mockup's "Current phase" card — phase,
// program progress %, weight change, training/nutrition adherence. No
// body-fat tracking exists anywhere in the schema (checked db/schema.sql),
// so that metric from the mockup is omitted rather than fabricated.
export function ProgressSummaryCard({ client }) {
  const [phase, setPhase] = useState(null);
  const [daily, setDaily] = useState([]);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("programs").select("phase").eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("daily_checkins").select("date,weight,workout,diet").eq("client_id", client.id).order("date"),
      supabase.from("client_goals").select("*").eq("client_id", client.id).eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([p, d, g]) => {
      setPhase(p.data?.phase || null);
      setDaily(d.data || []);
      setGoal(g.data || null);
      setLoading(false);
    });
  }, [client.id]);

  if (loading) return <Card style={{ marginBottom: 0 }}><div className="spinner" style={{ margin: "30px auto" }} /></Card>;

  const adh = adherenceFrom(daily, 30);
  const nut = nutritionScoreFrom(daily, 30);
  const weights = daily.filter((d) => d.weight != null);
  const weightChange = weights.length >= 2 ? weights[weights.length - 1].weight - weights[0].weight : null;
  const goalScore = goal ? computeGoalScore(goal, weights.map((w) => ({ date: w.date, value: w.weight })), { nutrition: nut.score, training: adh.trainingRate }) : null;

  return (
    <Card style={{ marginBottom: 0, height: "100%" }}>
      <CardTitle>Progress</CardTitle>
      <div style={{ fontSize: 12, color: S.text, marginBottom: 16 }}>{phase ? `Current phase: ${phase}` : "No program phase set yet"}</div>
      {/* className (not just inline style) so the shared `.g2` responsive
          rule collapses this to one column on narrow screens — this grid
          had no class at all before, so it never collapsed on any screen
          size and squeezed 4 MetricCards into 2 tight columns on a narrow
          landscape phone. */}
      <div className="g2" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
        <MetricCard label="Program Progress" value={goalScore?.overallScore ?? "—"} unit={goalScore?.overallScore != null ? "%" : ""} />
        <MetricCard label="Weight Change" value={weightChange != null ? (weightChange > 0 ? "+" : "") + weightChange.toFixed(1) : "—"} unit={weightChange != null ? "lb" : ""} />
        <MetricCard label="Training Adherence" value={adh.trainingRate} unit="%" />
        <MetricCard label="Nutrition Adherence" value={nut.score ?? "—"} unit={nut.score != null ? "%" : ""} />
      </div>
    </Card>
  );
}
