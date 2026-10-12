import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Modal, Btn, Tabs, StatusBadge } from "../../../components/ui/index.js";
import { dateRangeForWeeks } from "../../../components/ProgramRoadmap.jsx";
import { checkpointWhen, CHECKPOINT_LABELS } from "../../../lib/planCheckpoints.js";
import { AIRecommendationCard } from "./AIRecommendationCard.jsx";

// Phase detail (Overview / Activities / Criteria / Notes), opened from a phase
// card. Reads the same rows the roadmap already holds; nothing here is a second
// source of truth:
//  - Overview/Criteria come from the program_phases row (criteria edited through
//    the existing criteria editor).
//  - Activities shows what the data really knows: the ACTIVE exercises for the
//    current phase, the coach-only DRAFT for a future phase, and — for any phase
//    that was activated — exactly what that activation changed. Exercises
//    aren't stored per phase, so a completed phase's full list isn't claimed.
//  - Notes edits two EXISTING fields: the client-visible roadmap note
//    (program_phases.note) and the coach-only rationale (program_phase_plans).
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const lbl = { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 };
const area = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 13, outline: "none", borderRadius: RADIUS.md, resize: "vertical" };
const MARK = { complete: "✓", incomplete: "○", na: "–" };
const sortDay = (a, b) => (DAY_ORDER.indexOf(a) === -1 ? 99 : DAY_ORDER.indexOf(a)) - (DAY_ORDER.indexOf(b) === -1 ? 99 : DAY_ORDER.indexOf(b));

