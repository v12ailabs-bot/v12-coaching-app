// ---------------------------------------------------------------------------
// Notion -> Supabase migration (staging) for existing clients.
//
// Pulls each target client's data out of Notion and parks it in the `staged_*`
// tables (see db/schema.sql). When the client later signs up in the app, the
// front end calls claim_staged_data(), which matches by name and copies the
// staged rows into their real tables. So their history is waiting on first login.
//
// USAGE
//   1. Apply db/schema.sql to Supabase (creates the staged_* tables + claim fn).
//   2. Fill .env with NOTION_API_KEY, NOTION_DATABASE_ID, SUPABASE_URL,
//      SUPABASE_SERVICE_KEY  (+ optional sub-database ids below).
//   3. Dry run (prints what it found, writes nothing):
//        npm run migrate:notion
//   4. Write to Supabase:
//        npm run migrate:notion -- --write
//   Override the target names with:  --names samer,phill,sidi,keana
//
// WHAT NOTION ACTUALLY HOLDS
//   The main clients database (NOTION_DATABASE_ID) is the intake/application
//   form: goal, experience, the V12 assessment, etc. That is imported in full
//   and reliably. Check-in history, measurements, programs and nutrition are NOT
//   structurally part of that database — they only exist if you keep them in
//   SEPARATE Notion databases. If you do, set the *_DB_ID env vars and confirm
//   the property maps in CONFIG below; otherwise those sections are skipped with
//   a clear log (and every raw property + page text is still captured in
//   staged_clients.raw / .notes so nothing is lost).
// ---------------------------------------------------------------------------

import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";

// ----- config --------------------------------------------------------------

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const namesArg = (() => {
  const i = argv.indexOf("--names");
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
})();

const TARGET_NAMES = (namesArg || "samer,phill,sidi,keana")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Main intake DB property names (mirror api/_lib/notion.js — adjust if renamed).
const PROP = {
  email: "Email", name: "Name", goal: "Goal", daysAvailable: "Training Days",
  experienceLevel: "Experience Level", injuries: "Injuries", equipment: "Equipment",
  sessionLength: "Session Length", dietaryPreference: "Dietary Preference",
  allergies: "Allergies", calorieTarget: "Calorie Target", programTemplate: "Program Template",
  nervousSystem: "Nervous System Recruitment", densityToSize: "Muscular Density-to-Size",
  workCapacity: "Metabolic Work Capacity",
};

// OPTIONAL time-series databases. Leave the env var unset to skip a section.
// `link` is the property on each sub-DB row that names the client (a text/title/
// select holding the client's name, or an email property). Confirm the property
// names against your actual Notion before a --write run.
const CONFIG = {
  checkins: {
    dbId: process.env.NOTION_CHECKINS_DB_ID || null,
    link: "Client",
    map: { date: "Date", weight: "Weight", sleep: "Sleep", energy: "Energy",
           mood: "Mood", water: "Water", diet: "Nutrition", workout: "Training" },
  },
  measurements: {
    dbId: process.env.NOTION_MEASUREMENTS_DB_ID || null,
    link: "Client",
    map: { date: "Date", chest: "Chest", waist: "Waist", hips: "Hips", arms: "Arms",
           feeling: "Feeling", goal_progress: "Goal Progress", notes: "Notes" },
  },
};

// ----- env -----------------------------------------------------------------

