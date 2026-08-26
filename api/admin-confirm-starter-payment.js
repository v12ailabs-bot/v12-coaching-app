import { requireCoach } from "./_lib/auth.js";
import { activateStarterSignup } from "./_lib/starterActivation.js";

// POST /api/admin-confirm-starter-payment  { sessionId }
// Coach-only. Manually simulates a confirmed Payoneer payment for a pending
// Starter checkout session -- the exact same activation path a real
// Payoneer webhook will call once credentials are wired up (see
// paymentProvider.js). Exists so the full signup -> activation -> CRM ->
// account flow can be exercised end-to-end before the real processor is
// connected.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
