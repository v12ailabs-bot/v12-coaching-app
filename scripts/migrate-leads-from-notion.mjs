// One-time backfill (Task 3): copy existing leads from the Notion Lead
// Pipeline CRM into the new in-app `leads` table. Run once; safe to re-run
// (skips emails already present so it won't duplicate). No ongoing sync.
// Run: node scripts/migrate-leads-from-notion.mjs
import { Client } from "@notionhq/client";
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../api/_lib/supabaseAdmin.js";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB = "22241e03-5f95-48c4-8f97-856abb1faf7b"; // Lead Pipeline CRM

// Fuzzy-match the live schema rather than hardcoding column names we haven't
// inspected (same approach as scripts/audit-injuries.mjs).
const TARGETS = [
  { label: "email", match: (n) => /email/i.test(n) },
  { label: "name", match: (n) => /name/i.test(n) },
  { label: "status", match: (n) => /status|stage/i.test(n) },
];

function plain(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case "title": return prop.title.map((t) => t.plain_text).join("") || null;
    case "rich_text": return prop.rich_text.map((t) => t.plain_text).join("") || null;
    case "email": return prop.email || null;
    case "select": return prop.select?.name || null;
    case "status": return prop.status?.name || null;
    case "multi_select": return prop.multi_select.map((o) => o.name).join(", ") || null;
    default: return null;
  }
}

const db = await notion.databases.retrieve({ database_id: DB });
const props = Object.keys(db.properties);
const resolved = TARGETS.map((t) => ({ ...t, name: props.find(t.match) || null }));
const emailProp = resolved.find((r) => r.label === "email");
const nameProp = resolved.find((r) => r.label === "name");
const statusProp = resolved.find((r) => r.label === "status");

console.log("Resolved columns:", resolved.map((r) => `${r.label} -> ${r.name || "(not found)"}`).join(", "));

const rows = [];
let cursor;
do {
  const res = await notion.databases.query({ database_id: DB, start_cursor: cursor, page_size: 100 });
  rows.push(...res.results);
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

console.log(`Found ${rows.length} Notion leads.`);

const { data: existing } = await supabaseAdmin.from("leads").select("email").eq("source", "notion_backfill");
const already = new Set((existing || []).map((r) => (r.email || "").toLowerCase()));

let inserted = 0, skipped = 0;
for (const page of rows) {
  const email = (emailProp.name ? plain(page.properties[emailProp.name]) : null)?.toLowerCase();
  if (!email) { skipped++; continue; }
  if (already.has(email)) { skipped++; continue; }

  const rawStatus = statusProp.name ? plain(page.properties[statusProp.name]) : null;
  const { error } = await supabaseAdmin.from("leads").insert({
    email,
    name: nameProp.name ? plain(page.properties[nameProp.name]) : null,
    source: "notion_backfill",
    status: "new", // unknown Notion pipeline vocabulary; original stage preserved in notes below
    notes: rawStatus ? `Notion pipeline stage at backfill: ${rawStatus}` : null,
    intake_data: { notion_page_id: page.id },
  });
  if (error) { console.error(`Failed for ${email}:`, error.message); skipped++; }
  else { inserted++; already.add(email); }
}

console.log(`Backfill complete. Inserted ${inserted}, skipped ${skipped} (missing email or already migrated).`);
