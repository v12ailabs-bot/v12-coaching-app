// ---------------------------------------------------------------------------
// Google Sheets -> Supabase: import daily check-in history.
//
// Reads a check-in sheet, filters to the target clients, and loads their daily
// check-ins into Supabase, matching by client name. For a client who has ALREADY
// signed up (has a profile), rows go straight into daily_checkins. For one who
// hasn't, rows are staged in staged_daily_checkins keyed by name and attach
// automatically on signup via claim_staged_data() (see db/schema.sql).
//
// USAGE
//   1. Apply db/schema.sql (for the staged_* tables / claim function).
//   2. .env needs SUPABASE_URL, SUPABASE_SERVICE_KEY, and GOOGLE_API_KEY.
//   3. Dry run (reads the sheet, writes nothing):
//        npm run migrate:checkins
//   4. Write:
//        npm run migrate:checkins -- --write
//   Override:  --sheet <id>   --range 'Sheet1!A:Z'   --names 'keana shaw,samer'
//
// SHEET ACCESS
//   Uses the Sheets API v4 with an API key, so the sheet must be shared
//   "Anyone with the link – Viewer" and the API key must have the Google Sheets
//   API enabled. (For a PRIVATE sheet, share it with a service account instead
//   and swap fetchSheet() for a service-account read — ask and I'll wire it.)
//
// SHEET SHAPE
//   First row = headers. Columns are matched by header name (case-insensitive)
//   via HEADER_ALIASES below — order doesn't matter and extra columns are
//   ignored. A name column and a date column are required.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

// ----- args / config -------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i !== -1 ? (argv[i + 1] ?? true) : null; };
const WRITE = argv.includes("--write");

const SHEET_ID = flag("--sheet") || process.env.SHEET_ID || "1kYU_mqHZXJY6hIcwYTx27etJ18geseTfREih4YZNpM";
const RANGE = flag("--range") || process.env.SHEET_RANGE || "A:Z";
const TARGET_NAMES = (flag("--names") || "keana shaw,phill ormand,sidi,samer")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Logical field -> acceptable header names (lowercased). First match wins.
const HEADER_ALIASES = {
  name: ["client", "name", "client name", "athlete", "client_name"],
  date: ["date", "day", "check-in date", "checkin date", "check in date"],
  weight: ["weight", "bodyweight", "weight (lbs)", "weight(lbs)", "bw"],
  sleep: ["sleep", "sleep quality", "sleep (1-10)"],
  energy: ["energy", "energy level", "energy (1-10)"],
  mood: ["mood", "mood (1-10)"],
  water: ["water", "water (glasses)", "hydration", "glasses"],
  diet: ["diet", "nutrition", "nutrition today", "diet today"],
  workout: ["workout", "training", "training today", "session", "workout today"],
};

// ----- env -----------------------------------------------------------------

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_API_KEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_API_KEY })) {
  if (!v) { console.error(`Missing required env var: ${k}`); process.exit(1); }
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ----- helpers -------------------------------------------------------------

// Match key consistent with staged_name_key() in db/schema.sql: first token,
// lowercased, alphanumerics only. "Phill Ormand" -> "phill".
const nameKey = (name) =>
  String(name || "").trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");

const pad = (n) => String(n).padStart(2, "0");
function parseDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);          // ISO / YYYY-M-D
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);  // M/D/Y (US)
  if (m) { let [, a, b, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${pad(a)}-${pad(b)}`; }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const clean = (v) => { const s = v == null ? "" : String(v).trim(); return s || null; };

// ----- read sheet ----------------------------------------------------------

async function fetchSheet() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}` +
    `?majorDimension=ROWS&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 300)}\n` +
      `Check the sheet is shared "Anyone with the link – Viewer" and the API key has the Sheets API enabled.`);
  }
  const json = await res.json();
  return json.values || [];
}

// Resolve each logical field to a column index from the header row.
function mapColumns(header) {
  const norm = header.map((h) => String(h || "").trim().toLowerCase());
  const cols = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    cols[field] = norm.findIndex((h) => aliases.includes(h));
  }
  return cols;
}

// ----- main ----------------------------------------------------------------

