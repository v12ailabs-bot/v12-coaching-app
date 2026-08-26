import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { createCheckoutSession } from "./_lib/paymentProvider.js";
import { checkRateLimit, clientIp } from "./_lib/rateLimit.js";
import { activateStarterSignup } from "./_lib/starterActivation.js";
import { requireCoach } from "./_lib/auth.js";

// POST /api/starter-checkout  { email }
// Public. Starts a Starter ($15/30 days) checkout session -- creates ONLY a
// pending starter_checkout_sessions row, never a profiles/auth.users row.
// The account is created exclusively on confirmed payment (see
// starterActivation.js), never here.
async function startCheckout(req, res) {
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

// POST /api/starter-checkout  { action: "confirm", sessionId }
// Coach-only. Manually simulates a confirmed Payoneer payment for a pending
// session -- the exact same activation path a real Payoneer webhook will
// call once credentials are wired up. Folded into this same file (rather
// than its own route) to stay under the Hobby plan's 12-serverless-function
// cap -- see api/_lib/paymentProvider.js for the processor abstraction.
async function confirmPayment(req, res) {
  const user = await requireCoach(req, res);
  if (!user) return;

  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "sessionId is required." });

  try {
    const result = await activateStarterSignup({ sessionId });
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.body?.action === "confirm") return confirmPayment(req, res);
  return startCheckout(req, res);
}