function ExerciseList({ items }) {
  const days = [...new Set(items.map((e) => e.day_of_week || "Unscheduled"))].sort(sortDay);
  return days.map((d) => (
    <div key={d} style={{ marginBottom: 10 }}>
      <div style={lbl}>{d}</div>
      {items.filter((e) => (e.day_of_week || "Unscheduled") === d).map((e, i) => (
        <div key={i} style={{ fontSize: 13, padding: "3px 0", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{e.name}</span><span style={{ color: S.muted }}>{e.sets ?? "—"} × {e.reps ?? "—"}</span>
        </div>
      ))}
    </div>
  ));
}

export function PhaseDetailModal({ phase, program, clientId, status, assessment, onClose, onPatch, onEditCriteria, onOpenDraft, onEditProgram }) {
  const [tab, setTab] = useState("overview");
  const [acts, setActs] = useState(null); // { active, draft, transition }
  const [note, setNote] = useState(phase.note || "");
  const [rationale, setRationale] = useState(phase.plan_rationale || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (tab !== "activities" || acts || !phase.id) return;
    (async () => {
      const [active, draft, tr] = await Promise.all([
        status === "current" ? supabase.from("exercises").select("name,day_of_week,sets,reps").eq("program_id", program.id).is("retired_at", null).order("order_index") : Promise.resolve({ data: null }),
        supabase.from("phase_prescription_drafts").select("exercises,status").eq("phase_id", phase.id).maybeSingle(),
        supabase.from("phase_transitions").select("changes,applied_at,status").eq("phase_id", phase.id).eq("status", "applied").order("applied_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setActs({ active: active.data, draft: draft.data, transition: tr.data });
    })();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Marks a checkpoint done / not done. Writes only this phase's checkpoints
  // column (the rest of the roadmap draft is untouched in the database).
  const toggleCheckpoint = async (idx) => {
    const next = (phase.checkpoints || []).map((c, i) => (i !== idx ? c : c.done ? { ...c, done: false, done_at: null } : { ...c, done: true, done_at: new Date().toISOString() }));
    const { error } = await supabase.from("program_phases").update({ checkpoints: next }).eq("id", phase.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    onPatch(phase.id, { checkpoints: next });
  };

  const saveNotes = async () => {
    setSaving(true); setMsg(null);
    const cleanNote = note.trim() || null, cleanRat = rationale.trim() || null;
    const { error: e1 } = await supabase.from("program_phases").update({ note: cleanNote }).eq("id", phase.id);
    const { error: e2 } = e1 ? { error: null } : await supabase.from("program_phase_plans").upsert({ phase_id: phase.id, client_id: clientId, rationale: cleanRat, planned_changes: phase.planned_changes || [], updated_at: new Date().toISOString() });
    setSaving(false);
    if (e1 || e2) { setMsg({ ok: false, text: (e1 || e2).message }); return; }
    onPatch(phase.id, { note: cleanNote || "", plan_rationale: cleanRat || "" });
    setMsg({ ok: true, text: "Notes saved." });
  };

  const s = Number(phase.week_start), e = Number(phase.week_end);
  const hasWeeks = Number.isInteger(s) && Number.isInteger(e) && e >= s;
  const weeks = hasWeeks ? e - s + 1 : null;
  const range = hasWeeks ? dateRangeForWeeks(program.start_date, s, e) : null;
  const crit = phase.exit_criteria || [];
  const counted = crit.filter((c) => c.status !== "na");
  const done = counted.filter((c) => c.status === "complete").length;
  const elapsedWeeks = assessment?.evidence?.elapsedDays != null && weeks ? Math.min(weeks, Math.ceil(assessment.evidence.elapsedDays / 7)) : null;
  const tags = String(phase.movement_focus || "").split(",").map((t) => t.trim()).filter(Boolean);
  const statusLabel = status === "complete" ? "Complete" : status === "current" ? "Current" : "Upcoming";

  const tabs = [{ key: "overview", label: "Overview" }, { key: "activities", label: "Activities" }, { key: "criteria", label: "Criteria", badge: counted.length ? `${done}/${counted.length}` : null }, { key: "notes", label: "Notes" }];

  return (
    <Modal title={phase.phase} onClose={onClose} width={680}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <StatusBadge label={statusLabel} tone={status === "complete" ? "green" : status === "current" ? "amber" : "neutral"} />
        <span style={{ fontSize: 12, color: S.muted }}>{range || (hasWeeks ? `Weeks ${s}–${e}` : "No dates yet")}{weeks ? ` · ${weeks} wk${weeks === 1 ? "" : "s"}` : ""}</span>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div style={{ marginTop: 16 }}>

        {tab === "overview" && (
          <>
            <div style={lbl}>Phase focus</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{phase.objective || <span style={{ color: S.muted }}>No objective set.</span>}</div>
            {tags.length > 0 && (<><div style={lbl}>Key movement patterns</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>{tags.map((t) => <span key={t} style={{ fontSize: 12, border: "1px solid " + S.border, borderRadius: 20, padding: "3px 12px" }}>{t}</span>)}</div></>)}
            {(phase.training_focus || phase.progression_strategy) && (
              <div style={{ marginBottom: 12 }}>
                <div style={lbl}>Training focus</div>
                {phase.training_focus && <div style={{ fontSize: 13 }}>{phase.training_focus}</div>}
                {phase.progression_strategy && <div style={{ fontSize: 12, color: S.muted }}>Progression: {phase.progression_strategy}</div>}
              </div>
            )}
            {status === "current" && elapsedWeeks != null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span style={lbl}>Phase progress</span><span>{elapsedWeeks} / {weeks} weeks · {Math.round((elapsedWeeks / weeks) * 100)}%</span></div>
                <div style={{ height: 6, background: S.surface2, borderRadius: 3 }}><div style={{ width: `${Math.round((elapsedWeeks / weeks) * 100)}%`, height: "100%", background: S.accent, borderRadius: 3 }} /></div>
              </div>
            )}
            {assessment && assessment.status !== "not_assessable" && (
              <div style={{ border: "1px dashed " + S.border, borderRadius: RADIUS.md, padding: "8px 10px", fontSize: 12, marginBottom: 12 }}>
                <div style={{ ...lbl, marginBottom: 2 }}>Plan vs actual · advisory · as of yesterday</div>
                <div>{assessment.headline}</div>
                {assessment.reasons.map((r, i) => <div key={i} style={{ color: S.muted }}>• {r}</div>)}
              </div>
            )}
            {status === "current" && (
              <div style={{ marginBottom: 12 }}>
                <div style={lbl}>Deeper AI read — advisory, you approve</div>
                <AIRecommendationCard clientId={clientId} />
              </div>
            )}
            {(phase.checkpoints || []).length > 0 && (<><div style={lbl}>Checkpoints</div>{phase.checkpoints.map((c, i) => (
              <div key={i} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", padding: "2px 0" }}>
                <span style={{ color: c.done ? S.success : S.muted }}>{c.done ? "✓" : "◆"}</span>
                <span style={{ flex: 1, textDecoration: c.done ? "line-through" : "none", color: c.done ? S.muted : S.text }}>{c.label || CHECKPOINT_LABELS[c.type]} <span style={{ color: S.muted }}>— {checkpointWhen(c, program.start_date)}</span></span>
                {phase.id && <Btn sm onClick={() => toggleCheckpoint(i)}>{c.done ? "Undo" : "Mark done"}</Btn>}
              </div>
            ))}</>)}
            <div style={{ marginTop: 14 }}><Btn sm onClick={onEditProgram}>Edit phase details</Btn></div>
          </>
        )}

        {tab === "activities" && (
          !phase.id ? <div style={{ fontSize: 13, color: S.muted }}>Save the roadmap first — activities attach to saved phases.</div>
          : !acts ? <div className="spinner" style={{ margin: "20px auto" }} />
          : (
            <>
              {status === "current" && acts.active && (<><div style={lbl}>Active workouts (what the client is doing now)</div>{acts.active.length ? <ExerciseList items={acts.active} /> : <div style={{ fontSize: 13, color: S.muted }}>No active exercises.</div>}</>)}
              {status !== "current" && acts.draft && acts.draft.status === "draft" && (<><div style={lbl}>Draft workouts — not active</div><ExerciseList items={acts.draft.exercises || []} /></>)}
              {status !== "current" && !(acts.draft && acts.draft.status === "draft") && !acts.transition && (
                <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6 }}>
                  {status === "complete" ? "Exercises aren't stored per phase, so this completed phase's full list isn't available." : "No draft workouts for this phase yet."}
                </div>
              )}
              {acts.transition && (
                <div style={{ marginTop: 10 }}>
                  <div style={lbl}>Changed when this phase was activated ({new Date(acts.transition.applied_at).toLocaleDateString()})</div>
                  {["updated", "replaced", "added", "retired"].map((k) => (acts.transition.changes?.[k] || []).length > 0 && (
                    <div key={k} style={{ fontSize: 12, marginBottom: 4 }}><b style={{ textTransform: "capitalize" }}>{k}:</b> {(acts.transition.changes[k] || []).map((x) => (k === "replaced" ? `${x.from} → ${x.to}` : x.name)).join(", ")}</div>
                  ))}
                  <div style={{ fontSize: 12, color: S.muted }}>{acts.transition.changes?.kept || 0} unchanged.</div>
                </div>
              )}
              {phase.id && status !== "complete" && <div style={{ marginTop: 12 }}><Btn sm onClick={onOpenDraft}>Open draft workouts</Btn></div>}
            </>
          )
        )}

        {tab === "criteria" && (
          <>
            <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>{counted.length ? `${done} of ${counted.length} complete` : "No exit criteria set."}</div>
            {crit.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0", color: c.status === "na" ? S.muted : S.text }}>
                <span style={{ width: 16, fontWeight: 700, color: c.status === "complete" ? S.success : S.muted }}>{MARK[c.status] || "○"}</span>
                <span style={{ textDecoration: c.status === "na" ? "line-through" : "none" }}>{c.label}</span>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>{phase.id ? <Btn sm teal onClick={onEditCriteria}>Edit criteria</Btn> : <span style={{ fontSize: 12, color: S.muted }}>Save the roadmap to edit criteria here.</span>}</div>
          </>
        )}

        {tab === "notes" && (
          !phase.id ? <div style={{ fontSize: 13, color: S.muted }}>Save the roadmap first — notes attach to saved phases.</div> : (
            <>
              <div style={lbl}>Client-visible note (shown when the client opens this phase on their roadmap)</div>
              <textarea rows={3} style={area} value={note} onChange={(ev) => setNote(ev.target.value)} />
              <div style={{ ...lbl, marginTop: 12 }}>Coach-only notes (why this phase follows the last — the client never sees this)</div>
              <textarea rows={3} style={area} value={rationale} onChange={(ev) => setRationale(ev.target.value)} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <Btn sm onClick={saveNotes} disabled={saving || (note === (phase.note || "") && rationale === (phase.plan_rationale || ""))}>{saving ? "Saving..." : "Save notes"}</Btn>
                {msg && <span style={{ fontSize: 12, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</span>}
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  );
}
