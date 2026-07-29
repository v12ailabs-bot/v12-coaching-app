import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, Fld, RG, Inp, SectionHeader, Alert, EmptyState } from "../../../components/ui/index.js";
import { DAY_ORDER, PHASES, phaseRankOf, BLOCK_TYPE_SHORT } from "../../../lib/constants.js";

// Coach-only API routes verify this Bearer token server-side (see api/_lib/auth.js).
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` };
}

// Append-only Program Phase log — every phase change is a new row, never an
// update, so the history in program_phase_history can't silently disappear.
async function logPhaseHistory({ programId, clientId, phase, phaseNote, changedBy }) {
  if (!phase) return;
  await supabase.from("program_phase_history").insert({
    program_id: programId ?? null, client_id: clientId, phase, phase_note: phaseNote ?? null, changed_by: changedBy ?? null,
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
// its permanent (append-only) change history. `client` (needs `.email`) is
// only required for "Advance to Next Phase" — "Save Phase" works without it.
export function ProgramPhase({ clientId, client }) {
  const [program, setProgram] = useState(null);
  const [phase, setPhase] = useState("");
  const [note, setNote] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data }, { data: hist }] = await Promise.all([
      supabase.from("programs").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("program_phase_history").select("*").eq("client_id", clientId).order("changed_at", { ascending: false }).limit(20),
    ]);
    setProgram(data || null);
    setPhase(data?.phase || "");
    setNote(data?.phase_note || "");
    setWeekStart(data?.phase_week_start ?? "");
    setWeekEnd(data?.phase_week_end ?? "");
    setHistory(hist || []);
    setLoading(false);
  }, [clientId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  // Manual, non-generative correction — updates the phase label/week-range/note
  // only. No AI call, no exercise changes. Use "Advance to Next Phase" below
  // to actually regenerate the training plan for a phase transition.
  const save = async () => {
    if (!program || !phase) return;
    setSaving(true); setMsg(null);
    const trimmedNote = note.trim() || null;
    const weekStartVal = weekStart === "" ? null : parseInt(weekStart, 10);
    const weekEndVal = weekEnd === "" ? null : parseInt(weekEnd, 10);
    const { error } = await supabase.from("programs")
      .update({ phase, phase_note: trimmedNote, phase_week_start: weekStartVal, phase_week_end: weekEndVal, phase_updated_at: new Date().toISOString() })
      .eq("id", program.id);
    if (!error) await logPhaseHistory({ programId: program.id, clientId, phase, phaseNote: trimmedNote });
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Phase updated." });
    if (!error) {
      // Reflect the save optimistically instead of calling load() — a full
      // refetch here would race any typing the coach does into the Phase
      // Note textarea right after clicking Save and wipe it out. `phase`/
      // `note` already hold what was just saved, so only `program` (for the
      // "phase set" timestamp) and the append-only history log need refreshing.
      setProgram((p) => (p ? { ...p, phase, phase_note: trimmedNote, phase_week_start: weekStartVal, phase_week_end: weekEndVal, phase_updated_at: new Date().toISOString() } : p));
      const { data: hist } = await supabase.from("program_phase_history").select("*").eq("client_id", clientId).order("changed_at", { ascending: false }).limit(20);
      setHistory(hist || []);
    }
  };

  // Regenerates the training plan for the selected phase via /api/advance-phase
  // — unlike "Save Phase" (metadata only), this calls Claude and replaces the
  // client's AI-generated exercises (preserving any with logged history).
  // Same pre-flight confirm pattern as ClientDetailPage's generateProgram().
  const advance = async () => {
    if (!client?.email || !phase) return;
    const { data: aiEx } = await supabase.from("exercises").select("id,name,day_of_week").eq("client_id", clientId).eq("source", "ai");
    const aiIds = (aiEx || []).map((e) => e.id);
    if (aiIds.length) {
      const { data: logged } = await supabase.from("workout_logs").select("exercise_id").in("exercise_id", aiIds);
      const loggedIds = new Set((logged || []).map((l) => l.exercise_id));
      const keepers = (aiEx || []).filter((e) => loggedIds.has(e.id));
      if (keepers.length) {
        const list = keepers.map((e) => `${e.name}${e.day_of_week ? ` (${e.day_of_week})` : ""}`).join("\n");
        if (!window.confirm(`These ${keepers.length} exercise${keepers.length > 1 ? "s" : ""} already have logged history and will be kept exactly as-is — the AI will design the rest of the ${phase} phase around them:\n\n${list}\n\nContinue?`)) return;
      }
    }
    if (!window.confirm(`Advance to ${phase}? This regenerates the training plan for this phase.`)) return;
    setAdvancing(true); setMsg(null);
    try {
      const r = await fetch("/api/advance-phase", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          client_email: client.email,
          phase,
          phase_note: note.trim() || undefined,
          week_start: weekStart === "" ? undefined : parseInt(weekStart, 10),
          week_end: weekEnd === "" ? undefined : parseInt(weekEnd, 10),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
      setMsg({
        ok: true,
        text: `Advanced to ${data.phase} — ${data.exercises_created} exercises${data.exercises_preserved ? ` · kept ${data.exercises_preserved} with logged history` : ""}${data.upgrades_applied ? ` · applied ${data.upgrades_applied} exercise upgrade${data.upgrades_applied > 1 ? "s" : ""}` : ""}.`,
      });
      await createProgramVersion(clientId, `Advanced to ${data.phase}`);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setAdvancing(false);
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
          <Fld label="Current Phase / Block"><RG options={PHASES} value={phase} onChange={setPhase} /></Fld>
          <div style={{ display: "flex", gap: 12 }}>
            <Fld label="Week Start"><Inp type="number" min="1" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} placeholder="e.g. 1" /></Fld>
            <Fld label="Week End"><Inp type="number" min="1" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} placeholder="e.g. 4" /></Fld>
          </div>
          <Fld label="Phase Note (what's the focus right now?)">
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Week 3 of accumulation — push volume on the lower body, hold loads on upper."
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical" }} />
          </Fld>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
            <Btn onClick={save} disabled={saving || advancing || !phase}>{saving ? "Saving..." : "Save Phase"}</Btn>
            <Btn teal onClick={advance} disabled={saving || advancing || !phase || !client?.email}>{advancing ? "Advancing..." : "Advance to Next Phase"}</Btn>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : "#ff6b5b" }}>{msg.text}</span>}
          </div>
          <div style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>"Save Phase" updates the label/week-range/note only. "Advance to Next Phase" regenerates the training plan for the selected phase.</div>
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
                    {(h.week_start || h.week_end) && <span style={{ color: S.muted }}>(weeks {h.week_start ?? "?"}-{h.week_end ?? "?"})</span>}
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
