import { createHash } from "node:crypto";

// One-way Notion "V12 Food Library" -> Supabase `foods` sync. Notion is the
// source of truth; nothing here ever writes back to Notion. Dependencies
// (Supabase client, fetch) are injected so the logic is testable with fixtures.

export const NOTION_VERSION = "2025-09-03"; // data-source model
export const DEFAULT_DATA_SOURCE_ID = "8d072f40-1e49-4756-890a-7348bde8e6c3";
const OVERLAP_MS = 10 * 60 * 1000; // Notion last_edited_time is minute-granular

// ---- Notion property readers (tolerate missing / unexpected types) ---------
const text = (p) => {
  if (!p) return null;
  const arr = p.type === "title" ? p.title : p.type === "rich_text" ? p.rich_text : null;
  if (!arr) return null;
  const s = arr.map((t) => t.plain_text).join("").trim();
  return s || null;
};
const select = (p) => (p?.type === "select" ? p.select?.name ?? null : null);
const multi = (p) => (p?.type === "multi_select" ? p.multi_select.map((o) => o.name) : []);
const num = (p) => (p?.type === "number" && typeof p.number === "number" ? p.number : null);
const date = (p) => (p?.type === "date" ? p.date?.start?.slice(0, 10) ?? null : null);
const url = (p) => (p?.type === "url" ? p.url ?? null : null);
const checkbox = (p) => (p?.type === "checkbox" ? p.checkbox === true : false);
const uniqueId = (p) => (p?.type === "unique_id" && p.unique_id?.number != null
  ? (p.unique_id.prefix ? `${p.unique_id.prefix}-${p.unique_id.number}` : String(p.unique_id.number)) : null);
const formulaStr = (p) => (p?.type === "formula" && p.formula?.type === "string" ? p.formula.string ?? null : null);
const relationId = (p) => (p?.type === "relation" ? p.relation?.[0]?.id ?? null : null);

// Notion page -> foods row shape (before validation/publish decision).
export function mapPage(page) {
  const P = page.properties || {};
  return {
    notion_page_id: page.id,
    food_code: uniqueId(P["Food ID"]),
    name: text(P["Name"]),
    record_type: select(P["Record type"]),
    category: select(P["Category"]),
    aliases: (text(P["Local names / search terms"]) || "").split(";").map((s) => s.trim()).filter(Boolean),
    region_tags: multi(P["Region tags"]),
    brand: text(P["Brand"]),
    state: select(P["State"]),
    cooking_method: select(P["Cooking method"]),
    canned_liquid: select(P["Canned liquid"]),
    preparation_notes: text(P["Preparation notes"]),
    // Free text like "cup=158 g; tbsp=9.9 g", stored verbatim and parsed by the app
    // (src/lib/householdMeasures.js). Empty/absent property -> null.
    household_measures: text(P["Household measures"]),
    kcal_per_100g: num(P["Energy (kcal)"]),
    protein_per_100g: num(P["Protein (g)"]),
    carbs_per_100g: num(P["Carbs (g)"]),
    fat_per_100g: num(P["Fat (g)"]),
    source_type: select(P["Source type"]),
    source_reference: text(P["Source reference"]),
    source_food_description: text(P["Source food description"]),
    source_url: url(P["Source URL"]),
    source_accessed: date(P["Source accessed"]),
    match_quality: select(P["Match quality"]),
    verification_status: select(P["Verification status"]),
    verified_on: date(P["Verified on"]),
    is_active: checkbox(P["Active"]) && !page.in_trash && !page.archived,
    dedupe_key: formulaStr(P["Dedupe key"]),
    notion_last_edited_at: page.last_edited_time ?? null,
    // optional relations — absent today; nullable when they appear
    counterpart_notion_id: relationId(P["Counterpart"]),
    replaced_by_notion_id: relationId(P["Replaced by"]),
  };
}

// ---- Validation (independent of the Notion formulas) -----------------------
const NUTRIENTS = ["kcal_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"];

