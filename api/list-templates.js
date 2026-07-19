import { listProgramTemplates } from "./_lib/notionTemplates.js";
import { requireCoach } from "./_lib/auth.js";

// GET /api/list-templates
// Coach-only: returns the program templates from the Notion program library
// so the coach can pick one when generating a program.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireCoach(req, res);
  if (!user) return;
  try {
    const templates = await listProgramTemplates();
    return res.status(200).json({ templates });
  } catch (err) {
    console.error("list-templates error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
