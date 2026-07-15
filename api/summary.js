import { generateCheckinSummary } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// POST /api/summary  { client_id }
// Generates an on-demand plain-text 30-day progress recap for a client. The
// caller must be that client (verified via their Supabase JWT) or a coach.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { client_id } = req.body || {};
  if (!client_id) return res.status(400).json({ error: "client_id is required" });

  // Verify the caller: their JWT must resolve to this client, or to a coach.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = token ? await supabaseAdmin.auth.getUser(token) : { data: {} };
  const user = userData?.user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  if (user.id !== client_id) {
    const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "coach") return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const cut = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split("T")[0]; })();
    const [{ data: profile }, { data: daily }, { data: logs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name,goal").eq("id", client_id).maybeSingle(),
      supabaseAdmin.from("daily_checkins").select("date,weight,waist,habit_flags,workout").eq("client_id", client_id).gte("date", cut).order("date"),
      supabaseAdmin.from("workout_logs").select("date").eq("client_id", client_id).gte("date", cut),
    ]);
    const summary = await generateCheckinSummary({ profile: profile || {}, daily: daily || [], logs: logs || [] });
    return res.status(200).json({ summary });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
