import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, StatusBadge, Alert, EmptyState, Fld, Inp, RG } from "../../../components/ui/index.js";

// HC-019 Coach Dashboard: the first UI surface for the whole Head Coach
// effort (HC-001 through HC-018 were all backend). Per the owner's
// decision, this lives as a new per-client tab -- everything Head Coach has
// been scoped to a specific client and their check-ins since HC-002, same
// pattern as GoalsSection/ProgramSection/MilestonesCard.
//
// Reads (recent check-in, task/recommendation history) go straight to
// Supabase from the browser -- RLS already grants coaches SELECT on every
// head_coach_* table (HC-002). Writes (trigger a review, decide a
// recommendation, record an outcome) go through api/goal-insight.js, same
// as every other AI action in this app -- there is no client-writable RLS
// policy on any of these tables by design (HC-002/HC-003), so this is the
// only path.
//
// Gated by VITE_HEAD_COACH_ENABLED (unset or anything but "false" = shown).
// This only hides the UI -- HEAD_COACH_ENABLED (server-side, checked in
// goal-insight.js) is the actual enforcement point.
//
// HC-020 Client Integration: deliberately NOT a new client-facing surface or
// any automated sending -- per the owner's decision, this is a small
// connector into the EXISTING, already-manual coach_messages feature. Once
// a recommendation with client_communication_needed=true is approved/
// modified, "Send to Client" pre-fills that feature's composer (via
// onSendToClient, wired up in ClientDetailPage) with the AI's
// communication_draft -- the coach still reviews/edits/sends it themselves.
// The client never sees any AI reasoning directly, only whatever message
// text the coach actually chooses to send.

const HEAD_COACH_ENABLED = import.meta.env.VITE_HEAD_COACH_ENABLED !== "false";

const OUTCOME_VALUES = ["as_expected", "better_than_expected", "worse_than_expected", "inconclusive"];

const STATUS_TONE = {
  QUEUED: "neutral", CONTEXT_BUILDING: "neutral", READY: "neutral", PROCESSING: "neutral",
  DECISION_READY: "accent", ACTION_PENDING: "amber", MONITORING: "amber",
  CLOSED: "neutral", FAILED: "red", RETRYING: "amber", ESCALATED: "red",
};

async function callHeadCoach(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/goal-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json;
}

const textareaStyle = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: 12, fontSize: 13, fontFamily: "inherit", outline: "none" };

