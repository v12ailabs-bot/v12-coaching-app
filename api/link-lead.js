import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// POST /api/link-lead  { email, client_id }
// Links a newly-created profile back to its accepted lead. Needed because
// signup now only succeeds *after* acceptance (see check-accepted.js), so the
// auto-link-by-email in CRMPanel's accept() usually fires before any profile
// exists yet -- this closes that gap at signup time instead.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, client_id } = req.body || {};
  if (!email || !client_id) return res.status(400).json({ error: "email and client_id are required" });

  try {
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ client_id })
      .ilike("email", email)
      .eq("status", "accepted")
      .is("client_id", null);
    if (error) throw error;
    return res.status(200).json({ linked: true });
  } catch (err) {
    console.error("link-lead error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
