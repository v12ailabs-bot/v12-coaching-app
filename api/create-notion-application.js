import { createNotionApplication } from "./_lib/notion.js";

// POST /api/create-notion-application  { email, name, goal, ... }
// Called (fire-and-forget) right after an in-app intake submission, so
// applicants who apply through the app also land in the coach's Notion
// Applications Database. Best-effort: the app-side leads insert already
// succeeded by the time this runs, so a Notion failure here doesn't fail the
// applicant's submission -- always returns 200, with success:false on error.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const fields = req.body || {};
  if (!fields.email) return res.status(400).json({ error: "email is required" });

  try {
    const pageId = await createNotionApplication(fields);
    return res.status(200).json({ success: !!pageId, notion_page_id: pageId });
  } catch (err) {
    console.error("create-notion-application error:", err);
    return res.status(200).json({ success: false, error: err.message || "Notion sync failed" });
  }
}
