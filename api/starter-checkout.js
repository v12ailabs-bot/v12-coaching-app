import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { createCheckoutSession } from "./_lib/paymentProvider.js";
import { checkRateLimit, clientIp } from "./_lib/rateLimit.js";

// POST /api/starter-checkout  { email }
// Public. Starts a Starter ($15/30 days) checkout session -- creates ONLY a
// pending starter_checkout_sessions row, never a profiles/auth.users row.
// The account is created exclusively on confirmed payment (see
// starterActivation.js), never here.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }

  const allowed = await checkRateLimit(`starter-checkout:${clientIp(req)}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!allowed) return res.status(429).json({ error: "Too many attempts. Please try again later." });

  const { data: session, error } = await supabaseAdmin.from("starter_checkout_sessions").insert({ email }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  try {
    const { checkoutUrl } = await createCheckoutSession({ sessionId: session.id, email, amountCents: 1500, product: "starter" });
    return res.status(200).json({ checkoutUrl });
  } catch (e) {
    // Processor not wired yet -- the session still exists (pending) so a
    // coach can manually confirm it via the admin panel in the meantime.
    return res.status(503).json({ error: "Starter payments aren't live yet — check back soon." });
  }
}
