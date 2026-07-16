// Throwaway audit (Task 1): list distinct free-text values currently stored in
// the Assessment Form Database for the three fields being converted to
// multi-select. Read-only. No schema changes. Run: node scripts/audit-injuries.mjs
import { Client } from "@notionhq/client";
import { readFileSync } from "node:fs";

// Load .env manually (no dotenv dependency assumed).
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB = "374930f9-6897-8025-a023-c4e6f6608f74"; // Assessment Form Database

// Target fields (matched case-insensitively / fuzzily against live schema).
const TARGETS = [
  { label: "Current Injuries", match: (n) => /current/i.test(n) && /injur/i.test(n) },
  { label: "Previous Injuries", match: (n) => /prev/i.test(n) && /injur/i.test(n) },
  { label: "Pain Triggers", match: (n) => /pain/i.test(n) && /trigger/i.test(n) },
];

function plain(prop) {
  if (!prop) return [];
  switch (prop.type) {
    case "title": return [prop.title.map((t) => t.plain_text).join("")];
    case "rich_text": return [prop.rich_text.map((t) => t.plain_text).join("")];
    case "select": return prop.select ? [prop.select.name] : [];
    case "multi_select": return prop.multi_select.map((o) => o.name);
    default: return [];
  }
}

const db = await notion.databases.retrieve({ database_id: DB });
const props = Object.keys(db.properties);
console.log("=== Assessment DB properties ===");
console.log(props.join("\n"));

// Resolve each target to an actual property name.
const resolved = TARGETS.map((t) => {
  const name = props.find(t.match);
  return { ...t, name, type: name ? db.properties[name].type : null };
});

// Pull all pages.
const rows = [];
let cursor;
do {
  const res = await notion.databases.query({ database_id: DB, start_cursor: cursor, page_size: 100 });
  rows.push(...res.results);
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

console.log(`\n=== ${rows.length} records scanned ===`);

for (const t of resolved) {
  console.log(`\n----- ${t.label} -----`);
  if (!t.name) { console.log("(!) No matching property found in this database."); continue; }
  console.log(`(column: "${t.name}" · type: ${t.type})`);
  const counts = new Map();
  for (const page of rows) {
    for (const raw of plain(page.properties[t.name])) {
      const v = (raw || "").trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  if (!counts.size) { console.log("(no values stored)"); continue; }
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([v, n]) => console.log(`  [${n}] ${v}`));
}
