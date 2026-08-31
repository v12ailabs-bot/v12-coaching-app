import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, Fld, RG, SectionHeader, Alert, EmptyState } from "../../../components/ui/index.js";
import { ProgramRoadmap, dateRangeForWeeks } from "../../../components/ProgramRoadmap.jsx";
import { DAY_ORDER, phaseRankOf, BLOCK_TYPE_SHORT } from "../../../lib/constants.js";
import { TOP_PHASES, SUB_PHASES, synthesizePhaseLabel } from "../../../lib/progressionModels.js";

// Append-only Program Phase log — every phase change is a new row, never an
// update, so the history in program_phase_history can't silently disappear.
async function logPhaseHistory({ programId, clientId, phase, phaseNote, changedBy, topPhase, subPhase }) {
  if (!phase) return;
  await supabase.from("program_phase_history").insert({
    program_id: programId ?? null, client_id: clientId, phase, phase_note: phaseNote ?? null, changed_by: changedBy ?? null,
    top_phase: topPhase ?? null, sub_phase: subPhase ?? null,
  });
}

// Capture the client's current training plan (program metadata + exercises) as a
// new immutable version. Returns {error, version}.
export async function createProgramVersion(clientId, label) {
  const { data: program } = await supabase.from("programs").select("*")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: exs } = await supabase.from("exercises").select("*").eq("client_id", clientId);
  const { data: last } = await supabase.from("program_versions").select("version")
    .eq("client_id", clientId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version || 0) + 1;
  // Sort by the same phase-then-order_index rule groupByDay uses, so a
  // snapshot's exercise order always matches what was live when it was taken.
  const sortedExs = (exs || []).slice().sort((a, b) => phaseRankOf(a) - phaseRankOf(b) || (a.order_index ?? 0) - (b.order_index ?? 0));
  const snapshot = {
    program: program ? { name: program.name, goal: program.goal, phase: program.phase, phase_note: program.phase_note } : null,
    exercises: sortedExs.map((e) => ({
      name: e.name, category: e.category, section: e.section, day_of_week: e.day_of_week, sets: e.sets,
      reps: e.reps, is_bodyweight: e.is_bodyweight, notes: e.notes, order_index: e.order_index, source: e.source,
      block_type: e.block_type, group_id: e.group_id,
    })),
  };
  const { error } = await supabase.from("program_versions").insert({ client_id: clientId, program_id: program?.id || null, version, label, snapshot });
  return { error, version };
}

// Roll the training plan back to a snapshot. Merge by name+day so exercises that
// survive the rollback keep their id (and their logged history); only exercises
// dropped from the snapshot are removed. Records the rollback as a new version.
export async function restoreProgramVersion(clientId, v) {
  const target = v.snapshot?.exercises || [];
  const { data: current } = await supabase.from("exercises").select("*").eq("client_id", clientId);
  const key = (e) => `${(e.name || "").trim().toLowerCase()}|${e.day_of_week || ""}`;
  const curMap = new Map();
  (current || []).forEach((e) => { if (!curMap.has(key(e))) curMap.set(key(e), e); });
  const usedIds = new Set();
  for (const t of target) {
    const fields = {
      category: t.category ?? null, section: t.section ?? null, day_of_week: t.day_of_week ?? null, sets: t.sets ?? null,
      reps: t.reps ?? null, is_bodyweight: !!t.is_bodyweight, notes: t.notes ?? null,
      order_index: t.order_index ?? 0, source: t.source || "coach",
      block_type: t.block_type || "straight_set", group_id: t.group_id ?? null,
    };
    const match = curMap.get(key(t));
    if (match) { usedIds.add(match.id); await supabase.from("exercises").update(fields).eq("id", match.id); }
    else { await supabase.from("exercises").insert({ client_id: clientId, name: t.name, ...fields }); }
  }
  for (const e of (current || [])) {
    if (!usedIds.has(e.id)) await supabase.from("exercises").delete().eq("id", e.id);
  }
  const prog = v.snapshot?.program;
  if (prog) {
    const { data: latest } = await supabase.from("programs").select("id")
      .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest) {
      await supabase.from("programs").update({ phase: prog.phase ?? null, phase_note: prog.phase_note ?? null, phase_updated_at: new Date().toISOString() }).eq("id", latest.id);
      if (prog.phase) await logPhaseHistory({ programId: latest.id, clientId, phase: prog.phase, phaseNote: prog.phase_note, changedBy: `Restored to v${v.version}` });
    }
  }
  await createProgramVersion(clientId, `Restored from v${v.version}`);
}

