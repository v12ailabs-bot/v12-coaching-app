import { useState } from "react";
import { S, RADIUS } from "../../../theme.jsx";
import { Modal, Btn } from "../../../components/ui/index.js";
import { CHECKPOINT_LABELS } from "../../../lib/planCheckpoints.js";

// Edits one phase's plan details (coach-only rationale + planned exercise
// changes, and the client-visible checkpoints) in the roadmap DRAFT. Nothing is
// written to the database here; Save Roadmap persists it, so cancelling is
// always safe.
const input = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "7px 10px", fontSize: 12, outline: "none", borderRadius: RADIUS.md };
const lbl = { fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 4px", display: "block" };
const mini = { fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 3 };
const ACTIONS = ["replace", "add", "remove", "progress"];
const TYPES = ["reassessment", "nutrition_review", "goal_review", "day90_review"];

export function PlanDetailsEditor({ phase, onSave, onClose }) {
  const [rationale, setRationale] = useState(phase.plan_rationale || "");
  const [changes, setChanges] = useState((phase.planned_changes || []).map((c) => ({ ...c })));
  const [checkpoints, setCheckpoints] = useState((phase.checkpoints || []).map((c) => ({ ...c })));
  const upd = (setter) => (i, patch) => setter((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const del = (setter) => (i) => setter((l) => l.filter((_, j) => j !== i));
  const setChange = upd(setChanges), setCp = upd(setCheckpoints);

  const save = () => onSave({
    plan_rationale: rationale.trim(),
    planned_changes: changes.filter((c) => c.reason?.trim() && (c.from?.trim() || c.to?.trim())).map((c) => ({ action: c.action || "replace", from: (c.from || "").trim(), to: (c.to || "").trim(), reason: c.reason.trim() })),
    checkpoints: checkpoints.filter((c) => c.label?.trim() && c.day !== "" && c.day != null && Number(c.day) >= 0).map((c) => ({ type: c.type || "reassessment", label: c.label.trim(), day: Math.round(Number(c.day)), ...(c.done ? { done: true, done_at: c.done_at || null } : {}) })),
  });

  return (
    <Modal title={`Plan details — ${phase.phase}`} onClose={onClose} width={720}>
      <div style={{ fontSize: 11, color: S.muted, lineHeight: 1.5 }}>Rationale and planned changes are for you only. Checkpoints are shown to the client on their roadmap. Changes apply to the draft — click Save Roadmap to keep them.</div>

      <label style={lbl}>Why this phase follows the last (coach only)</label>
      <textarea rows={2} style={{ ...input, resize: "vertical" }} value={rationale} onChange={(e) => setRationale(e.target.value)} />

      <label style={lbl}>Planned exercise changes (coach only)</label>
      {changes.map((c, i) => (
        <div key={i} style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <div><span style={mini}>Change</span><select style={input} value={c.action || "replace"} onChange={(e) => setChange(i, { action: e.target.value })}>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select></div>
            <div><span style={mini}>From (exercise in the program now)</span><input style={input} placeholder="e.g. Goblet Squat" value={c.from || ""} onChange={(e) => setChange(i, { from: e.target.value })} /></div>
            <div><span style={mini}>To (new exercise)</span><input style={input} placeholder="e.g. Back Squat" value={c.to || ""} onChange={(e) => setChange(i, { to: e.target.value })} /></div>
            <button type="button" title="Remove" onClick={() => del(setChanges)(i)} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 20, paddingBottom: 4 }}>×</button>
          </div>
          <span style={{ ...mini, marginTop: 8 }}>Why (required)</span>
          <input style={input} placeholder="e.g. Movement is solid, ready to load it" value={c.reason || ""} onChange={(e) => setChange(i, { reason: e.target.value })} />
        </div>
      ))}
      <Btn sm onClick={() => setChanges((l) => [...l, { action: "replace", from: "", to: "", reason: "" }])}>+ Add change</Btn>

      <label style={lbl}>Checkpoints (shown to the client on their roadmap)</label>
      {checkpoints.map((c, i) => (
        <div key={i} style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 170px auto", gap: 8, alignItems: "end" }}>
            <div><span style={mini}>Type</span><select style={input} value={c.type || "reassessment"} onChange={(e) => setCp(i, { type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{CHECKPOINT_LABELS[t]}</option>)}</select></div>
            <div><span style={mini}>Day (Day 0 = first day)</span><input style={input} type="number" min="0" placeholder="e.g. 28" value={c.day ?? ""} onChange={(e) => setCp(i, { day: e.target.value })} /></div>
            <button type="button" title="Remove" onClick={() => del(setCheckpoints)(i)} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 20, paddingBottom: 4 }}>×</button>
          </div>
          <span style={{ ...mini, marginTop: 8 }}>What the client sees (label)</span>
          <input style={input} placeholder="e.g. Week 4 reassessment — re-test squat and weigh in" value={c.label || ""} onChange={(e) => setCp(i, { label: e.target.value })} />
          <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>Day 28 = the start of week 5. Day 7 = the start of week 2.</div>
        </div>
      ))}
      <Btn sm onClick={() => setCheckpoints((l) => [...l, { type: "reassessment", label: "", day: "" }])}>+ Add checkpoint</Btn>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <Btn sm onClick={onClose}>Cancel</Btn>
        <Btn sm onClick={save}>Apply to draft</Btn>
      </div>
    </Modal>
  );
}
