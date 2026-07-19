import { supabaseAdmin } from "./supabaseAdmin.js";

// Verifies the request's Bearer token belongs to a signed-in coach. On
// failure it writes the 401/403 response itself and returns null, so callers
// can just `const user = await requireCoach(req, res); if (!user) return;`.
export async function requireCoach(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = token ? await supabaseAdmin.auth.getUser(token) : { data: {} };
  const user = userData?.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "coach") {
    res.status(403).json({ error: "Only a coach can do this." });
    return null;
  }
  return user;
}
