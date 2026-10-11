// Notion "V12 Food Library" -> Supabase `foods`. One-way; never writes to Notion.
//   npm run sync:foods -- --dry-run          print what would change, write nothing
//   npm run sync:foods                       incremental (edits since last run, 10 min overlap)
//   npm run sync:foods -- --full             full reconcile (also deactivates foods gone from Notion)
// Needs NOTION_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY (and optionally
// NOTION_FOOD_LIBRARY_DATA_SOURCE_ID) in .env. Run via the npm script so .env loads.
import { supabaseAdmin } from "../api/_lib/supabaseAdmin.js";
import { runSync } from "../api/_lib/foodSync.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const mode = args.has("--full") ? "full" : "incremental";

const result = await runSync({
  db: supabaseAdmin, token: process.env.NOTION_API_KEY, dataSourceId: process.env.NOTION_FOOD_LIBRARY_DATA_SOURCE_ID || undefined, mode, dryRun,
});
const { plan, warnings, errors, ...counts } = result;
console.log(JSON.stringify(counts, null, 2));
if (dryRun && plan) {
  for (const c of plan.create) console.log(`  + create ${c.row.food_code} ${c.row.name} (${c.row.is_published ? "published" : "not published"})`);
  for (const u of plan.update) console.log(`  ~ update ${u.row.food_code} ${u.row.name} (${u.row.is_published ? "published" : "not published"})`);
  for (const d of plan.deactivate) console.log(`  - deactivate ${d.food_code}`);
}
for (const w of warnings) console.log(`  warn ${w.id}: ${w.warning}`);
for (const e of errors) console.log(`  ERROR ${e.id}: ${e.error}`);
process.exit(errors.length ? 1 : 0);
