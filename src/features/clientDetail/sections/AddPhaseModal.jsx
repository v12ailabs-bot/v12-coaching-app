import { useState } from "react";
import { S, RADIUS } from "../../../theme.jsx";
import { Modal, Btn } from "../../../components/ui/index.js";
import { validateRoadmap, suggestNextWeeks } from "../../../lib/roadmapValidation.js";

// Add Phase form. Builds a roadmap row and hands it to the planner at the
// chosen position — it does NOT save on its own (the planner's Save Roadmap
// persists everything together, so adding a phase can't clobber or half-apply
// the coach's other unsaved edits). The draft is validated against the whole
// roadmap live; overlaps/reversed dates block adding, and nothing else is ever
// moved to make room.
const MOVEMENT_TAGS = ["Squat", "Hinge", "Push", "Pull", "Single-leg", "Carry", "Core"];
const input = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 13, outline: "none", borderRadius: RADIUS.md };
const label = { fontSize: 11, color: S.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, display: "block" };

export function AddPhaseModal({ rows, programWeeks, onAdd, onClose }) {
  const suggestion = suggestNextWeeks(rows, 4);
  const [name, setName] = useState("");
  const [position, setPosition] = useState(rows.length + 1);
  const [start, setStart] = useState(String(suggestion.week_start));
  const [duration, setDuration] = useState("4");
  const [focus, setFocus] = useState("");
  const [tags, setTags] = useState([]);
  const [objective, setObjective] = useState("");

  const dur = parseInt(duration);
  const s = parseInt(start);
  const end = Number.isInteger(s) && Number.isInteger(dur) && dur >= 1 ? s + dur - 1 : "";

  const draft = {
    phase: name.trim(), week_start: Number.isInteger(s) ? s : "", week_end: end,
    note: "", objective: objective.trim(), training_focus: focus.trim(), movement_focus: tags.join(", "),
    progression_strategy: "", exit_criteria: [],
  };
  const idx = Math.min(Math.max(position - 1, 0), rows.length);
  const next = [...rows.slice(0, idx), draft, ...rows.slice(idx)];
  const { errors, warnings } = validateRoadmap(next, { programWeeks });
  // Only issues that involve the new phase matter here.
  const mine = (list) => list.filter((x) => x.index === idx);
  const myErrors = mine(errors);
  const myWarnings = mine(warnings).filter((w) => !/no dates yet/.test(w.message));
  const canAdd = name.trim() && Number.isInteger(s) && end !== "" && myErrors.length === 0;

  return (
    <Modal title="Add Phase" onClose={onClose} width={520}>
      <div style={{ display: "grid", gap: 12 }}>
        <div><label style={label}>Phase name</label><input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hypertrophy" autoFocus /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={label}>Position</label>
            <select style={input} value={position} onChange={(e) => setPosition(parseInt(e.target.value))}>
              {Array.from({ length: rows.length + 1 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div><label style={label}>Start week</label><input style={input} type="number" min="1" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><label style={label}>Duration (wks)</label><input style={input} type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: S.muted }}>{end !== "" ? `Runs weeks ${s}–${end}.` : "Enter a start week and duration."}</div>
        <div><label style={label}>Phase focus</label><input style={input} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Muscle development and size" /></div>
        <div>
          <label style={label}>Key movement patterns</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MOVEMENT_TAGS.map((t) => {
              const on = tags.includes(t);
              return <button key={t} type="button" onClick={() => setTags((l) => (on ? l.filter((x) => x !== t) : [...l, t]))}
                style={{ padding: "5px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer", background: on ? "rgba(255,106,0,.16)" : "transparent", color: on ? S.accent : S.text, border: "1px solid " + (on ? S.accent : S.border) }}>{t}</button>;
            })}
          </div>
        </div>
        <div><label style={label}>Objective (optional)</label><textarea style={{ ...input, resize: "vertical" }} rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} /></div>
      </div>
      {myErrors.map((x, i) => <div key={i} style={{ fontSize: 12, color: S.danger, marginTop: 10 }}>{x.message} Adjust the start week or duration — other phases won't be moved for you.</div>)}
      {myWarnings.map((x, i) => <div key={i} style={{ fontSize: 12, color: S.warning, marginTop: 8 }}>{x.message}</div>)}
      <div style={{ fontSize: 11, color: S.muted, marginTop: 12 }}>Added to the roadmap draft — click Save Roadmap to publish it.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
        <Btn sm onClick={onClose}>Cancel</Btn>
        <Btn sm onClick={() => canAdd && onAdd(idx, draft)} disabled={!canAdd}>Add Phase</Btn>
      </div>
    </Modal>
  );
}
