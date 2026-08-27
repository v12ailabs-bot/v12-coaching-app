// ---------------------------------------------------------------------------
// Runs every distinct exercise name currently in the `exercises` table
// through muscleGroupForExercise and prints any name it couldn't confidently
// place (fell through to the Full Body default rather than matching a real
// keyword rule) -- rather than silently defaulting, so the keyword mapping
// in src/lib/exerciseMuscleGroup.js can be reviewed and extended.
//
// USAGE
//   node --env-file=.env scripts/audit-exercise-diagram-mapping.mjs
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { muscleGroupForExercise } from "../src/lib/exerciseMuscleGroup.js";

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const { data, error } = await supabase.from("exercises").select("name");
if (error) throw error;

const names = [...new Set((data || []).map((r) => (r.name || "").trim()).filter(Boolean))].sort();
const unmatched = [];
const byGroup = {};

for (const name of names) {
  const { group, confident } = muscleGroupForExercise(name);
  if (!confident) unmatched.push(name);
  else (byGroup[group] = byGroup[group] || []).push(name);
}

console.log(`${names.length} distinct exercise names checked.\n`);
console.log("=== BY MUSCLE GROUP (confident matches) ===");
for (const [group, list] of Object.entries(byGroup).sort()) {
  console.log(`${group}: ${list.length}`);
}

console.log(`\n=== UNMATCHED — defaulted to Full Body, review these (${unmatched.length}) ===`);
unmatched.forEach((n) => console.log(`  - ${n}`));
if (unmatched.length === 0) console.log("  (none)");
