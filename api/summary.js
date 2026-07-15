import { generateCheckinSummary } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// POST /api/summary  { client_id }
// Coach-only: generates a plain-text 30-day progress recap for a client and
// saves it under this month (client_summaries, one row per client per month).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { client_id } = req.body || {};
  if (!client_id) return res.status(400).json({ error: "client_id is required" });

  // Verify the caller is a coach.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = token ? await supabaseAdmin.auth.getUser(token) : { data: {} };
  const user = userData?.user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "coach") return res.status(403).json({ error: "Only a coach can generate summaries." });

  try {
    const now = new Date();
    const cut = (() => { const d = new Date(now); d.setDate(d.getDate() - 29); return d.toISOString().split("T")[0]; })();
    const period = now.toISOString().slice(0, 7);   // YYYY-MM
    const [{ data: profile }, { data: daily }, { data: logs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name,goal").eq("id", client_id).maybeSingle(),
      supabaseAdmin.from("daily_checkins").select("date,weight,waist,habit_flags,workout").eq("client_id", client_id).gte("date", cut).order("date"),
      supabaseAdmin.from("workout_logs").select("date").eq("client_id", client_id).gte("date", cut),
    ]);
    const summary = await generateCheckinSummary({ profile: profile || {}, daily: daily || [], logs: logs || [] });
    // Persist as this month's recap for this client (replaces an existing one).
    await supabaseAdmin.from("client_summaries")
      .upsert({ client_id, period, content: summary, created_at: now.toISOString() }, { onConflict: "client_id,period" });
    return res.status(200).json({ summary, period });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
