// Abstraction boundary between V12's tier-activation logic and whichever
// payment processor is actually wired up. Payoneer is the confirmed choice
// but credentials are still pending (per the build spec) -- business logic
// (see starterActivation.js) must never import a processor SDK directly or
// branch on which processor is configured; it only calls the two functions
// below. Wiring up real Payoneer later means filling in this file, not
// touching any caller.

const PROCESSOR_READY = !!process.env.PAYONEER_API_KEY;

// Starts a checkout for the given session and returns a URL to send the
// browser to. Throws a clear, catchable error when no processor is
// configured yet, rather than pretending to succeed.
export async function createCheckoutSession({ sessionId, email, amountCents, product }) {
  if (!PROCESSOR_READY) {
    const err = new Error("Payment processor not configured yet (Payoneer credentials pending).");
    err.code = "PROCESSOR_NOT_CONFIGURED";
    throw err;
  }
  // TODO once Payoneer credentials exist: call their checkout-session API
  // with { sessionId, email, amountCents, product } as reference/metadata,
  // and return { checkoutUrl }.
  throw new Error("Payoneer integration not implemented yet.");
}

// Verifies and normalizes an inbound webhook request into
// { sessionId, confirmed: boolean } or null if it doesn't verify. Callers
// (api/payoneer-webhook.js, once that route exists) should treat null as
// "ignore this request" rather than throwing.
export function parseWebhookEvent(req) {
  if (!PROCESSOR_READY) return null;
  // TODO once Payoneer credentials exist: verify the webhook signature and
  // map their event payload to { sessionId, confirmed }.
  return null;
}
