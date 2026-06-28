// ---------------------------------------------------------------------------
// Inspect the Notion program library so we can confirm how the session sections
// (Primary Strength, Secondary Strength, Accessories, Finishers, Circuits, Core)
// are actually stored — as page PROPERTIES or as page CONTENT headings — and lock
// the reader's mapping accordingly.
//
//   .env needs NOTION_API_KEY (and NOTION_PROGRAM_LIBRARY_DB_ID if the default id
//   is wrong). Then:
//     npm run inspect:templates
//
// Prints, for each template page: its title, every property (name + type +
// sample value), and any content headings. Read-only.
// ---------------------------------------------------------------------------

import { Client } from "@notionhq/client";
import { readProp } from "../api/_lib/notion.js";

const DB_ID = process.env.NOTION_PROGRAM_LIBRARY_DB_ID || "322930f968978089a0bac68ad019bb4c";
if (!process.env.NOTION_API_KEY) { console.error("Missing NOTION_API_KEY"); process.exit(1); }
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function headings(pageId) {
  const out = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const b of res.results) {
      const text = (b[b.type]?.rich_text || []).map((t) => t.plain_text).join("").trim();
      if (!text) continue;
      const tag = b.type.startsWith("heading") || b.type === "toggle" ? b.type : "  ·";
      out.push(`${tag}: ${text.slice(0, 80)}`);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

// List every database the integration can see (used when the configured id is
// wrong) so we can read off the correct one.
async function listAccessibleDatabases() {
  const res = await notion.search({ filter: { value: "database", property: "object" }, page_size: 100 });
  return res.results.map((db) => ({
    id: db.id,
    title: (db.title || []).map((t) => t.plain_text).join("").trim() || "(untitled)",
  }));
}

async function main() {
  console.log(`\nInspecting Notion program library: ${DB_ID}\n`);
  let pages;
  try {
    const res = await notion.databases.query({ database_id: DB_ID, page_size: 100 });
    pages = res.results;
  } catch (e) {
    console.error(`Could not query the configured database (${e.code || "error"}): ${e.message}\n`);
    console.log("Databases your integration CAN access (use the correct id below):");
    try {
      const dbs = await listAccessibleDatabases();
      if (!dbs.length) {
        console.log("  (none — share the program library with the integration via ••• → Connections)");
      } else {
        for (const d of dbs) console.log(`  • ${d.title}\n      id: ${d.id}`);
        console.log("\nSet NOTION_PROGRAM_LIBRARY_DB_ID to the matching id above and re-run.");
      }
    } catch (se) {
      console.error(`  search failed: ${se.message}`);
    }
    process.exit(1);
  }
  console.log(`Found ${pages.length} template page(s).\n`);

  for (const page of pages) {
    const title = Object.values(page.properties).find((p) => p.type === "title");
    console.log("─".repeat(70));
    console.log(`TEMPLATE: ${readProp(title) || "(untitled)"}`);
    console.log(`  page id: ${page.id}`);
    console.log("  properties:");
    for (const [name, prop] of Object.entries(page.properties)) {
      const val = readProp(prop);
      console.log(`    • ${name}  [${prop.type}]${val != null && String(val).trim() ? `  = ${String(val).slice(0, 70)}` : ""}`);
    }
    const blocks = await headings(page.id);
    if (blocks.length) {
      console.log("  content:");
      blocks.forEach((h) => console.log(`    ${h}`));
    }
    console.log("");
  }
  console.log("Share this output and I'll confirm/adjust the section mapping in api/_lib/notionTemplates.js.\n");
}

main().catch((e) => { console.error("Inspect failed:", e.message); process.exit(1); });
