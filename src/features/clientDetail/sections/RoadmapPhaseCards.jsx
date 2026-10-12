import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Modal, Btn, StatusBadge } from "../../../components/ui/index.js";
import { dateRangeForWeeks } from "../../../components/ProgramRoadmap.jsx";
import { checkpointWhen, CHECKPOINT_LABELS } from "../../../lib/planCheckpoints.js";
import { PhaseDraftModal } from "./PhaseDraftModal.jsx";
import { assessPhase } from "../../../lib/phaseAssessment.js";
import { PhaseDetailModal } from "./PhaseDetailModal.jsx";

// Coach-side phase cards (roadmap board): one card per saved phase with its
// real status, dates, focus and exit-criteria checklist. Exit criteria are
// editable straight from the card — "Edit criteria" opens a small editor for
// just that phase and writes only that row's exit_criteria, so the coach never
// has to go through the full roadmap form (or lose unsaved edits in it) to
// tick off or tweak a criterion. The statuses live in the same
// program_phases.exit_criteria column Phase Review and the roadmap preview
// already read — this is another editor for that data, not a second store.
// Status is derived from the program's current phase, never hardcoded, and a
// criterion is only ever "complete" because the coach set it so.

const CYCLE = { incomplete: "complete", complete: "na", na: "incomplete" };
const MARK = { complete: "✓", incomplete: "○", na: "–" };
const blankCriterion = () => ({ label: "", status: "incomplete" });
const countDone = (list) => (list || []).filter((c) => c.status === "complete").length;