// Program version history: list, manual snapshot, view, and restore.
export function ProgramVersions({ clientId, refreshKey, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("program_versions").select("*").eq("client_id", clientId).order("version", { ascending: false });
    setVersions(data || []); setLoading(false);
  }, [clientId]);
  useEffect(() => { setLoading(true); load(); }, [load, refreshKey]);

  const snapshot = async () => {
    setBusy(true); setMsg(null);
    const { error, version } = await createProgramVersion(clientId, "Manual snapshot");
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Saved as v${version}.` });
    if (!error) load();
  };
  const restore = async (v) => {
    if (!window.confirm(`Restore v${v.version}? This rewrites the current training plan to match this version. Logged sessions for exercises that aren't in this version will be removed.`)) return;
    setBusy(true); setMsg(null);
    try { await restoreProgramVersion(clientId, v); setMsg({ ok: true, text: `Restored v${v.version}.` }); onRestored?.(); load(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  if (loading) return null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <SectionHeader title="Program Version History" action={<Btn sm teal onClick={snapshot} disabled={busy}>{busy ? "..." : "Snapshot current"}</Btn>} />
      <Alert variant={msg?.ok ? "success" : "error"}>{msg?.text}</Alert>
      {versions.length === 0 && <EmptyState title="No versions yet" sub="A snapshot is saved automatically when you generate a program — or save one now." />}
      {versions.map((v) => {
        const exs = v.snapshot?.exercises || [];
        const open = openId === v.id;
        // Sequential "Day 1..N" labels for this snapshot (matches the live views).
        const dayLabelOf = {};
        { let n = 0; [...new Set(exs.map((e) => e.day_of_week).filter(Boolean))]
            .sort((a, b) => (DAY_ORDER.indexOf(a) === -1 ? 99 : DAY_ORDER.indexOf(a)) - (DAY_ORDER.indexOf(b) === -1 ? 99 : DAY_ORDER.indexOf(b)))
            .forEach((day) => { dayLabelOf[day] = "Day " + (++n); }); }
        return (
          <div key={v.id} style={{ border: "1px solid " + S.border, background: S.surface2, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, marginRight: 10 }}>v{v.version}</span>
                <span style={{ fontSize: 12, color: S.text }}>{v.label || "Snapshot"}</span>
                <span style={{ fontSize: 11, color: S.muted, marginLeft: 10 }}>{(v.created_at || "").slice(0, 10)} · {exs.length} exercises</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setOpenId(open ? null : v.id)} style={{ padding: "7px 12px", fontSize: 10, background: "transparent", color: S.text, border: "1px solid " + S.border, cursor: "pointer", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>{open ? "Hide" : "View"}</button>
                <Btn sm onClick={() => restore(v)} disabled={busy}>Restore</Btn>
              </div>
            </div>
            {open && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                <thead><tr>{["Exercise", "Day", "Sets", "Reps", "Notes"].map((h) => <th key={h} style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, textAlign: "left", padding: "6px 10px", borderBottom: "1px solid " + S.border }}>{h}</th>)}</tr></thead>
                <tbody>
                  {exs.map((e, i) => (
                    <tr key={i}>
                      <td style={{ padding: "6px 10px", fontSize: 12, borderBottom: "1px solid " + S.border }}>
                        {e.name}{BLOCK_TYPE_SHORT[e.block_type] && <span style={{ marginLeft: 6, fontSize: 9, color: S.accent2 }}>{BLOCK_TYPE_SHORT[e.block_type]}{e.group_id ? " " + e.group_id : ""}</span>}
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{dayLabelOf[e.day_of_week] || "—"}</td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{e.sets ?? "—"}</td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{e.reps || "—"}</td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{e.notes || "—"}</td>
                    </tr>
                  ))}
                  {exs.length === 0 && <tr><td colSpan={5} style={{ padding: "6px 10px", fontSize: 12, color: S.muted }}>No exercises captured.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// Program phase / block adjustment for the client's most recent program, plus
// its permanent (append-only) change history.
export function ProgramPhase({ clientId, onOpenRoadmap }) {
  const [program, setProgram] = useState(null);
  const [topPhase, setTopPhase] = useState("foundation");
  const [subPhase, setSubPhase] = useState("foundation");
  // Optional: a planned-roadmap step's exact label, when the coach wants the
  // displayed phase (and anything matching it, e.g. AIRecommendationCard,
  // ProgramRoadmap's currentPhase highlight) to track a custom roadmap step
  // instead of the synthesized "Top — Sub" label.
  const [roadmapStepPhase, setRoadmapStepPhase] = useState("");
  const [note, setNote] = useState("");
  const [startDate, setStartDate] = useState("");
  const [history, setHistory] = useState([]);
  const [plannedPhases, setPlannedPhases] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("programs").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const [{ data: hist }, { data: planned }] = await Promise.all([
      supabase.from("program_phase_history").select("*").eq("client_id", clientId).order("changed_at", { ascending: false }).limit(20),
      data ? supabase.from("program_phases").select("*").eq("program_id", data.id).order("order_index") : Promise.resolve({ data: [] }),
    ]);
    setProgram(data || null);
    setTopPhase(data?.top_phase || "foundation");
    setSubPhase(data?.sub_phase || "foundation");
    setRoadmapStepPhase("");
    setNote(data?.phase_note || "");
    setStartDate(data?.start_date || "");
    setHistory(hist || []);
    setPlannedPhases(planned || []);
    setLoading(false);
  }, [clientId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const save = async () => {
    if (!program) return;
    setSaving(true); setMsg(null);
    const trimmedNote = note.trim() || null;
    const trimmedStart = startDate || null;
    // The Top/Sub phase pair is what the AI generator reads. `phase` stays a
    // plain display string so every existing reader of it (PhaseAlertsPanel,
    // CoachHome, ClientHero, ProgramRoadmapCard, AIRecommendationCard's
    // roadmap matching, etc.) keeps working unchanged — synthesized from the
    // new fields by default, or the matched roadmap-step label if picked.
    const displayPhase = roadmapStepPhase || synthesizePhaseLabel(topPhase, subPhase);
    const { error } = await supabase.from("programs")
      .update({ top_phase: topPhase, sub_phase: subPhase, phase: displayPhase, phase_note: trimmedNote, phase_updated_at: new Date().toISOString(), start_date: trimmedStart })
      .eq("id", program.id);
    if (!error) await logPhaseHistory({ programId: program.id, clientId, phase: displayPhase, phaseNote: trimmedNote, topPhase, subPhase });
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Phase updated." });
    if (!error) {
      // Reflect the save optimistically instead of calling load() — a full
      // refetch here would race any typing the coach does into the Phase
      // Note textarea right after clicking Save and wipe it out.
      setProgram((p) => (p ? { ...p, top_phase: topPhase, sub_phase: subPhase, phase: displayPhase, phase_note: trimmedNote, phase_updated_at: new Date().toISOString(), start_date: trimmedStart } : p));
      const { data: hist } = await supabase.from("program_phase_history").select("*").eq("client_id", clientId).order("changed_at", { ascending: false }).limit(20);
      setHistory(hist || []);
    }
  };

  if (loading) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Program Phase</CardTitle>
      {!program ? (
        <div style={{ fontSize: 13, color: S.muted }}>No program yet. Generate or assign a program first, then set its phase here.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
            {program.name || "Program"} · {program.phase_updated_at ? `phase set ${program.phase_updated_at.slice(0, 10)}` : "no phase set yet"}
          </div>
          <Fld label="Top Phase — drives which progression model the AI generator uses">
            <RG options={TOP_PHASES} value={topPhase} onChange={setTopPhase} cap />
          </Fld>
          <Fld label="Sub Phase — where in this block's internal cycle">
            <RG options={SUB_PHASES} value={subPhase} onChange={setSubPhase} cap />
          </Fld>
          <div style={{ fontSize: 11, color: S.muted, marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
            Performance phases — both the top-level block and the sub-phase within any block — are typically your shortest: a testing/peak window, not somewhere to live long-term.
          </div>
          {plannedPhases.length > 0 && (
            <Fld label="Match a planned roadmap step (optional)">
              <select value={roadmapStepPhase} onChange={(e) => setRoadmapStepPhase(e.target.value)}
                style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }}>
                <option value="">{`— None, use "${synthesizePhaseLabel(topPhase, subPhase)}" —`}</option>
                {plannedPhases.map((p) => <option key={p.id} value={p.phase}>{p.phase}</option>)}
              </select>
              <div style={{ fontSize: 11, color: S.muted, marginTop: 6, lineHeight: 1.5 }}>Overrides the displayed phase label to match this roadmap step, so the roadmap and AI recommendations stay in sync with it.</div>
            </Fld>
          )}
          <Fld label="Program Start Date (drives Week X of Y on the client dashboard)">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              style={{ background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }} />
          </Fld>
          <Fld label="Phase Note (what's the focus right now?)">
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Week 3 of accumulation — push volume on the lower body, hold loads on upper."
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical" }} />
          </Fld>
          {program.progression_model_key && (
            <div style={{ fontSize: 12, color: S.accent2, marginBottom: 14 }}>Last generated with progression model: <strong>{program.progression_model_key}</strong></div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Phase"}</Btn>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</span>}
          </div>
          {plannedPhases.length === 0 && (
            <div style={{ background: "rgba(255,106,0,.08)", border: "1px solid rgba(255,106,0,.25)", padding: "12px 16px", marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: S.text, lineHeight: 1.5 }}>This is just the current phase label. To plan the client's <strong>full sequence</strong> — phase names, order, and week ranges — use the Program Roadmap builder below.</div>
              <button onClick={onOpenRoadmap} style={{ background: "none", border: "1px solid " + S.accent, color: S.accent, padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Open Program Roadmap →</button>
            </div>
          )}
          <div style={{ marginTop: 22, borderTop: "1px solid " + S.border, paddingTop: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 10 }}>Phase History</div>
            {history.length === 0 ? (
              <div style={{ fontSize: 12, color: S.muted }}>No phase changes logged yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((h) => (
                  <div key={h.id} style={{ fontSize: 12, color: S.text, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ color: S.muted, minWidth: 130 }}>{(h.changed_at || "").slice(0, 16).replace("T", " ")}</span>
                    <span style={{ fontWeight: 600 }}>{h.phase}</span>
                    {h.changed_by && <span style={{ color: S.muted }}>· {h.changed_by}</span>}
                    {h.phase_note && <span style={{ color: S.muted }}>— {h.phase_note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

const blankRoadmapRow = () => ({
  phase: "", week_start: "", week_end: "", note: "",
  objective: "", training_focus: "", movement_focus: "", progression_strategy: "", exit_criteria: [],
});
const blankExitCriterion = () => ({ label: "", status: "incomplete" });

// The coach's forward-looking plan for this program's roadmap (program_phases —
// separate from the append-only program_phase_history above). Freely editable:
// Save replaces the whole set for this program, rather than appending. The
// live preview below the editor is the exact ProgramRoadmap the client sees
// on their dashboard and Training Plan page.
export function ProgramRoadmapPlanner({ clientId }) {
  const [program, setProgram] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { data: prog } = await supabase.from("programs").select("id,phase,start_date").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setProgram(prog || null);
    if (prog) {
      const { data: planned } = await supabase.from("program_phases").select("*").eq("program_id", prog.id).order("order_index");
      setRows((planned || []).map((p) => ({
        phase: p.phase, week_start: p.week_start ?? "", week_end: p.week_end ?? "", note: p.note || "",
        objective: p.objective || "", training_focus: p.training_focus || "", movement_focus: p.movement_focus || "",
        progression_strategy: p.progression_strategy || "", exit_criteria: p.exit_criteria || [],
      })));
    } else {
      setRows([]);
    }
    setLoading(false);
  }, [clientId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const updateRow = (i, field, value) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  const move = (i, dir) => setRows((r) => {
    const j = i + dir;
    if (j < 0 || j >= r.length) return r;
    const next = r.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const save = async () => {
    if (!program) return;
    setSaving(true); setMsg(null);
    const clean = rows.filter((r) => r.phase.trim());
    const { error: delErr } = await supabase.from("program_phases").delete().eq("program_id", program.id);
    let error = delErr;
    if (!error && clean.length) {
      const payload = clean.map((r, i) => ({
        program_id: program.id, client_id: clientId, phase: r.phase.trim(), order_index: i,
        week_start: r.week_start === "" ? null : parseInt(r.week_start), week_end: r.week_end === "" ? null : parseInt(r.week_end),
        note: r.note.trim() || null,
        objective: r.objective?.trim() || null, training_focus: r.training_focus?.trim() || null,
        movement_focus: r.movement_focus?.trim() || null, progression_strategy: r.progression_strategy?.trim() || null,
        exit_criteria: (r.exit_criteria || []).filter((c) => c.label.trim()),
      }));
      const { error: insErr } = await supabase.from("program_phases").insert(payload);
      error = insErr;
    }
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Roadmap saved." });
    if (!error) setRows(clean);
  };

  if (loading) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Program Roadmap</CardTitle>
      {!program ? (
        <div style={{ fontSize: 13, color: S.muted }}>No program yet. Generate or assign a program first, then plan its roadmap here.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 16, lineHeight: 1.6 }}>
            Define the sequence of phases for this client's program (e.g. Assessment, Phase 1 — Fat Loss, Phase 2 — Strength, Maintenance). The step matching the Current Phase above is highlighted; earlier steps show as complete.
          </div>
          {rows.map((r, i) => {
            const range = dateRangeForWeeks(program.start_date, r.week_start === "" ? null : parseInt(r.week_start), r.week_end === "" ? null : parseInt(r.week_end));
            return (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < rows.length - 1 ? "1px solid " + S.border : "none" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: S.muted, width: 18 }}>{i + 1}</span>
                  <input value={r.phase} onChange={(e) => updateRow(i, "phase", e.target.value)} placeholder="Phase name"
                    style={{ flex: "1 1 160px", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 13, outline: "none" }} />
                  <input type="number" value={r.week_start} onChange={(e) => updateRow(i, "week_start", e.target.value)} placeholder="Week start"
                    style={{ width: 90, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 13, outline: "none" }} />
                  <input type="number" value={r.week_end} onChange={(e) => updateRow(i, "week_end", e.target.value)} placeholder="Week end"
                    style={{ width: 90, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 13, outline: "none" }} />
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up" style={{ background: "none", border: "1px solid " + S.border, color: S.text, cursor: i === 0 ? "default" : "pointer", padding: "6px 9px", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down" style={{ background: "none", border: "1px solid " + S.border, color: S.text, cursor: i === rows.length - 1 ? "default" : "pointer", padding: "6px 9px", opacity: i === rows.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button onClick={() => setRows((r2) => r2.filter((_, j) => j !== i))} title="Remove" style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
                </div>
                {range && <div style={{ fontSize: 11, color: S.accent2, marginTop: 4, marginLeft: 26 }}>{range}</div>}
                <input value={r.note} onChange={(e) => updateRow(i, "note", e.target.value)} placeholder="Note for this phase (shown when the client or coach clicks it on the roadmap)"
                  style={{ width: "100%", marginTop: 6, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none" }} />
                <textarea value={r.objective} onChange={(e) => updateRow(i, "objective", e.target.value)} rows={2}
                  placeholder="Objective — what this phase is designed to accomplish (client sees this as &quot;Why We're Here&quot;)"
                  style={{ width: "100%", marginTop: 6, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none", resize: "vertical" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <input value={r.training_focus} onChange={(e) => updateRow(i, "training_focus", e.target.value)} placeholder="Training focus (e.g. Strength)"
                    style={{ flex: "1 1 140px", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none" }} />
                  <input value={r.movement_focus} onChange={(e) => updateRow(i, "movement_focus", e.target.value)} placeholder="Movement focus (e.g. Unilateral stability)"
                    style={{ flex: "1 1 140px", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none" }} />
                  <input value={r.progression_strategy} onChange={(e) => updateRow(i, "progression_strategy", e.target.value)} placeholder="Progression strategy (e.g. Double progression)"
                    style={{ flex: "1 1 140px", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none" }} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Phase Exit Criteria</div>
                  {(r.exit_criteria || []).map((c, ci) => (
                    <div key={ci} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <button type="button" onClick={() => {
                        const cycle = { incomplete: "complete", complete: "na", na: "incomplete" };
                        const next = (r.exit_criteria || []).map((x, xi) => xi === ci ? { ...x, status: cycle[x.status] } : x);
                        updateRow(i, "exit_criteria", next);
                      }} title="Cycle status" style={{ width: 26, height: 26, flexShrink: 0, background: "none", cursor: "pointer", fontWeight: 700,
                        border: "1px solid " + S.border, color: c.status === "complete" ? S.success : S.muted }}>
                        {c.status === "complete" ? "✓" : c.status === "na" ? "–" : "○"}
                      </button>
                      <input value={c.label} onChange={(e) => {
                        const next = (r.exit_criteria || []).map((x, xi) => xi === ci ? { ...x, label: e.target.value } : x);
                        updateRow(i, "exit_criteria", next);
                      }} placeholder="e.g. Bench 205 lb x 5 reps"
                        style={{ flex: 1, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "6px 10px", fontSize: 12, outline: "none" }} />
                      <button type="button" onClick={() => updateRow(i, "exit_criteria", (r.exit_criteria || []).filter((_, xi) => xi !== ci))}
                        style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => updateRow(i, "exit_criteria", [...(r.exit_criteria || []), blankExitCriterion()])}
                    style={{ background: "none", border: "1px solid " + S.border, color: S.text, padding: "5px 10px", fontSize: 10, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", letterSpacing: "1px" }}>
                    + Add Criterion
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={() => setRows((r) => [...r, blankRoadmapRow()])}
            style={{ background: "none", border: "1px solid " + S.border, color: S.text, padding: "8px 14px", fontSize: 10, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", letterSpacing: "1px", marginTop: 4 }}>
            + Add Phase
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
            <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Roadmap"}</Btn>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</span>}
          </div>
          {rows.length > 0 && (
            <div style={{ marginTop: 22, borderTop: "1px solid " + S.border, paddingTop: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 10 }}>Preview</div>
              <ProgramRoadmap forCoach phases={rows.filter((r) => r.phase.trim()).map((r) => ({
                phase: r.phase, week_start: r.week_start === "" ? null : r.week_start, week_end: r.week_end === "" ? null : r.week_end,
                note: r.note, objective: r.objective, training_focus: r.training_focus, movement_focus: r.movement_focus,
                progression_strategy: r.progression_strategy, exit_criteria: r.exit_criteria,
              }))} currentPhase={program.phase} startDate={program.start_date} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
