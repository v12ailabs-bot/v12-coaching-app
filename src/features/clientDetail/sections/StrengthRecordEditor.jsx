import { useState } from "react";
import { S, RADIUS } from "../../../theme.jsx";
import { Btn } from "../../../components/ui/index.js";
import { updateStrengthRecord, deleteStrengthRecord, mergeStrengthRecords } from "../../../lib/strengthMemory.js";
import { exerciseKey } from "../../../lib/strengthRecords.js";

// Coach-only fix-up for one strength-memory line: correct a bad number, remove the record,
// or say "this is the same lift as <other name>" so the two records become one.
const input = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "5px 7px", fontSize: 12, outline: "none", borderRadius: RADIUS.md, width: "100%" };
const lbl = { fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 2 };
const num = (v) => (v === "" || v == null ? null : Number(v));

export function StrengthRecordEditor({ record, exerciseName, clientId, others, onChanged }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({});
  const [mergeKey, setMergeKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const start = () => {
    setF({ best_weight: record.best_weight ?? "", best_weight_reps: record.best_weight_reps ?? "", best_reps: record.best_reps ?? "", last_weight: record.last_weight ?? "", last_reps: record.last_reps ?? "" });
    setMsg(null); setMergeKey(""); setOpen(true);
  };
  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setOpen(false); onChanged?.(okText);
  };
  const save = () => {
    const vals = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, num(v)]));
    if (Object.values(vals).some((v) => v != null && (!Number.isFinite(v) || v < 0))) { setMsg({ ok: false, text: "Numbers must be 0 or more." }); return; }
    return run(() => updateStrengthRecord(record.id, vals));
  };
  const remove = () => { if (window.confirm(`Remove the remembered lifts for "${record.exercise_name}"? New logged sets will start it fresh.`)) return run(() => deleteStrengthRecord(record.id)); };
  const merge = () => {
    const target = others.find((o) => o.exercise_key === mergeKey);
    if (!target) return;
    if (!window.confirm(`Treat "${exerciseName}" and "${target.exercise_name}" as the same lift? Their records combine (best of both) and future logs of either name feed one record.`)) return;
    return run(() => mergeStrengthRecords(clientId, exerciseKey(exerciseName), target.exercise_key));
  };

  const field = (k, label) => <div><label style={lbl}>{label}</label><input style={input} type="number" step="any" value={f[k] ?? ""} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} /></div>;

  if (!open) return <button type="button" onClick={start} style={{ background: "none", border: "none", color: S.muted, fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}>Edit remembered lifts</button>;
  return (
    <div style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 10, margin: "0 0 14px", display: "grid", gap: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>Remembered lifts — {record.exercise_name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
        {field("best_weight", "Best weight (lb)")}{field("best_weight_reps", "Reps at best")}{field("best_reps", "Most reps")}{field("last_weight", "Last weight (lb)")}{field("last_reps", "Last reps")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn sm onClick={save} disabled={busy}>Save</Btn>
        <Btn sm danger onClick={remove} disabled={busy}>Remove record</Btn>
        <Btn sm onClick={() => setOpen(false)} disabled={busy}>Cancel</Btn>
      </div>
      {others.length > 0 && (
        <div style={{ borderTop: "1px solid " + S.border, paddingTop: 8 }}>
          <label style={lbl}>Same lift as another name? Merge into…</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select style={{ ...input, width: "auto", minWidth: 180 }} value={mergeKey} onChange={(e) => setMergeKey(e.target.value)}>
              <option value="">Choose a lift…</option>{others.map((o) => <option key={o.exercise_key} value={o.exercise_key}>{o.exercise_name}</option>)}
            </select>
            <Btn sm teal onClick={merge} disabled={busy || !mergeKey}>Merge</Btn>
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</div>}
    </div>
  );
}
