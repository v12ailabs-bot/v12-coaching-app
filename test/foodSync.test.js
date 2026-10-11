import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPage, validate, planSync, runSync, fetchAllPages, contentHash } from "../api/_lib/foodSync.js";

const t = (s) => ({ type: "rich_text", rich_text: s ? [{ plain_text: s }] : [] });
const sel = (n) => ({ type: "select", select: n ? { name: n } : null });
const numP = (n) => ({ type: "number", number: n });

function page(over = {}, id = "p1", num = 1) {
  return {
    id, last_edited_time: "2026-10-01T10:00:00.000Z", archived: false, in_trash: false,
    properties: {
      "Food ID": { type: "unique_id", unique_id: { prefix: "FD", number: num } },
      Name: { type: "title", title: [{ plain_text: "Chicken breast, skinless, cooked" }] },
      "Record type": sel("Ingredient"), Category: sel("Poultry"), State: sel("Cooked"), "Cooking method": sel("Grilled"),
      "Canned liquid": sel(null), "Local names / search terms": t("grilled chicken; poulet"),
      "Region tags": { type: "multi_select", multi_select: [{ name: "International" }] },
      "Energy (kcal)": numP(165), "Protein (g)": numP(31), "Carbs (g)": numP(0), "Fat (g)": numP(3.6),
      "Source type": sel("USDA FoodData Central"), "Source reference": t("FDC 171477"),
      "Match quality": sel("Exact"), "Verification status": sel("Verified"),
      "Verified on": { type: "date", date: { start: "2026-09-30" } }, Active: { type: "checkbox", checkbox: true },
      "Dedupe key": { type: "formula", formula: { type: "string", string: "k" + num } },
      ...over,
    },
  };
}

test("mapPage reads the real property names and keeps null distinct from 0", () => {
  const r = mapPage(page({ "Carbs (g)": numP(null) }));
  assert.equal(r.food_code, "FD-1");
  assert.deepEqual(r.aliases, ["grilled chicken", "poulet"]);
  assert.equal(r.carbs_per_100g, null);
  assert.equal(mapPage(page()).carbs_per_100g, 0);
  assert.equal(r.counterpart_notion_id, null); // optional relation absent
});

test("a complete Verified row is publishable", () => assert.equal(validate(mapPage(page())).publishable, true));

test("each publish rule blocks independently", () => {
  const cases = {
    "Draft status": { "Verification status": sel("Draft") },
    "missing nutrient": { "Protein (g)": numP(null) },
    "negative": { "Fat (g)": numP(-1) },
    "macros over 100": { "Protein (g)": numP(60), "Carbs (g)": numP(40), "Fat (g)": numP(5) },
    "energy over 900": { "Energy (kcal)": numP(901) },
    "canned w/o liquid": { State: sel("Canned"), "Cooking method": sel(null) },
    "cooked w/o method": { "Cooking method": sel("None") },
    "no source type": { "Source type": sel(null) },
    "no source ref": { "Source reference": t("") },
    "proxy": { "Match quality": sel("Proxy") },
    "inactive": { Active: { type: "checkbox", checkbox: false } },
  };
  for (const [name, over] of Object.entries(cases)) assert.equal(validate(mapPage(page(over))).publishable, false, name);
});

test("energy mismatch is a warning, not a blocker", () => {
  const v = validate(mapPage(page({ "Energy (kcal)": numP(300) })));
  assert.equal(v.publishable, true);
  assert.ok(v.warnings.some((w) => /macro estimate/.test(w)));
});

test("planSync: all-blank Draft starter rows are stored unpublished", () => {
  const p = page({ "Verification status": sel("Draft"), "Energy (kcal)": numP(null), "Protein (g)": numP(null), "Carbs (g)": numP(null), "Fat (g)": numP(null) });
  const plan = planSync({ pages: [p], existing: [], mode: "full" });
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].row.is_published, false);
  assert.equal(plan.create[0].row.kcal_per_100g, null);
});

test("planSync: missing Food ID / Name fails that row only", () => {
  const bad = page({}, "bad"); bad.properties["Food ID"] = { type: "unique_id", unique_id: null };
  const plan = planSync({ pages: [bad, page({}, "ok", 2)], existing: [], mode: "full" });
  assert.equal(plan.failed.length, 1);
  assert.equal(plan.create.length, 1);
});

test("planSync: unchanged rows are skipped, changed rows update, hash is stable", () => {
  const first = planSync({ pages: [page()], existing: [], mode: "full" }).create[0].row;
  const existing = [{ id: "u1", notion_page_id: "p1", food_code: "FD-1", content_hash: first.content_hash, is_active: true }];
  assert.equal(planSync({ pages: [page()], existing, mode: "full" }).unchanged, 1);
  const changed = planSync({ pages: [page({ "Protein (g)": numP(30) })], existing, mode: "full" });
  assert.equal(changed.update.length, 1);
  assert.equal(contentHash({ name: "a" }), contentHash({ name: "a" }));
});