function CriteriaEditor({ phase, onClose, onSaved }) {
  const [list, setList] = useState((phase.exit_criteria || []).map((c) => ({ ...c })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setSaving(true); setError(null);
    const clean = list.filter((c) => c.label.trim()).map((c) => ({ ...c, label: c.label.trim() }));
    const { error: err } = await supabase.from("program_phases").update({ exit_criteria: clean }).eq("id", phase.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved(phase.id, clean);
    onClose();
  };

  return (
    <Modal title={`Exit criteria — ${phase.phase}`} onClose={onClose} width={520}>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 12, lineHeight: 1.6 }}>
        What must be true for this phase to be complete. Tap the circle to cycle Incomplete → Complete → N/A.
      </div>
      {list.length === 0 && <div style={{ fontSize: 13, color: S.muted, marginBottom: 8 }}>No criteria yet.</div>}
      {list.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <button type="button" title="Cycle status" onClick={() => setList((l) => l.map((x, j) => (j === i ? { ...x, status: CYCLE[x.status] || "complete" } : x)))}
            style={{ width: 30, height: 30, flexShrink: 0, background: "none", cursor: "pointer", fontWeight: 700, borderRadius: RADIUS.md,
              border: "1px solid " + (c.status === "complete" ? S.success : S.border), color: c.status === "complete" ? S.success : S.muted }}>
            {MARK[c.status] || "○"}
          </button>
          <input value={c.label} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="e.g. Attendance ≥ 80%"
            style={{ flex: 1, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "7px 10px", fontSize: 13, outline: "none", borderRadius: RADIUS.md }} />
          <button type="button" title="Remove" onClick={() => setList((l) => l.filter((_, j) => j !== i))}
            style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => setList((l) => [...l, blankCriterion()])}
        style={{ background: "none", border: "1px dashed " + S.border, color: S.text, padding: "8px 12px", fontSize: 12, cursor: "pointer", width: "100%", marginTop: 4, borderRadius: RADIUS.md }}>
        + Add Criterion
      </button>
      {error && <div style={{ fontSize: 12, color: S.danger, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <Btn sm onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn sm onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Btn>
      </div>
    </Modal>
  );
}

const ASSESS_TONE = { ready_to_advance: "green", on_track: "green", watch: "amber", behind: "red", hold: "amber", review: "amber", insufficient_data: "neutral", not_started: "neutral", not_assessable: "neutral" };
const ASSESS_LABEL = { ready_to_advance: "Ready to advance", on_track: "On track", watch: "Watch", behind: "Behind", hold: "Hold / extend", review: "Review", insufficient_data: "Not enough data", not_started: "Not started", not_assessable: "Not assessable" };

export function RoadmapPhaseCards({ rows, program, clientId, tracking, onCriteriaSaved, onEditDetails, onPatchPhase, onEditProgram }) {
  const [editing, setEditing] = useState(null);
  const [drafting, setDrafting] = useState(null);
  const [detail, setDetail] = useState(null); // { phase, status }
  const phases = rows.map((r, idx) => ({ ...r, _idx: idx })).filter((r) => r.phase.trim());
  if (!phases.length) return null;
  const currentIndex = phases.findIndex((p) => p.phase === program.phase);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 20 }}>
        {phases.map((p, i) => {
          const status = currentIndex === -1 ? "upcoming" : i < currentIndex ? "complete" : i === currentIndex ? "current" : "upcoming";
          const accent = status === "complete" ? S.success : status === "current" ? S.accent : S.border;
          const range = dateRangeForWeeks(program.start_date, p.week_start === "" ? null : parseInt(p.week_start), p.week_end === "" ? null : parseInt(p.week_end));
          const weeks = p.week_start !== "" && p.week_end !== "" ? parseInt(p.week_end) - parseInt(p.week_start) + 1 : null;
          const crit = p.exit_criteria || [];
          return (
            <div key={p.id || i} style={{ border: "1px solid " + accent, borderWidth: status === "current" ? 2 : 1, borderRadius: RADIUS.lg, padding: 14, background: S.surface, opacity: status === "upcoming" ? 0.85 : 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13,
                  background: status === "complete" ? S.success : "transparent", color: status === "complete" ? "#0B0B0D" : accent === S.border ? S.muted : accent, border: status === "complete" ? "none" : "2px solid " + accent }}>
                  {status === "complete" ? "✓" : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button type="button" onClick={() => setDetail({ idx: p._idx, status })} title="Open phase details" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: S.text, fontWeight: 700, fontSize: 14, textAlign: "left", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.phase} ›</button>
                  <div style={{ fontSize: 11, color: S.muted }}>{range || (p.week_start !== "" ? `Weeks ${p.week_start}–${p.week_end}` : "No dates yet")}{weeks ? ` · ${weeks} wk${weeks === 1 ? "" : "s"}` : ""}</div>
                </div>
                <StatusBadge label={status === "complete" ? "Complete" : status === "current" ? "Current" : "Upcoming"} tone={status === "complete" ? "green" : status === "current" ? "amber" : "neutral"} />
              </div>
              {(p.objective || p.training_focus) && (
                <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.5 }}>{p.objective || p.training_focus}</div>
              )}
              <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, display: "flex", justifyContent: "space-between" }}>
                <span>Exit criteria</span><span>{crit.length ? `${countDone(crit)}/${crit.length} complete` : "none set"}</span>
              </div>
              {crit.map((c, ci) => (
                <div key={ci} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: c.status === "na" ? S.muted : S.text }}>
                  <span style={{ color: c.status === "complete" ? S.success : S.muted, fontWeight: 700, width: 14 }}>{MARK[c.status] || "○"}</span>
                  <span style={{ textDecoration: c.status === "na" ? "line-through" : "none" }}>{c.label}</span>
                </div>
              ))}
              {status === "current" && (() => {
                const a = assessPhase({ phase: p, programStart: program.start_date, daily: tracking?.daily || [], nutCtx: tracking?.nutCtx || null });
                if (a.status === "not_assessable") return null;
                const nextName = phases[i + 1]?.phase;
                return (
                  <div style={{ border: "1px dashed " + S.border, borderRadius: RADIUS.md, padding: "8px 10px", fontSize: 11, lineHeight: 1.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ textTransform: "uppercase", letterSpacing: 1, color: S.muted, fontSize: 10 }}>Plan vs actual · advisory</span>
                      <StatusBadge label={ASSESS_LABEL[a.status]} tone={ASSESS_TONE[a.status]} />
                    </div>
                    <div style={{ color: S.text }}>{a.headline}</div>
                    {a.reasons.map((r, k) => <div key={k} style={{ color: S.muted }}>• {r}</div>)}
                    {a.status === "ready_to_advance" && nextName && <div style={{ color: S.accent2, marginTop: 4 }}>Next step: open Draft workouts on "{nextName}" to review and activate it.</div>}
                  </div>
                );
              })()}
              {(p.checkpoints || []).length > 0 && (
                <div style={{ fontSize: 11, color: S.muted, lineHeight: 1.5 }}>
                  {(p.checkpoints || []).map((c, k) => <div key={k}>◆ {c.label || CHECKPOINT_LABELS[c.type]} — {checkpointWhen(c, program.start_date)}</div>)}
                </div>
              )}
              {p.plan_rationale && <div style={{ fontSize: 11, color: S.muted, lineHeight: 1.5, fontStyle: "italic" }}>Plan: {p.plan_rationale}</div>}
              {(p.planned_changes || []).length > 0 && (
                <div style={{ fontSize: 11, color: S.muted, lineHeight: 1.5 }}>
                  {(p.planned_changes || []).map((c, k) => <div key={k}>↪ {c.action}: {c.from && c.to ? `${c.from} → ${c.to}` : c.to || c.from} <span style={{ opacity: 0.8 }}>({c.reason})</span></div>)}
                </div>
              )}
              <div style={{ marginTop: "auto", paddingTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {p.id ? (
                  <Btn sm teal onClick={() => setEditing(p)}>Edit criteria</Btn>
                ) : (
                  <div style={{ fontSize: 11, color: S.muted }}>Save the roadmap to edit this phase's criteria here.</div>
                )}
                {onEditDetails && <Btn sm onClick={() => onEditDetails(p._idx)}>Plan details</Btn>}
                {p.id && <Btn sm onClick={() => setDrafting(p)}>Draft workouts</Btn>}
              </div>
            </div>
          );
        })}
      </div>
      {detail && rows[detail.idx] && (
        <PhaseDetailModal phase={rows[detail.idx]} program={program} clientId={clientId} status={detail.status}
          assessment={detail.status === "current" ? assessPhase({ phase: rows[detail.idx], programStart: program.start_date, daily: tracking?.daily || [], nutCtx: tracking?.nutCtx || null }) : null}
          onClose={() => setDetail(null)} onPatch={onPatchPhase}
          onEditProgram={() => { setDetail(null); onEditProgram && onEditProgram(); }}
          onEditCriteria={() => { const ph = rows[detail.idx]; setDetail(null); setEditing(ph); }}
          onOpenDraft={() => { const ph = rows[detail.idx]; setDetail(null); setDrafting(ph); }} />
      )}
      {drafting && <PhaseDraftModal phase={drafting} program={program} clientId={clientId} onClose={() => setDrafting(null)} />}
      {editing && <CriteriaEditor phase={editing} onClose={() => setEditing(null)} onSaved={onCriteriaSaved} />}
    </>
  );
}
