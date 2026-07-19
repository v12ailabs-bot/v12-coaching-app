import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { checkRateLimit, clientIp } from "./_lib/rateLimit.js";

// POST /api/check-accepted  { email }
// Gates account creation: a prospect can only sign up once their lead has
// been marked "accepted" in the CRM. Uses the service-role key server-side
// so the public client never gets read access to the leads table directly.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email is required" });

  // Generous limit -- this fires on every signup attempt, including retries
  // after a typo -- but still caps email-enumeration/brute-force probing.
  const allowed = await checkRateLimit(`check-accepted:${clientIp(req)}`, { limit: 20, windowMs: 5 * 60 * 1000 });
  if (!allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  try {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("id")
      .ilike("email", email)
      .eq("status", "accepted")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ accepted: !!data });
  } catch (err) {
    console.error("check-accepted error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