export function validate(r) {
  const reasons = [], warnings = [];
  if (!r.is_active) reasons.push("not active");
  if (r.verification_status !== "Verified") reasons.push(`verification status is ${r.verification_status ?? "empty"}`);
  const missing = NUTRIENTS.filter((k) => r[k] == null);
  if (missing.length) reasons.push(`missing nutrients: ${missing.join(", ")}`);
  const neg = NUTRIENTS.filter((k) => r[k] != null && !(r[k] >= 0));
  if (neg.length) reasons.push(`negative nutrients: ${neg.join(", ")}`);
  if (!missing.length) {
    if (r.protein_per_100g + r.carbs_per_100g + r.fat_per_100g > 100) reasons.push("protein + carbs + fat exceeds 100 g per 100 g");
    if (r.kcal_per_100g > 900) reasons.push("energy exceeds 900 kcal per 100 g");
    const est = 4 * (r.protein_per_100g + r.carbs_per_100g) + 9 * r.fat_per_100g;
    if (Math.abs(r.kcal_per_100g - est) > Math.max(20, 0.2 * est)) {
      warnings.push(`energy ${r.kcal_per_100g} kcal differs from macro estimate ${Math.round(est)} kcal`);
    }
  }
  if (r.state === "Canned" && !r.canned_liquid) reasons.push("canned food needs Canned liquid");
  if (r.state === "Cooked" && (!r.cooking_method || r.cooking_method === "None")) reasons.push("cooked food needs a cooking method");
  if (!r.source_type) reasons.push("missing source type");
  if (!r.source_reference) reasons.push("missing source reference");
  // Proxy matches (e.g. a local dish approximated from a close food) are allowed through: shown as a warning, not a blocker.
  if (r.match_quality === "Proxy") warnings.push("match quality is Proxy (approximate nutrition)");
  for (const k of NUTRIENTS) {
    if (r[k] != null && Math.round(r[k] * 100) / 100 !== r[k]) warnings.push(`${k} has more than 2 decimals and will be rounded`);
  }
  return { publishable: reasons.length === 0, reasons, warnings };
}

// Hard requirements without which a row can't be stored at all.
export function requiredFieldError(r) {
  if (!r.food_code) return "missing Food ID";
  if (!r.name) return "missing Name";
  return null;
}

const HASH_FIELDS = ["food_code", "name", "record_type", "category", "aliases", "region_tags", "brand", "state", "cooking_method", "canned_liquid", "preparation_notes", "household_measures",
  ...NUTRIENTS, "source_type", "source_reference", "source_food_description", "source_url", "source_accessed", "match_quality", "verification_status", "verified_on",
  "is_active", "is_published", "dedupe_key", "counterpart_notion_id", "replaced_by_notion_id"];

export const contentHash = (row) => createHash("sha256").update(JSON.stringify(HASH_FIELDS.map((k) => row[k] ?? null))).digest("hex");

// ---- Notion fetch with pagination + backoff --------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchAllPages({ token, dataSourceId = DEFAULT_DATA_SOURCE_ID, since = null, fetchImpl = fetch, sleepImpl = sleep }) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
      ...(since ? { filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } } } : {}) };
    let res, attempt = 0;
    for (;;) {
      res = await fetchImpl(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        const retryAfter = Number(res.headers?.get?.("retry-after"));
        await sleepImpl(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        attempt++;
        continue;
      }
      break;
    }
    if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    pages.push(...json.results);
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return pages;
}

// ---- Core sync -------------------------------------------------------------
const isMissingTable = (e) => e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));

async function loadExisting(db, { tolerateMissing = false } = {}) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("foods")
      .select("id,notion_page_id,food_code,content_hash,is_active,verification_status,verified_on,state,record_type,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g")
      .range(from, from + 999);
    if (error) { if (tolerateMissing && isMissingTable(error)) return []; throw error; }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// Pure planning step: pages + existing rows -> what to do. No I/O.