async function main() {
  console.log(`\nGoogle Sheets → Supabase daily check-ins  (${WRITE ? "WRITE" : "DRY RUN"})`);
  console.log(`Sheet: ${SHEET_ID}  range: ${RANGE}`);
  console.log(`Targets: ${TARGET_NAMES.join(", ")}\n`);

  const rows = await fetchSheet();
  if (rows.length < 2) { console.log("Sheet has no data rows."); return; }

  const header = rows[0];
  const cols = mapColumns(header);
  if (cols.name < 0 || cols.date < 0) {
    console.error(`Could not find required columns. Headers seen: ${header.join(" | ")}`);
    console.error(`Need a name column (${HEADER_ALIASES.name.join("/")}) and a date column (${HEADER_ALIASES.date.join("/")}).`);
    process.exit(1);
  }
  const found = Object.entries(cols).filter(([, i]) => i >= 0).map(([f]) => f);
  console.log(`Mapped columns: ${found.join(", ")}\n`);

  const targetKeys = new Set(TARGET_NAMES.map(nameKey));
  const at = (row, field) => (cols[field] >= 0 ? row[cols[field]] : undefined);

  // Build per-client records, deduped by date (last row for a date wins).
  const byClient = new Map();   // key -> { name, byDate: Map<date, record> }
  let scanned = 0, skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawName = at(row, "name");
    const key = nameKey(rawName);
    if (!key || !targetKeys.has(key)) continue;
    scanned++;
    const date = parseDate(at(row, "date"));
    if (!date) { skipped++; continue; }
    const rec = {
      date,
      weight: toNum(at(row, "weight")),
      sleep: toInt(at(row, "sleep")),
      energy: toInt(at(row, "energy")),
      mood: toInt(at(row, "mood")),
      water: toInt(at(row, "water")),
      diet: clean(at(row, "diet")),
      workout: clean(at(row, "workout")),
    };
    if (!byClient.has(key)) byClient.set(key, { name: clean(rawName) || key, byDate: new Map() });
    byClient.get(key).byDate.set(date, rec);
  }
  if (skipped) console.log(`(skipped ${skipped} row(s) with an unparseable date)\n`);

  // Which targets are signed up? Match profiles by first-name key.
  const { data: profiles, error: profErr } = await supabase.from("profiles").select("id,name,email");
  if (profErr) throw profErr;
  const profByKey = new Map();
  for (const p of profiles || []) {
    const k = nameKey(p.name);
    if (!k) continue;
    if (!profByKey.has(k)) profByKey.set(k, []);
    profByKey.get(k).push(p);
  }

  const missing = TARGET_NAMES.filter((n) => !byClient.has(nameKey(n)));
  if (missing.length) console.log(`⚠ No rows in the sheet for: ${missing.join(", ")}\n`);

  for (const [key, { name, byDate }] of byClient) {
    const records = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    const matches = profByKey.get(key) || [];
    const signedUp = matches.length === 1 ? matches[0] : null;
    const route = matches.length > 1 ? "AMBIGUOUS profile → staging" : signedUp ? `profile ${signedUp.email}` : "not signed up → staging";
    console.log(`• ${name} [${key}] — ${records.length} check-ins (${records[0]?.date}…${records[records.length - 1]?.date}) → ${route}`);

    if (!WRITE) continue;

    if (signedUp) {
      const insert = records.map((r) => ({ client_id: signedUp.id, ...r }));
      const { error } = await supabase.from("daily_checkins")
        .upsert(insert, { onConflict: "client_id,date", ignoreDuplicates: true });
      if (error) throw error;
      console.log(`    ✓ ${insert.length} rows upserted into daily_checkins`);
    } else {
      const staged = records.map((r) => ({ client_key: key, ...r }));
      let { error } = await supabase.from("staged_daily_checkins").delete().eq("client_key", key);
      if (error) throw error;
      ({ error } = await supabase.from("staged_daily_checkins").insert(staged));
      if (error) throw error;
      console.log(`    ✓ ${staged.length} rows staged (attach on signup)`);
    }
  }

  console.log(`\n${byClient.size} client(s) ${WRITE ? "loaded" : "previewed"} from ${scanned} matched rows.`);
  if (!WRITE) console.log("Re-run with --write to persist.\n");
}

main().catch((e) => { console.error("\nImport failed:", e.message); process.exit(1); });