test("planSync: warns when Verified State changes or nutrients move without a new Verified on date", () => {
  const first = planSync({ pages: [page()], existing: [], mode: "full" }).create[0].row;
  const existing = [{ id: "u1", notion_page_id: "p1", food_code: "FD-1", content_hash: first.content_hash, is_active: true,
    verification_status: "Verified", verified_on: "2026-09-30", state: "Raw", record_type: "Ingredient", kcal_per_100g: 165, protein_per_100g: 20, carbs_per_100g: 0, fat_per_100g: 3.6 }];
  const w = planSync({ pages: [page({ "Protein (g)": numP(30) })], existing, mode: "full" }).warnings.map((x) => x.warning).join("|");
  assert.match(w, /State changed/);
  assert.match(w, /Verified on date did not/);
});

test("deactivation happens only on full passes, and never deletes", () => {
  const existing = [{ id: "u9", notion_page_id: "gone", food_code: "FD-9", content_hash: "x", is_active: true }];
  assert.equal(planSync({ pages: [], existing, mode: "full" }).deactivate.length, 1);
  assert.equal(planSync({ pages: [], existing, mode: "incremental" }).deactivate.length, 0);
  const archived = page(); archived.in_trash = true;
  assert.equal(planSync({ pages: [archived], existing: [], mode: "full" }).create[0].row.is_active, false);
});

// ---- runSync with an in-memory fake Supabase --------------------------------
function fakeDb() {
  const tables = { foods: [], food_sync_runs: [] };
  const q = (name) => {
    let rows = tables[name], filters = [], orderDesc = false, lim = null;
    const api = {
      select() { return api; }, eq(k, v) { filters.push((r) => r[k] === v); return api; },
      not(k, _op, v) { filters.push((r) => r[k] !== v); return api; },
      order() { orderDesc = true; return api; }, limit(n) { lim = n; return api; },
      range(a, b) { return Promise.resolve({ data: rows.slice(a, b + 1), error: null }); },
      maybeSingle() { let r = rows.filter((x) => filters.every((f) => f(x))); if (orderDesc) r = [...r].reverse(); return Promise.resolve({ data: r[0] ?? null, error: null }); },
      single() { return Promise.resolve({ data: api._ins, error: null }); },
      insert(row) { const r = { id: `run${rows.length}`, finished_at: null, ...row }; rows.push(r); api._ins = r; return api; },
      upsert(row, { onConflict }) { const i = rows.findIndex((r) => r[onConflict] === row[onConflict]); if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ id: `f${rows.length}`, ...row }); return Promise.resolve({ error: null }); },
      update(patch) { return { eq(k, v) { rows.filter((r) => r[k] === v).forEach((r) => Object.assign(r, patch)); return Promise.resolve({ error: null }); } }; },
    };
    return api;
  };
  return { tables, from: q };
}
const fakeFetch = (pages) => async () => ({ ok: true, status: 200, json: async () => ({ results: pages, has_more: false }), text: async () => "" });

test("runSync is idempotent: second run creates nothing, writes nothing", async () => {
  const db = fakeDb();
  const pages = [page({}, "p1", 1), page({}, "p2", 2)];
  const a = await runSync({ db, token: "t", mode: "full", fetchImpl: fakeFetch(pages), log() {} });
  assert.equal(a.created, 2);
  const b = await runSync({ db, token: "t", mode: "full", fetchImpl: fakeFetch(pages), log() {} });
  assert.deepEqual([b.created, b.updated, b.unchanged], [0, 0, 2]);
  assert.equal(db.tables.foods.length, 2); // no duplicates
});

test("runSync dry run writes nothing; a source change updates in place", async () => {
  const db = fakeDb();
  const dry = await runSync({ db, token: "t", mode: "full", dryRun: true, fetchImpl: fakeFetch([page()]), log() {} });
  assert.equal(dry.created, 1); assert.equal(db.tables.foods.length, 0); assert.equal(db.tables.food_sync_runs.length, 0);
  await runSync({ db, token: "t", mode: "full", fetchImpl: fakeFetch([page()]), log() {} });
  const r = await runSync({ db, token: "t", mode: "full", fetchImpl: fakeFetch([page({ "Protein (g)": numP(29) })]), log() {} });
  assert.equal(r.updated, 1); assert.equal(db.tables.foods.length, 1); assert.equal(db.tables.foods[0].protein_per_100g, 29);
});

test("runSync refuses to mass-deactivate on an empty full pass", async () => {
  const db = fakeDb();
  await runSync({ db, token: "t", mode: "full", fetchImpl: fakeFetch([page()]), log() {} });
  await assert.rejects(() => runSync({ db, token: "t", mode: "full", fetchImpl: fakeFetch([]), log() {} }), /refusing to deactivate/);
  assert.equal(db.tables.foods[0].is_active, true);
});

test("fetchAllPages paginates and backs off on 429", async () => {
  let calls = 0, slept = 0;
  const impl = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 429, headers: { get: () => "1" }, text: async () => "" };
    if (calls === 2) return { ok: true, status: 200, json: async () => ({ results: [{ id: "a" }], has_more: true, next_cursor: "c" }) };
    return { ok: true, status: 200, json: async () => ({ results: [{ id: "b" }], has_more: false }) };
  };
  const pages = await fetchAllPages({ token: "t", fetchImpl: impl, sleepImpl: async (ms) => { slept += ms; } });
  assert.deepEqual(pages.map((p) => p.id), ["a", "b"]);
  assert.equal(slept, 1000);
});
