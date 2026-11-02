import { test, mock } from "node:test";
import assert from "node:assert/strict";

// End-to-end handler test with every external dependency mocked (Supabase,
// Notion, Anthropic). Proves: a good plan becomes a DRAFT only (no write to
// programs/exercises), and a malformed AI plan returns 422 with ZERO writes.
const writes = [];
let nextTraining;

function fakeSupabase() {
  const tableData = {
    profiles: { id: "p1", role: "coach", nervous_system_recruitment: 5, muscular_density_to_size: 5, metabolic_work_capacity: 5, shared_program_owner_id: null, goal: "muscle", is_local: false },
    programs: { id: "prog-old" },
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "coach-1" } } }) },
    from(table) {
      let op = "select"; let rows = null;
      const q = {
        select() { return q; }, eq() { return q; }, neq() { return q; }, in() { return q; }, is() { return q; }, order() { return q; }, limit() { return q; },
        insert(r) { op = "insert"; rows = r; writes.push({ table, op, row: r }); return q; },
        update(r) { op = "update"; writes.push({ table, op, row: r }); return q; },
        delete() { op = "delete"; writes.push({ table, op }); return q; },
        maybeSingle() { return Promise.resolve({ data: op === "select" ? (tableData[table] ?? null) : null, error: null }); },
        single() { return Promise.resolve({ data: { id: table + "-new" }, error: null }); },
        then(res, rej) { return Promise.resolve({ data: op === "select" ? (table === "program_drafts" ? [] : table === "progression_models" || table === "exercises" ? [] : []) : null, error: null }).then(res, rej); },
      };
      return q;
    },
  };
}

mock.module("../api/_lib/supabaseAdmin.js", { namedExports: { supabaseAdmin: fakeSupabase() } });
mock.module("../api/_lib/notion.js", { namedExports: { getClientFromNotion: async () => ({ name: "Test Client", goal: "muscle", days_available: 2, experience_level: "Beginner" }) } });
mock.module("../api/_lib/leads.js", { namedExports: { getClientFromLead: async () => null } });
let templateImpl = async () => ({ id: "t1", name: "2-day full body", weeks: 8, days: 2, frameworkText: "TEMPLATE" });
mock.module("../api/_lib/notionTemplates.js", { namedExports: { getProgramTemplate: (...a) => templateImpl(...a) } });
mock.module("../api/_lib/anthropic.js", { namedExports: {
  generateTrainingPlan: async () => nextTraining,
  generateNutritionPlan: async () => ({ plan_name: "N", daily_calories: 2000, meals: [] }),
  reviseTrainingDay: async () => ({}),
} });

const { default: handler } = await import("../api/generate-program.js");

const res = () => { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const req = (body) => ({ method: "POST", headers: { authorization: "Bearer x" }, body });
const goodPlan = { program_name: "P", weeks: 12, weekly_split: [
  { day: "Monday", focus: "Full", exercises: [{ name: "Squat", sets: 3, reps: "5", rest_seconds: 150, section: "Main Compound Lift" }, { name: "Row", sets: 3, reps: "8", rest_seconds: 90, section: "Accessories" }] },
  { day: "Thursday", focus: "Full", exercises: [{ name: "Bench", sets: 3, reps: "5", rest_seconds: 150, section: "Main Compound Lift" }] },
] };

test("valid generation saves a DRAFT, never touches programs/exercises", async () => {
  writes.length = 0; nextTraining = goodPlan;
  const r = res();
  await handler(req({ client_email: "c@x.com", template_id: "t1", session_config: { arrangement: "in_person", session_minutes: 60 } }), r);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.ok(r.body.draft_id);
  assert.equal(r.body.exercises_created, 3);
  const drafts = writes.filter((w) => w.table === "program_drafts" && w.op === "insert");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].row.payload.weeks, 8, "template duration applied");
  assert.equal(drafts[0].row.session_config.session_minutes, 60);
  assert.equal(writes.filter((w) => (w.table === "programs" || w.table === "exercises") && w.op !== "select").length, 0, "active program + exercises untouched");
  assert.ok(!writes.some((w) => w.table === "profiles" && w.row?.onboarding_complete), "onboarding is only completed on approval");
});

test("malformed AI output -> 422 and no database writes at all", async () => {
  for (const bad of [{ program_name: "P", weekly_split: [{ day: "Monday", exercises: [{ name: "Squat", reps: "5" }] }] }, { weekly_split: [] }, null, "garbage"]) {
    writes.length = 0; nextTraining = bad;
    const r = res();
    await handler(req({ client_email: "c@x.com" }), r);
    assert.equal(r.code, 422, JSON.stringify(r.body));
    assert.equal(r.body.existing_program_unchanged, true);
    assert.equal(writes.length, 0, "no writes: " + JSON.stringify(writes));
  }
});

test("non-coach and bad requests are rejected", async () => {
  const r1 = res(); await handler({ method: "GET", headers: {}, body: {} }, r1); assert.equal(r1.code, 405);
  const r2 = res(); await handler(req({}), r2); assert.equal(r2.code, 400);
});

test("an explicitly chosen template that can't be loaded stops generation (no silent fallback, no writes)", async () => {
  for (const impl of [async () => { throw new Error("notion down"); }, async () => null]) {
    writes.length = 0; nextTraining = goodPlan; templateImpl = impl;
    const r = res();
    await handler(req({ client_email: "c@x.com", template_id: "t-missing" }), r);
    assert.ok(r.code === 502 || r.code === 404, String(r.code));
    assert.equal(writes.length, 0);
  }
  templateImpl = async () => ({ id: "t1", name: "2-day full body", weeks: 8, days: 2, frameworkText: "TEMPLATE" });
});