export function planSync({ pages, existing, mode, now = new Date().toISOString() }) {
  const byPage = new Map(existing.map((e) => [e.notion_page_id, e]));
  const plan = { create: [], update: [], unchanged: 0, deactivate: [], failed: [], warnings: [] };
  const seen = new Set();

  for (const page of pages) {
    const r = mapPage(page);
    seen.add(page.id);
    const label = r.food_code || page.id;
    const reqErr = requiredFieldError(r);
    if (reqErr) { plan.failed.push({ id: label, error: reqErr }); continue; }

    const v = validate(r);
    const row = { ...r, is_published: v.publishable };
    delete row.counterpart_notion_id; delete row.replaced_by_notion_id;
    row.content_hash = contentHash({ ...r, is_published: v.publishable });
    for (const w of v.warnings) plan.warnings.push({ id: label, warning: w });
    if (!v.publishable && r.is_active) plan.warnings.push({ id: label, warning: `not published: ${v.reasons.join("; ")}` });

    const prev = byPage.get(page.id);
    if (prev) {
      if (prev.verification_status === "Verified") {
        if (prev.state !== r.state) plan.warnings.push({ id: label, warning: `State changed on a Verified row (${prev.state} -> ${r.state})` });
        if (prev.record_type !== r.record_type) plan.warnings.push({ id: label, warning: `Record type changed on a Verified row` });
        const changed = NUTRIENTS.some((k) => prev[k] != null && r[k] != null ? Number(prev[k]) !== r[k] : (prev[k] == null) !== (r[k] == null));
        if (changed && prev.verified_on === r.verified_on) plan.warnings.push({ id: label, warning: "nutrients changed but Verified on date did not" });
      }
      if (prev.content_hash === row.content_hash) { plan.unchanged++; continue; }
      plan.update.push({ row: { ...row, synced_at: now }, relations: { counterpart: r.counterpart_notion_id, replacedBy: r.replaced_by_notion_id } });
    } else {
      plan.create.push({ row: { ...row, synced_at: now }, relations: { counterpart: r.counterpart_notion_id, replacedBy: r.replaced_by_notion_id } });
    }
  }

  // Missing / archived / trashed in Notion -> deactivate, never delete. Only a
  // full pass sees the whole library, so only a full pass can conclude "missing".
  if (mode === "full") {
    for (const e of existing) if (e.is_active && !seen.has(e.notion_page_id)) plan.deactivate.push(e);
  }
  return plan;
}

export async function runSync({ db, token, dataSourceId, mode = "incremental", dryRun = false, fetchImpl, sleepImpl, log = console.log }) {
  let since = null;
  if (mode === "incremental") {
    const { data: last } = await db.from("food_sync_runs").select("started_at").eq("dry_run", false).not("finished_at", "is", null)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    since = last ? new Date(new Date(last.started_at).getTime() - OVERLAP_MS).toISOString() : null; // first run = everything
  }

  const [pages, existing] = await Promise.all([fetchAllPages({ token, dataSourceId, since, fetchImpl, sleepImpl }), loadExisting(db, { tolerateMissing: dryRun })]);

  // Guard: a full pass returning nothing while the DB has foods is far more
  // likely an API/permission problem than a deleted library. Don't mass-deactivate.
  if (mode === "full" && pages.length === 0 && existing.some((e) => e.is_active)) {
    throw new Error("Full sync returned 0 pages but active foods exist — refusing to deactivate everything");
  }

  const plan = planSync({ pages, existing, mode });
  const summary = { mode, dryRun, fetched: pages.length, created: plan.create.length, updated: plan.update.length, unchanged: plan.unchanged,
    deactivated: plan.deactivate.length, failed: plan.failed.length, errors: [...plan.failed], warnings: plan.warnings };
  if (dryRun) return { ...summary, plan };

  const { data: run, error: runErr } = await db.from("food_sync_runs").insert({ mode, dry_run: false }).select("id").single();
  if (runErr) throw runErr;

  for (const { row } of [...plan.create, ...plan.update]) {
    const { error } = await db.from("foods").upsert(row, { onConflict: "notion_page_id" });
    if (error) { summary.failed++; summary.errors.push({ id: row.food_code, error: error.message }); if (plan.create.some((c) => c.row === row)) summary.created--; else summary.updated--; }
  }
  for (const e of plan.deactivate) {
    const { error } = await db.from("foods").update({ is_active: false, is_published: false, synced_at: new Date().toISOString() }).eq("id", e.id);
    if (error) { summary.failed++; summary.deactivated--; summary.errors.push({ id: e.food_code, error: error.message }); }
  }
  // Optional relations: resolved after all rows exist, only if Notion has them.
  const rel = [...plan.create, ...plan.update].filter((p) => p.relations.counterpart || p.relations.replacedBy);
  if (rel.length) {
    const { data: all } = await db.from("foods").select("id,notion_page_id");
    const idOf = new Map((all || []).map((f) => [f.notion_page_id, f.id]));
    for (const p of rel) {
      await db.from("foods").update({ counterpart_food_id: idOf.get(p.relations.counterpart) ?? null, replaced_by_food_id: idOf.get(p.relations.replacedBy) ?? null })
        .eq("notion_page_id", p.row.notion_page_id);
    }
  }

  await db.from("food_sync_runs").update({
    finished_at: new Date().toISOString(), created_count: summary.created, updated_count: summary.updated, unchanged_count: summary.unchanged,
    deactivated_count: summary.deactivated, failed_count: summary.failed, errors: summary.errors,
  }).eq("id", run.id);
  for (const w of plan.warnings) log(`[food-sync] ${w.id}: ${w.warning}`);
  return summary;
}
