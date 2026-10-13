import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Modal, Btn, StatusBadge } from "../../../components/ui/index.js";
import { buildPhaseDraft } from "../../../lib/phaseDraft.js";

// Coach-only editor for a phase's workout DRAFT. Stored in
// phase_prescription_drafts, never in exercises: the client's real workouts and
// logged history are untouched, and the client can't read drafts (coach-only
// RLS). Making a draft active is a separate, explicit transition step.
const input = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "5px 8px", fontSize: 12, outline: "none", borderRadius: RADIUS.md, width: "100%" };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function PhaseDraftModal({ phase, program, clientId, onClose }) {
  const [draft, setDraft] = useState(null); // { exercises, unapplied, status }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  // Activation: `preview` is the dry-run result (computed by the SAME database
  // function that applies it, then rolled back), shown for confirmation.
  const [preview, setPreview] = useState(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [activating, setActivating] = useState(false);
  const [transition, setTransition] = useState(null); // latest applied transition for this program
  const [undoing, setUndoing] = useState(false);

  const loadTransition = async () => {
    const { data } = await supabase.from("phase_transitions").select("*").eq("program_id", program.id).eq("status", "applied").order("applied_at", { ascending: false }).limit(1).maybeSingle();
    setTransition(data || null);
  };
  useEffect(() => { loadTransition(); }, [phase.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rpcError = (error) => (error?.message || "").replace(/^EXIT_CRITERIA_INCOMPLETE: /, "");
  const startActivation = async () => {
    setMsg(null); setActivating(true);
    const { data, error } = await supabase.rpc("activate_phase_draft", { p_phase_id: phase.id, p_override_note: null, p_dry_run: true });
    // An incomplete-exit-criteria refusal still needs the preview, so ask again
    // with a placeholder just to preview; the real call below requires the note.
    if (error && /EXIT_CRITERIA_INCOMPLETE/.test(error.message)) {
      const r2 = await supabase.rpc("activate_phase_draft", { p_phase_id: phase.id, p_override_note: "(preview)", p_dry_run: true });
      setActivating(false);
      if (r2.error) { setMsg({ ok: false, text: rpcError(r2.error) }); return; }
      setPreview(r2.data); return;
    }
    setActivating(false);
    if (error) { setMsg({ ok: false, text: rpcError(error) }); return; }
    setPreview(data);
  };
  const confirmActivation = async () => {
    setActivating(true); setMsg(null);
    const { data, error } = await supabase.rpc("activate_phase_draft", { p_phase_id: phase.id, p_override_note: overrideNote.trim() || null, p_dry_run: false });
    setActivating(false);
    if (error) { setMsg({ ok: false, text: rpcError(error) }); return; }
    setPreview(null); setOverrideNote("");
    setDraft((d) => ({ ...d, status: "approved" }));
    setMsg({ ok: true, text: `"${data.to_phase}" is now the client's active phase and their workouts have been updated.` });
    loadTransition();
  };
  const undo = async () => {
    if (!window.confirm("Undo this phase transition? The client's workouts and phase go back to how they were. Any sets already logged on the new exercises stay in their history.")) return;
    setUndoing(true); setMsg(null);
    const { error } = await supabase.rpc("undo_phase_transition", { p_transition_id: transition.id, p_note: null });
    setUndoing(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setDraft((d) => ({ ...d, status: "draft" }));
    setMsg({ ok: true, text: "Transition undone. The previous workouts and phase are active again." });
    loadTransition();
  };

  useEffect(() => {
    supabase.from("phase_prescription_drafts").select("*").eq("phase_id", phase.id).maybeSingle().then(({ data }) => {
      setDraft(data ? { exercises: data.exercises || [], unapplied: data.unapplied || [], status: data.status } : null);
      setLoading(false);
    });
  }, [phase.id]);

  const build = async () => {
    if (draft && !window.confirm("Rebuild the draft from the plan? Your edits to this draft will be replaced.")) return;
    setMsg(null);
    const { data: current, error } = await supabase.from("exercises").select("*").eq("program_id", program.id).order("order_index");
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    const built = buildPhaseDraft(current || [], phase.planned_changes || []);
    setDraft({ ...built, status: "draft" });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("phase_prescription_drafts").upsert({
      phase_id: phase.id, program_id: program.id, client_id: clientId, exercises: draft.exercises, unapplied: draft.unapplied,
      status: draft.status || "draft", updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) setMsg({ ok: false, text: error.message }); else { setMsg({ ok: true, text: "Draft saved. It is not active." }); setDirty(false); }
  };

  const upd = (i, patch) => { setDraft((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) })); setDirty(true); };
  const days = draft ? [...new Set(draft.exercises.map((e) => e.day_of_week || "Unscheduled"))] : [];
  const sortDays = (a, b) => (DAYS.indexOf(a) === -1 ? 99 : DAYS.indexOf(a)) - (DAYS.indexOf(b) === -1 ? 99 : DAYS.indexOf(b));
  const approved = draft?.status === "approved";

  return (
    <Modal title={`Draft workouts — ${phase.phase}`} onClose={() => { if (!dirty || window.confirm("Discard unsaved changes to this draft?")) onClose(); }} width={720}>
      <div style={{ fontSize: 12, color: S.accent2, border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: "8px 12px", marginBottom: 12, lineHeight: 1.5 }}>
        Draft only — not active. The client doesn't see this and their current workouts and history are unchanged.
      </div>
      {loading ? <div className="spinner" style={{ margin: "20px auto" }} /> : !draft ? (
        <>
          <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6, marginBottom: 12 }}>
            No draft yet. This builds a starting point from the program's current exercises plus this phase's planned changes ({(phase.planned_changes || []).length} planned). Exercises stay the same unless the plan says otherwise.
          </div>
          <Btn onClick={build}>Build draft from plan</Btn>
        </>
      ) : (
        <>
          {approved && <div style={{ fontSize: 12, color: S.warning, marginBottom: 8 }}>This draft was already approved.</div>}
          {draft.unapplied.length > 0 && (
            <div style={{ border: "1px solid " + S.warning, borderRadius: RADIUS.md, padding: "8px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: S.warning, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Planned changes that couldn't be applied</div>
              {draft.unapplied.map((u, i) => <div key={i} style={{ fontSize: 12, color: S.text }}>• {u.reason} <span style={{ color: S.muted }}>({u.change?.action}: {u.change?.from || u.change?.to})</span></div>)}
            </div>
          )}
          {days.sort(sortDays).map((day) => (
            <div key={day} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>{day}</div>
              {draft.exercises.map((e, i) => (e.day_of_week || "Unscheduled") !== day ? null : (
                <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "6px 0", borderBottom: "1px solid " + S.border }}>
                  <div style={{ minWidth: 0, flex: "1 1 100%" }}>
                    <input style={input} value={e.name} onChange={(ev) => upd(i, { name: ev.target.value })} />
                    {e.change && <div style={{ fontSize: 10, color: S.accent, marginTop: 2 }}>{e.change.action}{e.change.from ? ` (was ${e.change.from})` : ""} — {e.change.reason}</div>}
                    {e.needs_review && <div style={{ fontSize: 10, color: S.warning }}>Check sets/reps/day for this one</div>}
                  </div>
                  <input style={{ ...input, width: 60 }} type="number" min="1" value={e.sets ?? ""} onChange={(ev) => upd(i, { sets: ev.target.value === "" ? null : Number(ev.target.value) })} title="Sets" />
                  <input style={{ ...input, width: 84 }} value={e.reps ?? ""} onChange={(ev) => upd(i, { reps: ev.target.value })} title="Reps" />
                  <select style={{ ...input, flex: "1 1 100px", minWidth: 0 }} value={e.day_of_week || ""} onChange={(ev) => upd(i, { day_of_week: ev.target.value || null })}>
                    <option value="">—</option>{DAYS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <button type="button" title="Remove from draft" onClick={() => { setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) })); setDirty(true); }} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 18 }}>×</button>
                </div>
              ))}
            </div>
          ))}
          <Btn sm onClick={() => { setDraft((d) => ({ ...d, exercises: [...d.exercises, { name: "", day_of_week: days[0] === "Unscheduled" ? null : days[0] || null, sets: 3, reps: "8-12", block_type: "straight_set", needs_review: true, source_exercise_id: null }] })); setDirty(true); }}>+ Add exercise</Btn>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
            <Btn onClick={save} disabled={saving || !dirty || draft.exercises.some((e) => !String(e.name).trim())}>{saving ? "Saving..." : "Save draft"}</Btn>
            <Btn sm onClick={build}>Rebuild from plan</Btn>
            <StatusBadge label={approved ? "approved" : "draft"} tone={approved ? "green" : "amber"} />
            {msg && <span style={{ fontSize: 12, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</span>}
          </div>

          {!approved && (
            <div style={{ marginTop: 16, borderTop: "1px solid " + S.border, paddingTop: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Make this the active phase</div>
              <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.6, marginBottom: 8 }}>Changes the client's real workouts and current phase. You'll see exactly what changes first, and you can undo it afterwards.</div>
              <Btn teal onClick={startActivation} disabled={activating || dirty || draft.exercises.some((e) => !String(e.name).trim())}>{activating && !preview ? "Checking..." : "Review & activate…"}</Btn>
              {dirty && <span style={{ fontSize: 11, color: S.warning, marginLeft: 10 }}>Save the draft first.</span>}
            </div>
          )}
          {approved && transition && transition.phase_id === phase.id && (
            <div style={{ marginTop: 16, borderTop: "1px solid " + S.border, paddingTop: 14, fontSize: 12, color: S.muted, lineHeight: 1.6 }}>
              Activated {new Date(transition.applied_at).toLocaleString()}{transition.exit_criteria_override ? ` · exit criteria overridden: "${transition.override_note}"` : ""}.
              <div style={{ marginTop: 8 }}><Btn sm danger onClick={undo} disabled={undoing}>{undoing ? "Undoing..." : "Undo this transition"}</Btn></div>
            </div>
          )}
        </>
      )}
      {preview && (
        <Modal title={`Activate "${preview.to_phase}"?`} onClose={() => setPreview(null)} width={620}>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 12, lineHeight: 1.6 }}>The client's current phase "{preview.from_phase}" becomes "{preview.to_phase}", and their workouts change as listed. Nothing is deleted — removed and replaced exercises are retired and keep their logged history.</div>
          {[
            ["Updated in place (history continues)", (preview.changes.updated || []).map((u) => `${u.name}: ${u.before.sets}×${u.before.reps} ${u.before.day_of_week || "—"} → ${u.after.sets}×${u.after.reps} ${u.after.day_of_week || "—"}`)],
            ["Replaced", (preview.changes.replaced || []).map((r) => `${r.from} → ${r.to}`)],
            ["Added", (preview.changes.added || []).map((a) => a.name)],
            ["Retired (removed)", (preview.changes.retired || []).map((r) => r.name)],
          ].map(([label, items]) => items.length > 0 && (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 3 }}>{label} ({items.length})</div>
              {items.map((t, i) => <div key={i} style={{ fontSize: 13 }}>• {t}</div>)}
            </div>
          ))}
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>{preview.changes.kept} exercise{preview.changes.kept === 1 ? "" : "s"} unchanged.</div>
          {preview.incomplete_exit_criteria > 0 && (
            <div style={{ border: "1px solid " + S.warning, borderRadius: RADIUS.md, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: S.warning, fontWeight: 700, marginBottom: 6 }}>{preview.incomplete_exit_criteria} exit criteri{preview.incomplete_exit_criteria === 1 ? "on" : "a"} of "{preview.from_phase}" {preview.incomplete_exit_criteria === 1 ? "is" : "are"} not complete</div>
              <div style={{ fontSize: 12, color: S.text, marginBottom: 6 }}>You can still activate, but a note is required and is saved with the transition.</div>
              <textarea rows={2} value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="Why are you moving on now?" style={{ ...input, width: "100%", resize: "vertical" }} />
            </div>
          )}
          {msg && !msg.ok && <div style={{ fontSize: 12, color: S.danger, marginBottom: 8 }}>{msg.text}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn sm onClick={() => setPreview(null)} disabled={activating}>Cancel</Btn>
            <Btn onClick={confirmActivation} disabled={activating || (preview.incomplete_exit_criteria > 0 && !overrideNote.trim())}>{activating ? "Activating..." : "Activate phase"}</Btn>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
