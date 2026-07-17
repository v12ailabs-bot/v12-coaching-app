import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, Fld, RG, SectionHeader, Alert, EmptyState } from "../../../components/ui/index.js";
import { DAY_ORDER, PHASES } from "../../../lib/constants.js";

// Capture the client's current training plan (program metadata + exercises) as a
// new immutable version. Returns {error, version}.
export async function createProgramVersion(clientId, label) {
  const { data: program } = await supabase.from("programs").select("*")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: exs } = await supabase.from("exercises").select("*").eq("client_id", clientId).order("order_index");
  const { data: last } = await supabase.from("program_versions").select("version")
    .eq("client_id", clientId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version || 0) + 1;
  const snapshot = {
    program: program ? { name: program.name, goal: program.goal, phase: program.phase, phase_note: program.phase_note } : null,
    exercises: (exs || []).map((e) => ({
      name: e.name, category: e.category, day_of_week: e.day_of_week, sets: e.sets,
      reps: e.reps, is_bodyweight: e.is_bodyweight, notes: e.notes, order_index: e.order_index, source: e.source,
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
      category: t.category ?? null, day_of_week: t.day_of_week ?? null, sets: t.sets ?? null,
      reps: t.reps ?? null, is_bodyweight: !!t.is_bodyweight, notes: t.notes ?? null,
      order_index: t.order_index ?? 0, source: t.source || "coach",
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
    if (latest) await supabase.from("programs").update({ phase: prog.phase ?? null, phase_note: prog.phase_note ?? null, phase_updated_at: new Date().toISOString() }).eq("id", latest.id);
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
                      <td style={{ padding: "6px 10px", fontSize: 12, borderBottom: "1px solid " + S.border }}>{e.name}</td>
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

// Program phase / block adjustment for the client's most recent program.
export function ProgramPhase({ clientId }) {
  const [program, setProgram] = useState(null);
  const [phase, setPhase] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("programs").select("*").eq("client_id", clientId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setProgram(data || null);
    setPhase(data?.phase || "");
    setNote(data?.phase_note || "");
    setLoading(false);
  }, [clientId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const save = async () => {
    if (!program) return;
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("programs")
      .update({ phase: phase || null, phase_note: note.trim() || null, phase_updated_at: new Date().toISOString() })
      .eq("id", program.id);
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Phase updated." });
    if (!error) load();
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
          <Fld label="Phase Note (what's the focus right now?)">
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Week 3 of accumulation — push volume on the lower body, hold loads on upper."
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical" }} />
          </Fld>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Phase"}</Btn>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : "#ff6b5b" }}>{msg.text}</span>}
          </div>
        </>
      )}
    </Card>
  );
}