function TaskCard({ task, onDecide, onRecordOutcome, onSendToClient }) {
  const rec = task.recommendation;
  const output = rec?.ai_output;
  // HC-020: coach_modification only ever edits `recommendation` today (see
  // the Modify form below), never communication_draft -- checking it first
  // anyway keeps this correct if that ever changes, falling back to the
  // AI's original draft otherwise.
  const communicationDraft = rec?.coach_modification?.communication_draft ?? output?.communication_draft;
  const canSendToClient = output?.client_communication_needed && communicationDraft && (rec?.status === "approved" || rec?.status === "modified");
  const [note, setNote] = useState("");
  const [modText, setModText] = useState(output?.recommendation || "");
  const [busy, setBusy] = useState(false);
  const [actualResponse, setActualResponse] = useState("");
  const [outcomeValue, setOutcomeValue] = useState("as_expected");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  const handleDecide = async (decision) => {
    setBusy(true);
    await onDecide(rec.id, decision, note, decision === "modify" ? { recommendation: modText } : null);
    setBusy(false);
  };

  const handleOutcome = async () => {
    setBusy(true);
    await onRecordOutcome(rec.id, { actual_response: actualResponse, outcome: outcomeValue, notes: outcomeNotes || null });
    setBusy(false);
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <CardTitle>{new Date(task.created_at).toLocaleString()}</CardTitle>
        <StatusBadge label={task.status} tone={STATUS_TONE[task.status] || "neutral"} />
      </div>

      {!rec && <div style={{ fontSize: 12, color: S.muted }}>No recommendation recorded for this task{task.last_error ? ` — ${task.last_error}` : "."}</div>}

      {rec && (
        <>
          <div style={{ fontSize: 13, marginBottom: 6 }}><b>Observation:</b> {output?.observation || "—"}</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}><b>Recommendation:</b> {output?.recommendation || "—"}</div>
          {output?.rationale && <div style={{ fontSize: 12, color: S.muted, marginBottom: 6 }}>{output.rationale}</div>}
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 12 }}>
            Confidence: {output?.confidence_level || "—"} · Backend authority: {rec.backend_authority} · Validation: {rec.validation_status}
          </div>

          {task.status === "ESCALATED" && (
            <div style={{ fontSize: 12, color: S.danger, fontWeight: 600, marginBottom: 12 }}>
              Needs your review — the AI or the deterministic safety rules flagged this rather than optimizing around it.
            </div>
          )}

          {task.status === "DECISION_READY" && rec.status === "pending" && (
            <>
              <Fld label="Note (optional)"><Inp value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the record..." /></Fld>
              <Fld label="Edit recommendation (only used if you choose Modify)">
                <textarea value={modText} onChange={(e) => setModText(e.target.value)} rows={3} style={textareaStyle} />
              </Fld>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn onClick={() => handleDecide("approve")} disabled={busy}>Approve</Btn>
                <Btn teal onClick={() => handleDecide("modify")} disabled={busy}>Modify</Btn>
                <Btn onClick={() => handleDecide("defer")} disabled={busy}>Defer</Btn>
                <Btn danger onClick={() => handleDecide("reject")} disabled={busy}>Reject</Btn>
              </div>
            </>
          )}

          {task.status === "ACTION_PENDING" && (
            <>
              <div style={{ fontSize: 12, color: S.accent2, marginBottom: 10 }}>
                {rec.status === "approved" ? "Approved" : "Modified"} — carry this out, then record what actually happened.
              </div>
              <Fld label="What actually happened"><textarea value={actualResponse} onChange={(e) => setActualResponse(e.target.value)} rows={2} style={textareaStyle} /></Fld>
              <Fld label="Outcome"><RG options={OUTCOME_VALUES} value={outcomeValue} onChange={setOutcomeValue} /></Fld>
              <Fld label="Notes (optional)"><Inp value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} /></Fld>
              <Btn onClick={handleOutcome} disabled={busy || !actualResponse.trim()}>Record Outcome</Btn>
            </>
          )}

          {rec.status !== "pending" && (
            <div style={{ fontSize: 12, color: S.muted, marginTop: 10 }}>
              Decision: <b>{rec.status}</b>{rec.coach_decision_note ? ` — "${rec.coach_decision_note}"` : ""}
            </div>
          )}

          {canSendToClient && (
            <div style={{ marginTop: 10 }}>
              <Btn teal sm onClick={() => onSendToClient(communicationDraft)}>Send to Client via Coach Messages</Btn>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function HeadCoachSection({ client, onSendToClient }) {
  const [recentCheckin, setRecentCheckin] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: checkin }, { data: taskRows }] = await Promise.all([
      supabase.from("daily_checkins").select("id,date").eq("client_id", client.id).order("date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("head_coach_tasks").select("*").eq("client_id", client.id).eq("task_type", "REVIEW_CHECK_IN").order("created_at", { ascending: false }).limit(10),
    ]);
    setRecentCheckin(checkin || null);
    const taskIds = (taskRows || []).map((t) => t.id);
    const { data: recs } = taskIds.length
      ? await supabase.from("head_coach_recommendations").select("*").in("task_id", taskIds)
      : { data: [] };
    const merged = (taskRows || []).map((t) => ({ ...t, recommendation: (recs || []).find((r) => r.task_id === t.id) || null }));
    setTasks(merged);
    setLoading(false);
  }, [client.id]);

  useEffect(() => { load(); }, [load]);

  const reviewCheckIn = async () => {
    if (!recentCheckin) return;
    setReviewing(true); setError(null);
    try {
      await callHeadCoach({ checkin_id: recentCheckin.id });
      await load();
    } catch (e) { setError(e.message); }
    setReviewing(false);
  };

  const decide = async (recommendationId, decision, note, modification) => {
    setError(null);
    try {
      await callHeadCoach({ recommendation_id: recommendationId, decision, note: note || null, modification });
      await load();
    } catch (e) { setError(e.message); }
  };

  const recordOutcome = async (recommendationId, payload) => {
    setError(null);
    try {
      await callHeadCoach({ record_outcome_for: recommendationId, ...payload });
      await load();
    } catch (e) { setError(e.message); }
  };

  if (!HEAD_COACH_ENABLED) return null;
  if (loading) return <div className="spinner" style={{ margin: "20px auto" }} />;

  return (
    <>
      <Card>
        <CardTitle>Head Coach — AI Check-In Review</CardTitle>
        <Alert variant="error">{error}</Alert>
        {recentCheckin ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontSize: 13, color: S.muted }}>Most recent check-in: {recentCheckin.date}</div>
            <Btn onClick={reviewCheckIn} disabled={reviewing}>{reviewing ? "Reviewing…" : "Review This Check-In"}</Btn>
          </div>
        ) : (
          <EmptyState title="No check-ins yet" sub="This client hasn't logged a daily check-in." />
        )}
      </Card>

      {tasks.length === 0 ? (
        <EmptyState title="No reviews yet" sub='Click "Review This Check-In" above to run the first one.' />
      ) : (
        tasks.map((t) => <TaskCard key={t.id} task={t} onDecide={decide} onRecordOutcome={recordOutcome} onSendToClient={onSendToClient} />)
      )}
    </>
  );
}
