import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { sendCheckinDigestEmail } from "./_lib/resend.js";

// GET /api/checkin-digest — run once daily by Vercel Cron (see vercel.json)
// to email the coach a summary of the last 24h of check-ins, instead of one
// email per check-in. Vercel automatically sends `Authorization: Bearer
// <CRON_SECRET>` on cron-triggered requests when CRON_SECRET is set in the
// project's env vars — reject anything else so this can't be triggered/spammed
// by an outside caller.
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: daily, error: dErr }, { data: weekly, error: wErr }] = await Promise.all([
      supabaseAdmin.from("daily_checkins").select("client_id,weight,workout,diet,energy,sleep").gte("created_at", since),
      supabaseAdmin.from("weekly_checkins").select("client_id,bodyweight,coach_questions,adjustments").gte("created_at", since),
    ]);
    if (dErr) throw dErr;
    if (wErr) throw wErr;

    if (!daily.length && !weekly.length) return res.status(200).json({ sent: false, daily: 0, weekly: 0 });

    const clientIds = [...new Set([...daily.map((d) => d.client_id), ...weekly.map((w) => w.client_id)])];
    const { data: profiles, error: pErr } = await supabaseAdmin.from("profiles").select("id,name,email").in("id", clientIds);
    if (pErr) throw pErr;
    const nameOf = (id) => { const p = profiles.find((x) => x.id === id); return p?.name || p?.email || "Client"; };

    await sendCheckinDigestEmail({
      daily: daily.map((d) => ({ ...d, name: nameOf(d.client_id) })),
      weekly: weekly.map((w) => ({ ...w, name: nameOf(w.client_id) })),
    });

    return res.status(200).json({ sent: true, daily: daily.length, weekly: weekly.length });
  } catch (err) {
    console.error("checkin-digest error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
