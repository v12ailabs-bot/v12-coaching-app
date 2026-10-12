import { useState } from "react";
import { S, RADIUS } from "../../../theme.jsx";
import { Modal, Btn } from "../../../components/ui/index.js";
import { dateRangeForWeeks } from "../../../components/ProgramRoadmap.jsx";
import { validateRoadmap } from "../../../lib/roadmapValidation.js";
import { AddPhaseModal } from "./AddPhaseModal.jsx";
import { PlanDetailsEditor } from "./PlanDetailsEditor.jsx";
import { generateRoadmapRows, generatePlanDetailsFor } from "../../../lib/roadmapApi.js";

// The ONE roadmap editor (the old separate "Edit & Generate Roadmap" popup was folded into this).
// Four-step "Edit Program" flow (Details -> Phases -> Exit Criteria -> Review).
// Everything is edited on a LOCAL COPY; nothing is written until the final
// Save on the Review step, so abandoning the wizard (or a half-configured
// roadmap) never touches what the client sees. Closing with edits asks first.
// Saving reuses the roadmap planner's own persistence (ids kept, history
// snapshot, plan details) via onSave — no second write path.
//
// Program settings that don't exist in the data model (e.g. "show roadmap to
// client", "allow client to edit check-ins") are deliberately not shown: a
// toggle that saves nothing would be a fake control.
const STEPS = ["Details", "Phases", "Exit Criteria", "Review"];
const input = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 13, outline: "none", borderRadius: RADIUS.md };
const lbl = { fontSize: 11, color: S.muted, textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 4px", display: "block" };
const CYCLE = { incomplete: "complete", complete: "na", na: "incomplete" };
const MARK = { complete: "✓", incomplete: "○", na: "–" };
const num = (v) => (v === "" || v == null ? null : parseInt(v));

export function RoadmapWizard({ program, initialRows, startAt = 0, onSave, onClose }) {
  const [step, setStep] = useState(startAt);
  const [details, setDetails] = useState({
    name: program.name || "", description: program.description || "", weeks: program.weeks ?? 12,
    show_roadmap_to_client: program.show_roadmap_to_client ?? true,
    progress_tracking_enabled: program.progress_tracking_enabled ?? true,
    client_can_edit_checkins: program.client_can_edit_checkins ?? true,
  });
  const [rows, setRows] = useState(() => initialRows.map((r) => ({ ...r, exit_criteria: (r.exit_criteria || []).map((c) => ({ ...c })) })));
  const [adding, setAdding] = useState(false);
  const [detailsFor, setDetailsFor] = useState(null); // row index being given plan details
  const [genBusy, setGenBusy] = useState(null);       // "roadmap" | "details" | null
  const [genErr, setGenErr] = useState(null);
  const [genInfo, setGenInfo] = useState(null);
  const [generated, setGenerated] = useState(false);   // the rows came from Generate Roadmap (recorded in plan history)
  const [moreOpen, setMoreOpen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);

  const change = (fn) => { fn(); setTouched(true); };
  const setD = (k, v) => change(() => setDetails((d) => ({ ...d, [k]: v })));
  const updRow = (i, patch) => change(() => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  const move = (i, dir) => change(() => setRows((rs) => { const j = i + dir; if (j < 0 || j >= rs.length) return rs; const n = rs.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; }));

  const weeks = num(details.weeks);
  const detailErrors = [];
  if (!details.name.trim()) detailErrors.push("Program name is required.");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) detailErrors.push("Duration must be a whole number of weeks from 1 to 104.");
  if (details.description.length > 500) detailErrors.push("Description is limited to 500 characters.");

  const review = validateRoadmap(rows, { programWeeks: Number.isInteger(weeks) ? weeks : null });
  const blocking = review.errors.filter((e) => e.blocking !== false);
  const named = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.phase.trim());
  const canNext = step === 0 ? detailErrors.length === 0 : step === 1 ? blocking.length === 0 : true;

  // Generate Roadmap (AI): proposes the whole phase sequence from the client's real data. It REPLACES the
  // phases in this editor (their ids, exit-criteria progress and plan details are not kept), and nothing is
  // saved until "Save program".
  const aiRoadmap = async () => {
    if (rows.length && !window.confirm("Replace the phases in this editor with an AI-generated proposal?\n\nExisting phases, their exit-criteria progress and plan details are replaced when you save. Nothing is saved until you click Save program.")) return;
    setGenBusy("roadmap"); setGenErr(null); setGenInfo(null);
    try {
      const r = await generateRoadmapRows(program.id);
      setRows(r.rows); setGenInfo({ confidence: r.confidence, dataUsed: r.dataUsed }); setGenerated(true); setTouched(true);
    } catch (e) { setGenErr(e.message); }
    setGenBusy(null);
  };
  // Generate plan details (AI): rationale, planned exercise changes and checkpoints for each named phase.
  const aiDetails = async () => {
    if (!named.length) return;
    const has = named.some(({ r }) => r.plan_rationale || (r.planned_changes || []).length || (r.checkpoints || []).length);
    if (has && !window.confirm("Replace the existing rationale, planned changes and checkpoints with an AI proposal? Nothing is saved until you click Save program.")) return;
    setGenBusy("details"); setGenErr(null);
    try {
      const details = await generatePlanDetailsFor(program.id, named.map(({ r }) => r));
      change(() => setRows((rs) => rs.map((row, idx) => { const k = named.findIndex(({ i }) => i === idx); return k === -1 || !details[k] ? row : { ...row, ...details[k] }; })));
    } catch (e) { setGenErr(e.message); }
    setGenBusy(null);
  };

  const close = () => { if (!touched || window.confirm("Discard your changes to this program?")) onClose(); };

  const save = async () => {
    if (blocking.length || detailErrors.length) return;
    if (review.errors.length && !window.confirm(`This roadmap has conflicts:\n\n${review.errors.map((x) => "• " + x.message).join("\n")}\n\nSave anyway?`)) return;
    setSaving(true); setError(null);
    const res = await onSave({ details: {
      name: details.name.trim(), description: details.description.trim() || null, weeks,
      show_roadmap_to_client: !!details.show_roadmap_to_client, progress_tracking_enabled: !!details.progress_tracking_enabled, client_can_edit_checkins: !!details.client_can_edit_checkins,
    }, rows, source: generated ? "ai_generated" : "manual" });
    setSaving(false);
    if (!res.ok) setError(res.error || "Could not save."); else onClose(true);
  };

  const stepper = (
    <div style={{ display: "flex", alignItems: "center", margin: "0 0 18px" }}>
      {STEPS.map((label, i) => {
        const active = i === step, done = i < step;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <button type="button" onClick={() => { if (i <= step || canNext) setStep(i); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 0 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
                background: done ? S.success : active ? "rgba(255,106,0,.16)" : "transparent", color: done ? "#0B0B0D" : active ? S.accent : S.muted, border: active ? "2px solid " + S.accent : done ? "none" : "1px solid " + S.border }}>{done ? "✓" : i + 1}</span>
              <span style={{ fontSize: 11, color: active ? S.text : S.muted }}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, margin: "0 8px 16px", background: done ? S.success : S.border }} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <Modal title="Edit Program" onClose={close} width={760}>
      {stepper}

      {step === 0 && (
        <>
          <label style={lbl}>Program name</label>
          <input style={input} value={details.name} onChange={(e) => setD("name", e.target.value)} />
          <label style={lbl}>Program description</label>
          <textarea style={{ ...input, resize: "vertical" }} rows={3} value={details.description} onChange={(e) => setD("description", e.target.value)} />
          <div style={{ fontSize: 11, color: S.muted, textAlign: "right" }}>{details.description.length}/500</div>
          <label style={lbl}>Duration (weeks)</label>
          <input style={{ ...input, width: 140 }} type="number" min="1" max="104" value={details.weeks} onChange={(e) => setD("weeks", e.target.value)} />
          <div style={{ fontSize: 12, color: S.muted, marginTop: 10, lineHeight: 1.6 }}>
            Program start: {program.start_date || "not set"} (change it in the phase section). Nothing here reaches the client until you save on the last step.
          </div>
          <label style={lbl}>Program settings</label>
          {[
            ["show_roadmap_to_client", "Show roadmap to client", "Off: the client can't see this program's roadmap anywhere (enforced in the database)."],
            ["progress_tracking_enabled", "Enable progress tracking", "Off: the client's Progress page, goal status ring and milestone bars are hidden. Data is still collected and you still see it."],
            ["client_can_edit_checkins", "Allow client to edit past check-ins", "Off: the client can only fill in today's daily check-in and this week's weekly check-in — no backdating or editing earlier entries (enforced in the database)."],
          ].map(([key, title, help]) => (
            <label key={key} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid " + S.border, cursor: "pointer" }}>
              <input type="checkbox" checked={!!details[key]} onChange={(e) => setD(key, e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: S.accent }} />
              <span><span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{title}</span><span style={{ display: "block", fontSize: 11, color: S.muted, lineHeight: 1.5 }}>{help}</span></span>
            </label>
          ))}
          {detailErrors.map((e, i) => <div key={i} style={{ fontSize: 12, color: S.danger, marginTop: 8 }}>{e}</div>)}
        </>
      )}

      {step === 1 && (
        <>
          <div style={{ border: "1px dashed " + S.border, borderRadius: RADIUS.md, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>AI helpers — proposals only, nothing is saved until Save program</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Btn sm teal onClick={aiRoadmap} disabled={!!genBusy}>{genBusy === "roadmap" ? "Generating..." : "Generate Roadmap"}</Btn>
              <Btn sm onClick={aiDetails} disabled={!!genBusy || named.length === 0}>{genBusy === "details" ? "Generating..." : "Generate plan details"}</Btn>
              <span style={{ fontSize: 11, color: S.muted }}>Roadmap proposes the phases; plan details adds the reason, planned exercise changes and checkpoints to each.</span>
            </div>
            {genErr && <div style={{ fontSize: 12, color: S.danger, marginTop: 6 }}>{genErr}</div>}
            {genInfo && <div style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>Generated from: {genInfo.dataUsed.join(", ") || "limited client data"}{genInfo.confidence && ` · Confidence: ${genInfo.confidence}`} — review and edit before saving.</div>}
          </div>
          {rows.length === 0 && <div style={{ fontSize: 13, color: S.muted, marginBottom: 10 }}>No phases yet. Add the first one below, or use Generate Roadmap.</div>}
          {rows.map((r, i) => {
            const s = num(r.week_start), e = num(r.week_end);
            const range = dateRangeForWeeks(program.start_date, s, e);
            const myIssues = [...review.errors, ...review.warnings].filter((x) => x.index === i && !/no dates yet/.test(x.message));
            return (
              <div key={i} style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "24px minmax(120px,2fr) 70px 70px auto", gap: 8, alignItems: "center" }}>
                  <span style={{ color: S.muted, fontSize: 12 }}>{i + 1}</span>
                  <input style={input} value={r.phase} placeholder="Phase name" onChange={(ev) => updRow(i, { phase: ev.target.value })} />
                  <input style={input} type="number" min="1" placeholder="Start wk" value={r.week_start} onChange={(ev) => updRow(i, { week_start: ev.target.value })} />
                  <input style={input} type="number" min="1" placeholder="End wk" value={r.week_end} onChange={(ev) => updRow(i, { week_end: ev.target.value })} />
                  <span style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "none", border: "1px solid " + S.border, color: S.text, cursor: "pointer", padding: "4px 8px", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} style={{ background: "none", border: "1px solid " + S.border, color: S.text, cursor: "pointer", padding: "4px 8px", opacity: i === rows.length - 1 ? 0.4 : 1 }}>↓</button>
                    <button type="button" title="Remove phase" onClick={() => { if (!r.id || window.confirm(`Remove "${r.phase || "this phase"}"? It, its plan details and any workout draft are deleted when you save.`)) change(() => setRows((rs) => rs.filter((_, j) => j !== i))); }} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 18 }}>×</button>
                  </span>
                </div>
                <div style={{ fontSize: 11, color: S.accent2, margin: "4px 0 0 32px" }}>{range || ""}{s != null && e != null && e >= s ? ` · ${e - s + 1} wk${e - s === 0 ? "" : "s"}` : ""}</div>
                {myIssues.map((x, k) => <div key={k} style={{ fontSize: 11, color: x.blocking === false || review.warnings.includes(x) ? S.warning : S.danger, margin: "2px 0 0 32px" }}>{x.message}</div>)}
                <div style={{ margin: "6px 0 0 32px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Btn sm onClick={() => setDetailsFor(i)}>Plan details</Btn>
                  <span style={{ fontSize: 11, color: S.muted }}>{(r.checkpoints || []).length} checkpoint{(r.checkpoints || []).length === 1 ? "" : "s"}{r.plan_rationale ? " · reason set" : ""}{(r.planned_changes || []).length ? ` · ${(r.planned_changes || []).length} planned change${(r.planned_changes || []).length === 1 ? "" : "s"}` : ""}</span>
                </div>
                <button type="button" onClick={() => setMoreOpen(moreOpen === i ? null : i)} style={{ background: "none", border: "none", color: S.muted, fontSize: 11, cursor: "pointer", margin: "6px 0 0 32px", padding: 0 }}>{moreOpen === i ? "▲ Hide focus & notes" : "▼ Focus & notes"}</button>
                {moreOpen === i && (
                  <div style={{ margin: "8px 0 0 32px", display: "grid", gap: 6 }}>
                    <textarea style={{ ...input, resize: "vertical" }} rows={2} placeholder="Objective — why this phase exists" value={r.objective || ""} onChange={(ev) => updRow(i, { objective: ev.target.value })} />
                    <input style={input} placeholder="Training focus (e.g. Strength)" value={r.training_focus || ""} onChange={(ev) => updRow(i, { training_focus: ev.target.value })} />
                    <input style={input} placeholder="Movement focus (e.g. Squat, Hinge, Push)" value={r.movement_focus || ""} onChange={(ev) => updRow(i, { movement_focus: ev.target.value })} />
                    <input style={input} placeholder="Progression strategy (e.g. Double progression)" value={r.progression_strategy || ""} onChange={(ev) => updRow(i, { progression_strategy: ev.target.value })} />
                    <input style={input} placeholder="Note shown on the roadmap" value={r.note || ""} onChange={(ev) => updRow(i, { note: ev.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
          <Btn sm onClick={() => setAdding(true)}>+ Add Phase</Btn>
          {detailsFor != null && rows[detailsFor] && <PlanDetailsEditor phase={rows[detailsFor]} onClose={() => setDetailsFor(null)} onSave={(patch) => { updRow(detailsFor, patch); setDetailsFor(null); }} />}
          {adding && <AddPhaseModal rows={rows} programWeeks={Number.isInteger(weeks) ? weeks : null} onClose={() => setAdding(false)} onAdd={(idx, draft) => { change(() => setRows((rs) => [...rs.slice(0, idx), draft, ...rs.slice(idx)])); setAdding(false); }} />}
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.6, marginBottom: 10 }}>What must be true for each phase to be complete. Tap a circle to cycle Incomplete → Complete → N/A. A criterion is only complete because you mark it.</div>
          {named.length === 0 && <div style={{ fontSize: 13, color: S.muted }}>Add phases first.</div>}
          {named.map(({ r, i }) => (
            <div key={i} style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 10, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{i + 1}. {r.phase}</div>
              {(r.exit_criteria || []).map((c, ci) => (
                <div key={ci} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <button type="button" title="Cycle status" onClick={() => updRow(i, { exit_criteria: r.exit_criteria.map((x, xi) => (xi === ci ? { ...x, status: CYCLE[x.status] || "complete" } : x)) })}
                    style={{ width: 28, height: 28, flexShrink: 0, background: "none", cursor: "pointer", fontWeight: 700, borderRadius: RADIUS.md, border: "1px solid " + (c.status === "complete" ? S.success : S.border), color: c.status === "complete" ? S.success : S.muted }}>{MARK[c.status] || "○"}</button>
                  <input style={input} value={c.label} placeholder="e.g. Attendance ≥ 80%" onChange={(ev) => updRow(i, { exit_criteria: r.exit_criteria.map((x, xi) => (xi === ci ? { ...x, label: ev.target.value } : x)) })} />
                  <button type="button" onClick={() => updRow(i, { exit_criteria: r.exit_criteria.filter((_, xi) => xi !== ci) })} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 18 }}>×</button>
                </div>
              ))}
              <Btn sm onClick={() => updRow(i, { exit_criteria: [...(r.exit_criteria || []), { label: "", status: "incomplete" }] })}>+ Add criterion</Btn>
            </div>
          ))}
        </>
      )}

      {step === 3 && (
        <>
          <ReviewBlock title="Program details" onEdit={() => setStep(0)}>
            <div style={{ fontSize: 13 }}><b>{details.name || "—"}</b> · {weeks || "?"} weeks</div>
            <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>{details.description || "No description."}</div>
            <div style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>Client sees roadmap: <b>{details.show_roadmap_to_client ? "yes" : "no"}</b> · Progress tracking: <b>{details.progress_tracking_enabled ? "on" : "off"}</b> · Edit past check-ins: <b>{details.client_can_edit_checkins ? "allowed" : "locked"}</b></div>
            {(details.name.trim() !== (program.name || "") || String(weeks) !== String(program.weeks ?? "") || details.description.trim() !== (program.description || "") || ["show_roadmap_to_client", "progress_tracking_enabled", "client_can_edit_checkins"].some((k) => !!details[k] !== (program[k] ?? true))) && <div style={{ fontSize: 11, color: S.accent, marginTop: 4 }}>Changed — saved when you click Save.</div>}
          </ReviewBlock>
          <ReviewBlock title={`Phases (${named.length})`} onEdit={() => setStep(1)}>
            {named.map(({ r, i }) => {
              const s = num(r.week_start), e = num(r.week_end);
              return <div key={i} style={{ fontSize: 12, padding: "2px 0" }}>{i + 1}. <b>{r.phase}</b> <span style={{ color: S.muted }}>{s != null && e != null ? `weeks ${s}–${e} (${e - s + 1} wk${e === s ? "" : "s"})${dateRangeForWeeks(program.start_date, s, e) ? " · " + dateRangeForWeeks(program.start_date, s, e) : ""}` : "no dates"}{r.training_focus ? ` · ${r.training_focus}` : ""}</span></div>;
            })}
          </ReviewBlock>
          <ReviewBlock title="Exit criteria" onEdit={() => setStep(2)}>
            {named.map(({ r, i }) => { const c = (r.exit_criteria || []).filter((x) => x.label.trim()); return <div key={i} style={{ fontSize: 12, padding: "2px 0" }}>{r.phase}: <span style={{ color: S.muted }}>{c.length ? `${c.filter((x) => x.status === "complete").length}/${c.filter((x) => x.status !== "na").length} complete · ${c.map((x) => x.label).join("; ")}` : "none set"}</span></div>; })}
          </ReviewBlock>
          {(review.errors.length > 0 || review.warnings.length > 0 || detailErrors.length > 0) && (
            <div style={{ border: "1px solid " + (blocking.length || detailErrors.length ? S.danger : S.warning), borderRadius: RADIUS.md, padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: blocking.length || detailErrors.length ? S.danger : S.warning, marginBottom: 4 }}>{blocking.length || detailErrors.length ? "Fix before saving" : "Review"}</div>
              {detailErrors.map((x, k) => <div key={"d" + k} style={{ fontSize: 12, color: S.danger }}>• {x} <button type="button" onClick={() => setStep(0)} style={{ background: "none", border: "none", color: S.accent, cursor: "pointer", fontSize: 11 }}>Fix</button></div>)}
              {review.errors.map((x, k) => <div key={"e" + k} style={{ fontSize: 12, color: S.danger }}>• {x.message} <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none", color: S.accent, cursor: "pointer", fontSize: 11 }}>Fix</button></div>)}
              {review.warnings.map((x, k) => <div key={"w" + k} style={{ fontSize: 12, color: S.warning }}>• {x.message}</div>)}
            </div>
          )}
          {error && <div style={{ fontSize: 12, color: S.danger, marginBottom: 8 }}>{error}</div>}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20 }}>
        <Btn sm onClick={step === 0 ? close : () => setStep(step - 1)} disabled={saving}>{step === 0 ? "Cancel" : "← Back"}</Btn>
        {step < 3
          ? <Btn onClick={() => setStep(step + 1)} disabled={!canNext}>Next: {STEPS[step + 1]} →</Btn>
          : <Btn onClick={save} disabled={saving || blocking.length > 0 || detailErrors.length > 0}>{saving ? "Saving..." : "Save program"}</Btn>}
      </div>
    </Modal>
  );
}

function ReviewBlock({ title, onEdit, children }) {
  return (
    <div style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: "10px 12px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>{title}</span>
        <button type="button" onClick={onEdit} style={{ background: "none", border: "none", color: S.accent, cursor: "pointer", fontSize: 11 }}>Edit</button>
      </div>
      {children}
    </div>
  );
}
