import { requireCoach } from "./auth.js";

// Two authorization primitives for Head Coach code, per the HC-003 proposal.
// There is deliberately no third one -- every future Head Coach code path
// (api/head-coach.js, once HC-004 builds it) must call exactly one of these
// before touching supabaseAdmin, so there's one place to get this right
// instead of N.

interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface MinimalResponse {
  status: (code: number) => MinimalResponse;
  json: (body: unknown) => void;
}

// Coach-driven operations: viewing tasks/recommendations, approve/modify/
// reject/defer, manual outcome recording. Not a reimplementation -- calls
// the existing requireCoach() unchanged, so this repo still has exactly one
// definition of "is this caller a coach."
export async function requireCoachForHeadCoach(
  req: MinimalRequest,
  res: MinimalResponse,
): Promise<{ id: string } | null> {
  return requireCoach(req, res);
}

// System-driven operations: task creation from a check-in event, context
// assembly, calling Claude, writing the recommendation, writing
// system-authored audit events. There is no human caller to check a role
// for -- this authenticates "this request came from our own trusted backend
// process," same shape as checkin-digest.js's existing CRON_SECRET check.
// Reuses CRON_SECRET rather than adding a new env var; revisit only if a
// caller other than a cron-triggered worker ever needs this.
export function requireHeadCoachWorker(req: MinimalRequest, res: MinimalResponse): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
