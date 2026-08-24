import { generateCheckinSummary } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireCoach } from "./_lib/auth.js";
import { computeGoalScore } from "../src/lib/scoring/goalScoring.js";
import { strengthTrendsFrom } from "./_lib/strengthTrends.js";

// POST /api/summary  { client_id }
// Coach-only: generates a plain-text 30-day progress recap for a client and
// saves it under this month (client_summaries, one row per client per month).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireCoach(req, res);
  if (!user) return;

  const { client_id } = req.body || {};
  if (!client_id) return res.status(400).json({ error: "client_id is required" });

  try {
    const now = new Date();
    const cut = (() => { const d = new Date(now); d.setDate(d.getDate() - 29); return d.toISOString().split("T")[0]; })();
    const period = now.toISOString().slice(0, 7);   // YYYY-MM
    const [{ data: profile }, { data: daily }, { data: logs }, { data: phaseHistory }, { data: goal }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name,goal").eq("id", client_id).maybeSingle(),
      supabaseAdmin.from("daily_checkins").select("date,weight,waist,habit_flags,workout").eq("client_id", client_id).gte("date", cut).order("date"),
      supabaseAdmin.from("workout_logs").select("date,exercise_id,weight,reps").eq("client_id", client_id).gte("date", cut),
      supabaseAdmin.from("program_phase_history").select("phase,phase_note,changed_at").eq("client_id", client_id).gte("changed_at", cut).order("changed_at"),
      supabaseAdmin.from("client_goals").select("*").eq("client_id", client_id).eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    // Same computeGoalScore GoalsSection/Progress use, so the recap's goal
    // context is never a separately-derived (and possibly inconsistent) number.
    const goalScore = goal ? computeGoalScore(goal, (daily || []).filter((d) => d.weight != null).map((d) => ({ date: d.date, value: d.weight })), {}) : null;
    // Top-set weight/rep movement per exercise over the same window, so the
    // recap can speak to strength progress, not just weight/nutrition/habits.
    const exerciseIds = [...new Set((logs || []).map((l) => l.exercise_id).filter(Boolean))];
    const { data: exRows } = exerciseIds.length
      ? await supabaseAdmin.from("exercises").select("id,name,is_bodyweight").in("id", exerciseIds)
      : { data: [] };
    const exerciseById = {};
    (exRows || []).forEach((e) => { exerciseById[e.id] = e; });
    const strength = strengthTrendsFrom(logs || [], exerciseById);
    const summary = await generateCheckinSummary({
      profile: profile || {}, daily: daily || [], logs: logs || [], phaseHistory: phaseHistory || [], strength,
      goal: goal ? { direction: goal.direction, target_value: goal.target_value, unit: goal.unit, target_date: goal.target_date, classification: goalScore?.classification, overall_score: goalScore?.overallScore } : null,
    });
    // Persist as this month's recap for this client (replaces an existing one).
    // acknowledged_at: null so regenerating an already-seen month's recap
    // re-surfaces the "new recap" banner on the client's Home page.
    await supabaseAdmin.from("client_summaries")
      .upsert({ client_id, period, content: summary, created_at: now.toISOString(), acknowledged_at: null }, { onConflict: "client_id,period" });
    return res.status(200).json({ summary, period });
  } catch (e) {
    console.error("summary error:", e, "client_id:", client_id);
    return res.status(500).json({ error: e.message });
  }
}
