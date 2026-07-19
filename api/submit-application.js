import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { createNotionApplication } from "./_lib/notion.js";
import { checkRateLimit, clientIp } from "./_lib/rateLimit.js";

// POST /api/submit-application  { name, email, height, ...intake fields }
// Public intake form submission. Writes the lead server-side with the
// service-role key (leads no longer has a public-insert RLS policy — see
// db/restrict_leads_public_insert.sql) so submissions can be rate-limited;
// previously the browser inserted directly into `leads` with the anon key,
// which meant anyone could spam-insert unlimited rows via the Supabase REST
// API with no server-side check at all. Also mirrors the application into
// the Notion Applications Database, best-effort.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const fields = req.body || {};
  if (!fields.name || !fields.email || !fields.height) {
    return res.status(400).json({ error: "Name, email, and height are required." });
  }

  const allowed = await checkRateLimit(`submit-application:${clientIp(req)}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!allowed) return res.status(429).json({ error: "Too many submissions. Please try again later." });

  const { currentInjuries = [], previousInjuries = [], painTriggers = [] } = fields;
  const email = String(fields.email).toLowerCase();

  try {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        email,
        name: fields.name,
        height: fields.height,
        source: "intake_form",
        status: "applied",
        intake_data: { ...fields, currentInjuries, previousInjuries, painTriggers },
      })
      .select()
      .single();
    if (error) throw error;

    // Fire-and-forget: a Notion failure never fails the applicant's submission.
    const injuries = [
      ...currentInjuries.map((v) => `Current: ${v}`),
      ...previousInjuries.map((v) => `Previous: ${v}`),
      ...painTriggers.map((v) => `Trigger: ${v}`),
    ].join("; ");
    createNotionApplication({ ...fields, email, injuries }).catch((e) =>
      console.error("submit-application: Notion sync failed:", e)
    );

    return res.status(200).json({ success: true, lead_id: lead.id });
  } catch (err) {
    console.error("submit-application error:", err, "email:", email);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
