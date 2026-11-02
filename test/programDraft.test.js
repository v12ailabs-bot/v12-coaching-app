import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareDraftPlan, saveProgramDraft, applyDayRevision, ProgramValidationError } from "../api/_lib/programDraft.js";

// Recording fake of the supabase query builder: every call is logged; the
// response for a given "table.op" comes from `responses`.
function fakeDb(responses = {}) {
  const log = [];
  const from = (table) => {
    let op = "select";
    const q = {
      select() { return q; }, eq() { return q; }, in() { return q; }, neq() { return q; },
      insert(row) { op = "insert"; log.push({ table, op, row }); return q; },
      update(row) { op = "update"; log.push({ table, op, row }); return q; },
      delete() { op = "delete"; log.push({ table, op }); return q; },
      single() { return q; },
      then(res, rej) {
        const r = responses[`${table}.${op}`];
        return Promise.resolve(typeof r === "function" ? r() : r ?? { data: [], error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { from, log };
}

const good = {
  program_name: "P", weeks: 12,
  weekly_split: [
    { day: "Monday", focus: "Lower", exercises: [
      { name: "Back Squat", sets: 4, reps: "5", rest_seconds: 180, section: "Main Compound Lift" },
      { name: "Leg Curl", sets: 3, reps: "12", rest_seconds: 60, section: "Isolation" } ] },
    { day: "Thursday", focus: "Upper", exercises: [{ name: "Bench Press", sets: 4, reps: "5", rest_seconds: 150, section: "Main Compound Lift" }] },
  ],
};

test("invalid AI output is rejected before any DB access", () => {
  for (const bad of [null, "not json", {}, { program_name: "x", weekly_split: [{ day: "Monday", exercises: [{ name: "Squat", reps: "5" }] }] }]) {
    assert.throws(() => prepareDraftPlan(bad), ProgramValidationError);
  }
});

test("prepareDraftPlan normalises, forces template weeks, and warns on budget overrun", () => {
  const r = prepareDraftPlan(good, { weeks: 8, session_config: { session_minutes: 15, arrangement: "independent_online" }, days_available: 3 });
  assert.equal(r.plan.weeks, 8);
  assert.ok(r.warnings.some((w) => /3/.test(w.message) && /training day/.test(w.message)));
  assert.ok(r.estimates.length === 2);
  assert.ok(r.warnings.some((w) => /over the 15-minute budget/.test(w.message)));
});

test("saveProgramDraft writes only to program_drafts and supersedes the previous open draft", async () => {
  const db = fakeDb({ "program_drafts.select": { data: [{ id: "old" }], error: null }, "program_drafts.insert": { data: { id: "new" }, error: null } });
  const id = await saveProgramDraft(db, { clientId: "c", profileId: "c", template: { id: "t", name: "T" }, plan: good, warnings: [], sessionConfig: {} });
  assert.equal(id, "new");
  assert.ok(db.log.every((l) => l.table === "program_drafts"), "never touches programs/exercises");
  assert.deepEqual(db.log.map((l) => l.op), ["update", "insert"]);
  assert.equal(db.log[0].row.status, "superseded");
  assert.deepEqual(db.log[1].row.payload, db.log[1].row.original_payload);
});

test("a failed draft insert restores the previous draft", async () => {
  const db = fakeDb({ "program_drafts.select": { data: [{ id: "old" }], error: null }, "program_drafts.insert": { data: null, error: new Error("boom") } });
  await assert.rejects(saveProgramDraft(db, { clientId: "c", plan: good, warnings: [], sessionConfig: {} }), /boom/);
  const last = db.log[db.log.length - 1];
  assert.equal(last.op, "update");
  assert.equal(last.row.status, "draft");
});

test("applyDayRevision replaces only the requested day and records the revision", () => {
  const plan = prepareDraftPlan(good).plan;
  const draft = { payload: plan, revisions: [] };
  const next = applyDayRevision(draft, "Monday", { focus: "Lower (DB)", summary: "Swapped to dumbbells", exercises: [{ name: "Goblet Squat", sets: 3, reps: "10", rest_seconds: 90, section: "Main Compound Lift" }] }, "use dumbbells");
  assert.equal(next.payload.weekly_split[0].exercises[0].name, "Goblet Squat");
  assert.deepEqual(next.payload.weekly_split[1], plan.weekly_split[1]);
  assert.equal(plan.weekly_split[0].exercises[0].name, "Back Squat");
  assert.equal(next.revisions.length, 1);
  assert.equal(next.revisions[0].day, "Monday");
});

test("an invalid day revision is rejected and leaves the draft unchanged", () => {
  const plan = prepareDraftPlan(good).plan;
  const draft = { payload: plan, revisions: [] };
  assert.throws(() => applyDayRevision(draft, "Monday", { exercises: [{ name: "X", sets: 0, reps: "" }] }, "x"), ProgramValidationError);
  assert.throws(() => applyDayRevision(draft, "Monday", { exercises: [] }, "x"), ProgramValidationError);
  assert.equal(draft.payload.weekly_split[0].exercises[0].name, "Back Squat");
});

test("a day far under the session budget gets an advisory note", () => {
  const r = prepareDraftPlan(good, { session_config: { session_minutes: 90, arrangement: "independent_online" } });
  assert.ok(r.warnings.some((w) => /only about \d+ min of coached work against a 90-minute session/.test(w.message)));
});
