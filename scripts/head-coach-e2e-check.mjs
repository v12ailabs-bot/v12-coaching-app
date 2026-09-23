// ---------------------------------------------------------------------------
// HC-023 End-to-End check for the Head Coach REVIEW_CHECK_IN pipeline.
//
// Exercises the REAL, HTTP-callable handler exported by api/goal-insight.js
// (not the internal functions directly, which is what most of this
// feature's development-time testing did) through a full real cycle:
//   review a real check-in -> (if it proceeds to reasoning) a REAL Anthropic
//   API call -> approve the resulting recommendation -> record an outcome
// then reconstructs the full history (HC-018) and checks it's complete and
// internally consistent.
//
// This is NOT part of `npm test` -- it makes a real Anthropic API call (real
// cost, ~15-25s) and needs Supabase env vars, both incompatible with that
// suite's fast, free, zero-dependency convention (see
// test/headCoachGoldenCases.test.js's header for why). Run it manually
// after a change to the Head Coach pipeline, or before a deployment, as a
// real smoke test -- not on every commit.
//
// Needs .env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY.
// Needs a real coach profile id and a real coaching-tier client id with at
// least one daily_checkins row -- pass them as argv, or the script will
// pick the first coach and the first coaching-tier client with a check-in
// it finds.
//
//   npm run headcoach:e2e
//   npm run headcoach:e2e -- <coachId> <clientId>
//
// Requires Node's native TypeScript type-stripping (on by default since
// Node 23.6; this repo's api/_lib/*.ts modules are imported directly, same
// as every other ad hoc script used throughout this feature's development).
// ---------------------------------------------------------------------------

import { supabaseAdmin } from "../api/_lib/supabaseAdmin.js";
import goalInsightHandler from "../api/goal-insight.js";
import { reconstructTaskHistory } from "../api/_lib/headCoachAuditTrail.ts";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// The real handler authenticates via supabaseAdmin.auth.getUser(token) --
// this script isn't going through a real login, so it monkey-patches that
// one call to resolve as the target coach instead. Everything downstream of
// that point (task creation, context assembly, the real Claude call, rule
// evaluation, validation, authority, persistence) runs completely for real,
// unmodified -- this only replaces "verify a bearer token," not any Head
// Coach logic itself.
function fakeCoachAuth(coachId, coachEmail) {
  const original = supabaseAdmin.auth.getUser.bind(supabaseAdmin.auth);
  supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: coachId, email: coachEmail } } });
  return () => { supabaseAdmin.auth.getUser = original; };
}

