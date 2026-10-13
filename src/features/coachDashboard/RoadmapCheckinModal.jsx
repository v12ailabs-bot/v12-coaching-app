import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS } from "../../theme.jsx";
import { Modal, Btn, StatusBadge } from "../../components/ui/index.js";
import { roadmapStats } from "../../lib/roadmapStats.js";
import { timingText, suggestReminder } from "../../lib/roadmapCheckins.js";

// Review pop-up for the "Roadmap Check-ins Due" card — same Modal, box styling
// and section order as the Needs Attention intervention pop-up. Everything shown
// comes from the roadmap/plan data CoachHome already loaded, plus the next
// phase's coach-only plan (program_phase_plans) fetched on open. No AI call: the
// session reminder is assembled from the checkpoint/phase text and planned
// changes, and is fully editable.
const box = { border: "1px solid " + S.border, background: S.surface2, borderRadius: RADIUS.md, padding: "12px 14px", marginBottom: 14 };
const head = (color) => ({ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 });
const textareaStyle = { width: "100%", background: S.surface, border: "1px solid " + S.border, color: S.text, padding: 10, fontSize: 13, fontFamily: "inherit", outline: "none", borderRadius: RADIUS.md };

export function RoadmapCheckinModal({ row, client, daily = [], mealLogs = [], milestoneAlerts = [], reminder, openClient, onChanged, onClose }) {
  const { clientId, checkpoints, phase } = row;
  const curPhase = phase?.phaseObj || checkpoints[0]?.phaseObj;
  const meta = phase || checkpoints[0];
  const [changes, setChanges] = useState(null);
  const [text, setText] = useState(reminder?.reminder || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!phase?.nextPhaseObj?.id) { setChanges([]); return; }
    supabase.from("program_phase_plans").select("planned_changes").eq("phase_id", phase.nextPhaseObj.id).maybeSingle()
      .then(({ data }) => setChanges(data?.planned_changes || []));
  }, [phase?.nextPhaseObj?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill the reminder once with a suggestion, unless one is already saved.
  useEffect(() => {
    if (changes && !reminder?.reminder && !text) setText(suggestReminder(row, changes));
  }, [changes]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = curPhase ? roadmapStats({ phase: curPhase, programStart: meta.programStart, daily, mealLogs }) : null;
  const exit = curPhase?.exit_criteria || [];
  const exitDone = exit.filter((c) => c.status === "complete");
  const exitOpen = exit.filter((c) => c.status !== "complete" && c.status !== "na");
  const mine = milestoneAlerts.filter((m) => m.clientId === clientId);
  const worst = row.days;
  const statusLabel = row.kind === "both" ? "Both" : row.kind === "phase" ? "Phase Check-in" : "Checkpoint Due";
  const tone = worst < 0 ? "red" : "amber";

  const save = async (extra = {}) => {
    const { error } = await supabase.from("coach_session_reminders").upsert({ client_id: clientId, reminder: text.trim() || null, updated_at: new Date().toISOString(), ...extra }, { onConflict: "client_id" });
    if (error) throw new Error(/coach_session_reminders/.test(error.message) ? "The reminders table isn't set up yet — run db/add_coach_session_reminders.sql in Supabase." : error.message);
    return { reminder: text.trim() || null, ...extra };
  };

  const saveReminder = async () => {
    setBusy(true); setMsg(null);
    try { const patch = await save(); onChanged({ reminderPatch: patch }); setMsg({ ok: true, text: "Reminder saved (coach-only)." }); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };

  // Clears the items. Checkpoints: the same write PhaseDetailModal's "Mark done"
  // does (program_phases.checkpoints). Phase check-in: there is no separate
  // review state, and the phase itself only advances by activating the next
  // phase's draft workouts — so this records which phase was reviewed.
  const markReviewed = async () => {
    setBusy(true); setMsg(null);
    try {
      const byPhase = {};
      checkpoints.forEach((c) => { (byPhase[c.phaseId] = byPhase[c.phaseId] || { base: c.phaseObj.checkpoints || [], idx: [] }).idx.push(c.cpIndex); });
      for (const [phaseId, { base, idx }] of Object.entries(byPhase)) {
        const next = base.map((c, i) => (idx.includes(i) ? { ...c, done: true, done_at: new Date().toISOString() } : c));
        const { error } = await supabase.from("program_phases").update({ checkpoints: next }).eq("id", phaseId);
        if (error) throw new Error(error.message);
      }
      const patch = await save(phase ? { reviewed_phase: phase.phase } : {});
      onChanged({ reminderPatch: patch, doneCheckpoints: checkpoints.map((c) => ({ phaseId: c.phaseId, cpIndex: c.cpIndex })), reviewedPhase: phase ? phase.phase : null });
      onClose();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };

  return (
    <Modal title="Roadmap Check-in" onClose={onClose} width={720}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{client?.name || client?.email || "Client"}</div>
          {client?.goal && <div style={{ fontSize: 12, color: S.muted }}>{client.goal}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <StatusBadge label={statusLabel} tone={tone} />
          <div style={{ fontSize: 11, color: worst < 0 ? S.danger : S.warning, marginTop: 4 }}>{worst < 0 ? `${Math.abs(worst)}d overdue` : worst === 0 ? "due today" : `due in ${worst}d`}</div>
        </div>
      </div>

      <div style={{ border: "1px solid " + (worst < 0 ? S.danger : S.warning), borderRadius: RADIUS.md, padding: "10px 14px", marginBottom: 14 }}>
        <div style={head(worst < 0 ? S.danger : S.warning)}>Due now</div>
        {checkpoints.map((c, i) => <div key={i} style={{ fontSize: 14, marginTop: 2 }}>◆ {c.label} — {c.phase} · {timingText(c.daysUntil)}</div>)}
        {phase && <div style={{ fontSize: 14, marginTop: 2 }}>{phase.phase} {phase.daysUntilEnd < 0 ? `ended ${Math.abs(phase.daysUntilEnd)}d ago` : timingText(phase.daysUntilEnd, true)}{phase.nextPhase ? ` · next: ${phase.nextPhase}` : " · last phase in the roadmap"}</div>}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Where they're at</div>
      <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
        <li><b>{curPhase?.phase || "—"}</b>{meta?.phaseNumber ? ` — phase ${meta.phaseNumber} of ${meta.phaseTotal}` : ""}{stats ? `, week ${stats.phaseWeek} of ${stats.phaseWeeks}` : ""}</li>
        {stats?.scheduled != null && <li>Planned {stats.scheduled} sessions → completed {stats.completed}{stats.attendancePct != null ? ` (${stats.attendancePct}%)` : ""}</li>}
        {stats?.proteinAvg != null && <li>Protein averaging {stats.proteinAvg} g/day this phase</li>}
        {!stats && <li style={{ color: S.muted }}>No tracking numbers for this phase window yet.</li>}
        {exit.length > 0 && <li>Exit criteria: {exitDone.length}/{exit.length} complete{exitOpen.length ? ` — still open: ${exitOpen.map((c) => c.label).join(", ")}` : ""}</li>}
        {mine.map((m, i) => <li key={i}>Milestone: {m.exercise} {m.kind === "achieved" ? "reached" : `${m.pct}% complete`}</li>)}
      </ul>

      {phase && (
        <div style={box}>
          <div style={head(S.accent2)}>Next phase prep{phase.nextPhase ? ` · ${phase.nextPhase}` : ""}</div>
          {!phase.nextPhaseObj ? <div style={{ fontSize: 13, color: S.muted }}>This is the last phase in the roadmap.</div> : (
            <>
              {phase.nextPhaseObj.objective && <div style={{ fontSize: 13, marginBottom: 6 }}>{phase.nextPhaseObj.objective}</div>}
              {changes == null ? <div className="spinner" style={{ margin: "6px auto" }} /> : changes.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                  {changes.map((c, i) => <li key={i}><b style={{ textTransform: "capitalize" }}>{c.action}</b> {[c.from, c.to].filter(Boolean).join(" → ")}{c.reason ? <span style={{ color: S.muted }}> — {c.reason}</span> : null}</li>)}
                </ul>
              ) : <div style={{ fontSize: 13, color: S.muted }}>No planned exercise changes saved for this phase.</div>}
            </>
          )}
        </div>
      )}

      <div style={box}>
        <div style={head(S.accent)}>Session reminder · coach-only</div>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What to do at the next session" style={textareaStyle} />
        <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>Never shown to the client. Stays on the client page and Today until you clear it.</div>
      </div>

      {msg && <div style={{ fontSize: 12, color: msg.ok ? S.accent2 : S.danger, marginBottom: 8 }}>{msg.text}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn teal onClick={() => { onClose(); openClient(clientId, { section: "program-roadmap" }); }} disabled={busy}>Open Roadmap</Btn>
        <Btn onClick={saveReminder} disabled={busy}>Save Reminder</Btn>
        <Btn onClick={markReviewed} disabled={busy}>Mark Reviewed</Btn>
      </div>
    </Modal>
  );
}
