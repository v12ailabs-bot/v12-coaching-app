import { getClientFromNotion } from "./_lib/notion.js";
import { requireCoach } from "./_lib/auth.js";

// POST /api/notion-goal  { client_email }
// Coach-only, read-only: returns the client's Primary Goal from their Notion
// intake WITHOUT touching the app profile. Used by the coach "Reset to
// Notion" action to stage the Notion value into the editor before the coach
// saves it — so previewing the Notion goal never overwrites the stored
// profile (unlike /api/sync-client).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireCoach(req, res);
  if (!user) return;

  const { client_email } = req.body || {};
  if (!client_email) return res.status(400).json({ error: "client_email is required" });

  try {
    const client = await getClientFromNotion(client_email);
    if (!client) {
      return res.status(404).json({ error: `No client found in Notion for ${client_email}` });
    }
    return res.status(200).json({ success: true, goal: client.goal ?? null });
  } catch (err) {
    console.error("notion-goal error:", err, "client_email:", client_email);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
