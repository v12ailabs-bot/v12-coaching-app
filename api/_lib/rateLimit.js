import { supabaseAdmin } from "./supabaseAdmin.js";

// Fixed-window rate limiter backed by Postgres (see db/add_rate_limits.sql)
// so the limit holds across serverless cold starts and regions, unlike an
// in-memory counter. Not perfectly atomic under heavy concurrency -- this is
// meant to deter casual bot abuse of public endpoints, not serve as a hard
// security boundary.
export async function checkRateLimit(bucket, { limit, windowMs }) {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  await supabaseAdmin.from("rate_limits").delete().eq("bucket", bucket).lt("created_at", windowStart);
  const { count } = await supabaseAdmin
    .from("rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .gte("created_at", windowStart);
  if ((count || 0) >= limit) return false;
  await supabaseAdmin.from("rate_limits").insert({ bucket });
  return true;
}

// Vercel sets x-forwarded-for to "client, proxy1, proxy2"; the first entry is
// the real client.
export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
