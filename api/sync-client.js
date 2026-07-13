import { getClientFromNotion } from "./_lib/notion.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { toScore } from "./_lib/scores.js";

// POST /api/sync-client  { client_email }
// Re-pulls the client's intake from Notion and updates their app profile
// (goal, name, and the three V12 assessment scores). Does NOT generate a
// program. Only fields Notion actually provides are written, so a sync never
// wipes a coach-set value that's missing in Notion.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { client_email } = req.body || {};
  if (!client_email) return res.status(400).json({ error: "client_email is required" });

  try {
    const client = await getClientFromNotion(client_email);
    if (!client) {
      return res.status(404).json({ error: `No client found in Notion for ${client_email}` });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, goal")
      .eq("email", client_email)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) {
      return res.status(404).json({ error: "Client has not signed up in the app yet" });
    }

    const ns = toScore(client.nervous_system_recruitment);
    const ds = toScore(client.muscular_density_to_size);
    const wc = toScore(client.metabolic_work_capacity);

    const update = {};
    if (client.name) update.name = client.name;
    // Only fill the goal from Notion when the profile has none — never clobber a
    // coach-set (or previously stored) goal on refresh. Coach override wins.
    if (client.goal && !profile.goal) update.goal = client.goal;
    if (ns != null) update.nervous_system_recruitment = ns;
    if (ds != null) update.muscular_density_to_size = ds;
    if (wc != null) update.metabolic_work_capacity = wc;

    if (Object.keys(update).length) {
      const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", profile.id);
      if (error) throw error;
    }

    return res.status(200).json({
      success: true,
      updated: Object.keys(update),
      name: client.name ?? null,
      goal: client.goal ?? null,
      assessment: {
        nervous_system_recruitment: ns,
        muscular_density_to_size: ds,
        metabolic_work_capacity: wc,
      },
    });
  } catch (err) {
    console.error("sync-client error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
