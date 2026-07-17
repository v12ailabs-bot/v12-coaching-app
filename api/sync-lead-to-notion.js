import { syncLeadToNotion } from "./_lib/notion.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// POST /api/sync-lead-to-notion  { email, patch }
// Coach-only, fire-and-forget: pushes a CRM field change (status/notes/
// follow-up date/invoice info) to the lead's existing Notion page. Called
// right after a Supabase leads update succeeds — a Notion hiccup here never
// fails the coach's save, so this always returns 200 even on error.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, patch } = req.body || {};
  if (!email || !patch) return res.status(400).json({ error: "email and patch are required" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = token ? await supabaseAdmin.auth.getUser(token) : { data: {} };
  const user = userData?.user;
  if (!user) return res.status(200).json({ synced: false, error: "Not authenticated" });
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "coach") return res.status(200).json({ synced: false, error: "Only a coach can sync leads." });

  try {
    const pageId = await syncLeadToNotion(email, patch);
    return res.status(200).json({ synced: !!pageId });
  } catch (err) {
    console.error("sync-lead-to-notion error:", err);
    return res.status(200).json({ synced: false, error: err.message || "Notion sync failed" });
  }
}
