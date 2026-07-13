// Read-only: lists every property (name + type) on the intake clients DB, and
// flags which are mapped/consumed by the app vs. currently ignored ("blind").
import { Client } from "@notionhq/client";
import { PROP } from "../api/_lib/notion.js";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const dbId = process.env.NOTION_DATABASE_ID;

// Derived from the app's live mapping so this audit never goes stale.
const MAPPED = new Set(Object.values(PROP));

const db = await notion.databases.retrieve({ database_id: dbId });
const props = Object.entries(db.properties).sort((a, b) => a[0].localeCompare(b[0]));

console.log(`\nIntake DB: ${db.title?.map((t) => t.plain_text).join("") || dbId}`);
console.log(`Total properties: ${props.length}\n`);

const blind = [];
for (const [name, def] of props) {
  const mapped = MAPPED.has(name);
  console.log(`${mapped ? "✅ MAPPED " : "❌ BLIND  "} [${def.type}]  ${name}`);
  if (!mapped) blind.push({ name, type: def.type });
}

console.log(`\n--- ${blind.length} BLIND properties (collected but AI never sees them) ---`);
for (const b of blind) console.log(`  [${b.type}] ${b.name}`);

// Also flag mapped names that no longer exist in the DB (stale mappings).
const dbNames = new Set(props.map(([n]) => n));
const stale = [...MAPPED].filter((n) => !dbNames.has(n));
if (stale.length) {
  console.log(`\n--- ${stale.length} STALE mappings (mapped in code, absent in DB) ---`);
  for (const s of stale) console.log(`  ${s}`);
}