async function main() {
  const [argCoachId, argClientId] = process.argv.slice(2);

  const coach = argCoachId
    ? (await supabaseAdmin.from("profiles").select("id,email").eq("id", argCoachId).maybeSingle()).data
    : (await supabaseAdmin.from("profiles").select("id,email").eq("role", "coach").limit(1).maybeSingle()).data;
  if (!coach) throw new Error("No coach profile found.");

  let clientId = argClientId;
  let checkinId;
  if (clientId) {
    const { data } = await supabaseAdmin.from("daily_checkins").select("id").eq("client_id", clientId).order("date", { ascending: false }).limit(1).maybeSingle();
    checkinId = data?.id;
  } else {
    const { data: candidates } = await supabaseAdmin.from("profiles").select("id").eq("role", "client").eq("client_type", "coaching");
    for (const c of candidates || []) {
      const { data } = await supabaseAdmin.from("daily_checkins").select("id").eq("client_id", c.id).order("date", { ascending: false }).limit(1).maybeSingle();
      if (data) { clientId = c.id; checkinId = data.id; break; }
    }
  }
  if (!checkinId) throw new Error("No coaching-tier client with a check-in found (or the given clientId has none).");

  console.log(`Coach: ${coach.email} (${coach.id})`);
  console.log(`Client: ${clientId}, check-in: ${checkinId}`);

  const restoreAuth = fakeCoachAuth(coach.id, coach.email);
  let ok = true;
  const assert = (cond, msg) => { if (!cond) { ok = false; console.error(`FAIL: ${msg}`); } else { console.log(`PASS: ${msg}`); } };

  try {
    console.log("\n--- Step 1: review the check-in (real Claude call if it reaches reasoning) ---");
    const reviewRes = fakeRes();
    await goalInsightHandler({ method: "POST", headers: { authorization: "Bearer x" }, body: { checkin_id: checkinId } }, reviewRes);
    assert(reviewRes.statusCode === 200, `review-checkin responded 200 (got ${reviewRes.statusCode}: ${JSON.stringify(reviewRes.body)?.slice(0, 300)})`);
    const { task, ruleEngine, safetyGate, aiReasoning } = reviewRes.body || {};
    assert(!!task?.id, "a task was created");
    assert(!!ruleEngine, "rule engine ran and returned a verdict");
    assert(!!safetyGate, "safety gate ran and returned a decision");
    console.log(`  verdict: ${ruleEngine?.verdict} (${ruleEngine?.verdictReason}) -> gate: ${safetyGate?.decision}`);

    if (safetyGate?.decision !== "proceed_to_reasoning") {
      console.log(`\nSafety gate resolved this task without AI reasoning (${safetyGate?.decision}) -- that's a valid, correct outcome for this client's real current data, not a failure. Stopping here; approve/outcome steps only apply to a DECISION_READY task.`);
    } else {
      const recId = aiReasoning?.recommendation?.id;
      assert(!!recId, "a head_coach_recommendations row was persisted");
      assert(task.status === "DECISION_READY" || task.status === "ESCALATED", `task landed in a terminal-for-now state (got ${task.status})`);

      if (task.status === "DECISION_READY") {
        console.log("\n--- Step 2: approve the recommendation ---");
        const approveRes = fakeRes();
        await goalInsightHandler({ method: "POST", headers: { authorization: "Bearer x" }, body: { recommendation_id: recId, decision: "approve" } }, approveRes);
        assert(approveRes.statusCode === 200, `approve responded 200 (got ${approveRes.statusCode})`);
        assert(approveRes.body?.recommendation?.status === "approved", "recommendation status is now 'approved'");
        assert(approveRes.body?.task?.status === "ACTION_PENDING", `task moved to ACTION_PENDING (got ${approveRes.body?.task?.status})`);

        console.log("\n--- Step 3: record an outcome ---");
        const outcomeRes = fakeRes();
        await goalInsightHandler({ method: "POST", headers: { authorization: "Bearer x" }, body: { record_outcome_for: recId, actual_response: "HC-023 end-to-end check.", outcome: "as_expected" } }, outcomeRes);
        assert(outcomeRes.statusCode === 200, `record-outcome responded 200 (got ${outcomeRes.statusCode})`);
        assert(outcomeRes.body?.task?.status === "CLOSED", `task moved to CLOSED (got ${outcomeRes.body?.task?.status})`);

        console.log("\n--- Step 4: double-decision and replay guards should now reject ---");
        const redecideRes = fakeRes();
        await goalInsightHandler({ method: "POST", headers: { authorization: "Bearer x" }, body: { recommendation_id: recId, decision: "reject" } }, redecideRes);
        assert(redecideRes.statusCode === 409, `re-deciding an already-decided recommendation is rejected (got ${redecideRes.statusCode})`);
        const replayRes = fakeRes();
        await goalInsightHandler({ method: "POST", headers: { authorization: "Bearer x" }, body: { record_outcome_for: recId, actual_response: "replay", outcome: "inconclusive" } }, replayRes);
        assert(replayRes.statusCode === 500 && /already been recorded|no longer ACTION_PENDING/i.test(replayRes.body?.error || ""), `replayed outcome submission is rejected (got ${replayRes.statusCode}: ${replayRes.body?.error})`);
      }

      console.log("\n--- Step 5: reconstruct the full history (HC-018) and check it's complete ---");
      const history = await reconstructTaskHistory(task.id);
      assert(!!history.sourceCheckIn.row, "event (source check-in) reconstructs");
      assert(history.contextSnapshots.length === 1, `exactly one context snapshot exists (got ${history.contextSnapshots.length})`);
      assert(history.recommendations.length === 1, `exactly one recommendation exists (got ${history.recommendations.length})`);
      assert(history.auditTrail.length >= 3, `a real audit trail exists (got ${history.auditTrail.length} events)`);
    }
  } finally {
    restoreAuth();
  }

  console.log(ok ? "\n✅ HC-023 end-to-end check PASSED" : "\n❌ HC-023 end-to-end check FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("SCRIPT ERROR:", e); process.exit(1); });