const { NOTION_API_KEY, NOTION_DATABASE_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
for (const [k, v] of Object.entries({ NOTION_API_KEY, NOTION_DATABASE_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
  if (!v) { console.error(`Missing required env var: ${k}`); process.exit(1); }
}

const notion = new Client({ auth: NOTION_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ----- Notion helpers ------------------------------------------------------

function readProp(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
    case "rich_text": return (prop[prop.type] || []).map((t) => t.plain_text).join("").trim() || null;
    case "email": return prop.email || null;
    case "phone_number": return prop.phone_number || null;
    case "number": return prop.number;
    case "select": return prop.select?.name || null;
    case "status": return prop.status?.name || null;
    case "multi_select": return (prop.multi_select || []).map((s) => s.name).join(", ") || null;
    case "checkbox": return prop.checkbox;
    case "url": return prop.url || null;
    case "date": return prop.date?.start || null;
    case "formula": {
      const f = prop.formula || {};
      return f.type === "date" ? f.date?.start ?? null : f[f.type] ?? null;
    }
    case "rollup": {
      const r = prop.rollup || {};
      if (r.type === "number") return r.number;
      if (r.type === "date") return r.date?.start || null;
      if (r.type === "array") return (r.array || []).map((x) => readProp(x)).filter((v) => v != null).join(", ") || null;
      return null;
    }
    default: return null;
  }
}

const readAllProps = (props) =>
  Object.fromEntries(Object.entries(props || {}).map(([k, v]) => [k, readProp(v)]));

// Concatenate a page's text blocks (one level of nesting) into plain text.
async function pageText(pageId, depth = 0) {
  if (depth > 1) return "";
  const out = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const b of res.results) {
      const rich = b[b.type]?.rich_text;
      if (Array.isArray(rich) && rich.length) out.push(rich.map((t) => t.plain_text).join(""));
      if (b.has_children) out.push(await pageText(b.id, depth + 1));
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out.filter(Boolean).join("\n");
}

const nameKey = (name) =>
  String(name || "").trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");

const toScore = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : null;
};
const toInt = (v) => { const n = parseInt(v); return Number.isFinite(n) ? n : null; };
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// ----- pull ----------------------------------------------------------------

// Scan the main DB and return the pages whose name matches a target key.
async function findTargets() {
  const targets = new Set(TARGET_NAMES.map(nameKey));
  const found = new Map();   // key -> page
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: NOTION_DATABASE_ID, start_cursor: cursor, page_size: 100 });
    for (const page of res.results) {
      const name = readProp(page.properties?.[PROP.name]);
      const key = nameKey(name);
      if (key && targets.has(key) && !found.has(key)) found.set(key, page);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return found;
}

// Pull time-series rows from an optional sub-DB that belong to this client.
async function pullSeries(section, clientName, clientEmail) {
  const cfg = CONFIG[section];
  if (!cfg.dbId) return [];
  const wantKey = nameKey(clientName);
  const wantEmail = (clientEmail || "").toLowerCase();
  const rows = [];
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: cfg.dbId, start_cursor: cursor, page_size: 100 });
    for (const page of res.results) {
      const linkVal = readProp(page.properties?.[cfg.link]);
      const ok = linkVal && (nameKey(linkVal) === wantKey || String(linkVal).toLowerCase() === wantEmail);
      if (!ok) continue;
      const r = {};
      for (const [field, propName] of Object.entries(cfg.map)) r[field] = readProp(page.properties?.[propName]);
      rows.push(r);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// ----- write ---------------------------------------------------------------

async function stageClient(key, page) {
  const p = page.properties;
  const get = (k) => readProp(p[PROP[k]]);
  const name = get("name");
  const email = (get("email") || "").toLowerCase() || null;

  const client = {
    client_key: key,
    name, email,
    goal: get("goal"),
    experience_level: get("experienceLevel"),
    days_available: get("daysAvailable") == null ? null : String(get("daysAvailable")),
    injuries: get("injuries"),
    equipment: get("equipment"),
    session_length: get("sessionLength") == null ? null : String(get("sessionLength")),
    dietary_preference: get("dietaryPreference"),
    allergies: get("allergies"),
    calorie_target: get("calorieTarget") == null ? null : String(get("calorieTarget")),
    program_template: get("programTemplate"),
    nervous_system_recruitment: toScore(get("nervousSystem")),
    muscular_density_to_size: toScore(get("densityToSize")),
    metabolic_work_capacity: toScore(get("workCapacity")),
    notes: await pageText(page.id),
    raw: readAllProps(p),
  };

  const daily = (await pullSeries("checkins", name, email)).map((r) => ({
    client_key: key, date: r.date, weight: toNum(r.weight), sleep: toInt(r.sleep),
    energy: toInt(r.energy), mood: toInt(r.mood), water: toInt(r.water),
    diet: r.diet ?? null, workout: r.workout ?? null,
  })).filter((r) => r.date);

  const weekly = (await pullSeries("measurements", name, email)).map((r) => ({
    client_key: key, date: r.date, chest: toNum(r.chest), waist: toNum(r.waist),
    hips: toNum(r.hips), arms: toNum(r.arms), feeling: toInt(r.feeling),
    goal_progress: toInt(r.goal_progress), notes: r.notes ?? null,
  })).filter((r) => r.date);

  return { client, daily, weekly };
}

async function writeStaged({ client, daily, weekly }) {
  const key = client.client_key;
  let err = (await supabase.from("staged_clients").upsert(client, { onConflict: "client_key" })).error;
  if (err) throw err;
  // Replace child rows for a clean, idempotent re-run.
  for (const t of ["staged_daily_checkins", "staged_weekly_checkins"]) {
    err = (await supabase.from(t).delete().eq("client_key", key)).error;
    if (err) throw err;
  }
  if (daily.length) { err = (await supabase.from("staged_daily_checkins").insert(daily)).error; if (err) throw err; }
  if (weekly.length) { err = (await supabase.from("staged_weekly_checkins").insert(weekly)).error; if (err) throw err; }
}

// ----- main ----------------------------------------------------------------

async function main() {
  console.log(`\nNotion → Supabase migration  (${WRITE ? "WRITE" : "DRY RUN"})`);
  console.log(`Targets: ${TARGET_NAMES.join(", ")}`);
  for (const [section, cfg] of Object.entries(CONFIG)) {
    console.log(`  ${section}: ${cfg.dbId ? `db ${cfg.dbId}` : "not configured — skipped"}`);
  }
  console.log("");

  const found = await findTargets();
  const missing = TARGET_NAMES.filter((n) => !found.has(nameKey(n)));
  if (missing.length) console.log(`⚠ Not found in Notion: ${missing.join(", ")}`);

  for (const [key, page] of found) {
    const staged = await stageClient(key, page);
    console.log(`• ${staged.client.name || key} [${key}] — ${staged.client.email || "no email"}`);
    console.log(`    goal: ${staged.client.goal || "—"} | assessment: ` +
      `${staged.client.nervous_system_recruitment ?? "—"}/${staged.client.muscular_density_to_size ?? "—"}/${staged.client.metabolic_work_capacity ?? "—"}`);
    console.log(`    daily check-ins: ${staged.daily.length} | weekly/measurements: ${staged.weekly.length} | page text: ${staged.client.notes ? `${staged.client.notes.length} chars` : "none"}`);
    if (WRITE) { await writeStaged(staged); console.log("    ✓ staged to Supabase"); }
  }

  console.log(`\n${found.size} client(s) ${WRITE ? "staged" : "previewed"}.`);
  if (!WRITE) console.log("Re-run with --write to persist.\n");
  else console.log("Done. Data will attach automatically when each client signs up with a matching name.\n");
}

main().catch((e) => { console.error("\nMigration failed:", e.message); process.exit(1); });
