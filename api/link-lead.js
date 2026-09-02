import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { profileFieldsFromIntake } from "../src/lib/leadIntake.js";

// POST /api/link-lead  { client_id }
// Links a newly-created profile back to its accepted lead. Needed because
// signup now only succeeds *after* acceptance (see check-accepted.js), so the
// auto-link-by-email in CRMPanel's accept() usually fires before any profile
// exists yet -- this closes that gap at signup time instead.
//
// Requires the caller's own session token and only ever links using the
// verified token's email/user id — never the request body's — so one
// account can't be used to hijack another lead's linkage.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { client_id } = req.body || {};
  if (!client_id) return res.status(400).json({ error: "client_id is required" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = token ? await supabaseAdmin.auth.getUser(token) : { data: {} };
  const user = userData?.user;
  if (!user || user.id !== client_id) return res.status(401).json({ error: "Not authenticated" });

  try {
    const { data: linked, error } = await supabaseAdmin
      .from("leads")
      .update({ client_id })
      .ilike("email", user.email)
      .eq("status", "accepted")
      .is("client_id", null)
      .select("intake_data");
    if (error) throw error;

    // Backfill age/sex from the application onto the new profile — see
    // src/lib/leadIntake.js — so the Body Composition estimate can show
    // without asking the client to retype what they already told us.
    const fields = profileFieldsFromIntake(linked?.[0]?.intake_data);
    if (fields.age != null || fields.sex) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("age,sex").eq("id", client_id).maybeSingle();
      const patch = {};
      if (fields.age != null && profile?.age == null) patch.age = fields.age;
      if (fields.sex && !profile?.sex) patch.sex = fields.sex;
      if (Object.keys(patch).length) await supabaseAdmin.from("profiles").update(patch).eq("id", client_id);
    }

    return res.status(200).json({ linked: true });
  } catch (err) {
    console.error("link-lead error:", err, "client_id:", client_id);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
