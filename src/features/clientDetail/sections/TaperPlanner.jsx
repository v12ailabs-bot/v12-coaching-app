import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Card, CardTitle, Btn, Modal, StatusBadge } from "../../../components/ui/index.js";
import { planTaper, taperPhase, TAPER_TEMPLATE } from "../../../lib/progression/taper.js";
import { buildTaperConfig, defaultReferencePeriod } from "../../../lib/progression/taperForm.js";
import { loadTaperLogs, createTaperPlan, fetchTaperPlans, overrideTaper, taperWatch } from "../../../lib/progression/data.js";
import { todayStr } from "../../../lib/dates.js";

// Performance taper (coach). Create a taper from the engine's validated inputs,
// preview exactly what it will plan BEFORE saving, then manage it: see the
// session-by-session volumes, readiness/pain flags, and override any session
// (with a required note) — the original calculation is never changed; overrides
// are an append-only log. Volume only: intensity and exercises are shown as you
// configured them. Nothing here touches the client's workouts.
const input = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "7px 9px", fontSize: 13, outline: "none", borderRadius: RADIUS.md };
const lbl = { fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 3px", display: "block" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PHASE_LABEL = { before: ["Upcoming", "neutral"], active: ["In taper", "amber"], event_day: ["Event day", "green"], ended: ["Ended", "neutral"] };
const fmtN = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1));

function Field({ label, children, hint }) {
  return <div><span style={lbl}>{label}</span>{children}{hint && <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{hint}</div>}</div>;
}

function PlanSummary({ plan }) {
  if (!plan || plan.status !== "prescription") return null;
  const names = Object.keys(plan.exercises || {});
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 10 }}>
        {[["Window", `${plan.window.start} → ${plan.window.end}`], ["Event", plan.window.eventDate], ["Baseline / week", `${fmtN(plan.baseline.weeklyVolume)} ${plan.unit}`], ["Target (−" + plan.reductionPct + "%)", `${fmtN(plan.targetVolume)} ${plan.unit}`], ["Planned total", `${plan.plannedVolume} ${plan.unit}`], ["Sessions", `${plan.frequency.sessions} (${fmtN(plan.frequency.taperPerWeek)}/wk vs ${fmtN(plan.frequency.baselinePerWeek)}/wk now)`]].map(([k, v]) => (
          <div key={k} style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      {plan.intensity && <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>Intensity (as you set it, unchanged): {plan.intensity.default ? `${plan.intensity.default.min}–${plan.intensity.default.max} ${plan.intensity.default.type}` : "per exercise"}</div>}
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Sessions</div>
      {plan.sessions.map((s) => (
        <div key={s.date} style={{ padding: "6px 0", borderBottom: "1px solid " + S.border, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span><b>{s.weekday}</b> {s.date}{s.overridden ? <span style={{ color: S.accent }}> · overridden</span> : null}</span><b>{s.total} {plan.unit}</b></div>
          {names.length > 1 && <div style={{ color: S.muted, marginTop: 2 }}>{names.filter((n) => s.volumeByExercise[n]).map((n) => `${n} ${s.volumeByExercise[n]}`).join(" · ")}</div>}
        </div>
      ))}
      {(plan.warnings || []).map((w, i) => <div key={i} style={{ fontSize: 12, color: S.warning, marginTop: 6 }}>⚠ {w}</div>)}
    </div>
  );
}

function CreateModal({ clientId, onClose, onCreated }) {
  const [f, setF] = useState({
    name: "", eventDate: "", durationDays: "10", reductionPct: "40", volumeUnit: "sets", refStart: "", refEnd: "", sessionWeekdays: ["Mon", "Wed", "Fri"],
    distribution: "flat", roundTo: "", maxSessionVolumePct: "", lastSessionDaysBeforeEvent: "", exercises: [], eventSpecificReductionPct: "", generalReductionPct: "",
    intensityType: "", intensityMin: "", intensityMax: "", readinessField: "", readinessMin: "", readinessDays: "", performanceDropPct: "",
  });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPreview(null); };

  useEffect(() => { // list the client's exercises so event-specific ones can be tagged
    supabase.from("exercises").select("name").eq("client_id", clientId).is("retired_at", null).then(({ data }) => {
      const names = [...new Set((data || []).map((e) => e.name))].sort();
      setF((x) => ({ ...x, exercises: names.map((n) => ({ name: n, role: "" })) }));
    });
  }, [clientId]);

  const suggestRef = () => {
    const r = defaultReferencePeriod(f.eventDate, parseInt(f.durationDays, 10));
    if (r) setF((x) => ({ ...x, refStart: r.start, refEnd: r.end }));
    setPreview(null);
  };
  const toggleDay = (d) => set("sessionWeekdays", f.sessionWeekdays.includes(d) ? f.sessionWeekdays.filter((x) => x !== d) : [...f.sessionWeekdays, d]);
  const setRole = (name, role) => set("exercises", f.exercises.map((e) => (e.name === name ? { ...e, role } : e)));

  const calculate = async () => {
    setBusy(true); setErr(null);
    const config = buildTaperConfig(f);
    const logs = await loadTaperLogs(clientId, f.refStart && f.refEnd ? { start: f.refStart, end: f.refEnd } : null);
    // loadTaperLogs wants Date-or-string; planTaper validates and normalizes the real inputs.
    setPreview(planTaper({ config, logs }));
    setBusy(false);
  };
  const create = async () => {
    setBusy(true); setErr(null);
    const { data: { user } } = await supabase.auth.getUser();
    const res = await createTaperPlan({ clientId, name: f.name.trim() || `Taper for ${f.eventDate}`, config: buildTaperConfig(f), coachId: user?.id });
    setBusy(false);
    if (!res.ok) { setErr(res.error || (res.plan?.errors || res.plan?.reasons || ["Could not create the taper."]).join(" ")); return; }
    onCreated(res.row);
  };

  const ok = preview?.status === "prescription";
  return (
    <Modal title="New performance taper" onClose={onClose} width={760}>
      <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.6 }}>
        A taper reduces <b>volume</b> over a window ending at an event or test. Intensity and exercise selection stay as you set them. The suggested {TAPER_TEMPLATE.suggestedDurationDays.join("–")} day / {TAPER_TEMPLATE.suggestedReductionPct.join("–")}% values are starting points for a strength event — you decide for this athlete.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Field label="Name"><input style={input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Spring meet taper" /></Field>
        <Field label="Event / test date"><input style={input} type="date" value={f.eventDate} onChange={(e) => set("eventDate", e.target.value)} /></Field>
        <Field label="Taper length (days)" hint="Runs up to the day before the event."><input style={input} type="number" min="1" max="60" value={f.durationDays} onChange={(e) => set("durationDays", e.target.value)} /></Field>
        <Field label="Volume reduction (%)"><input style={input} type="number" min="0" max="99" value={f.reductionPct} onChange={(e) => set("reductionPct", e.target.value)} /></Field>
        <Field label="Measure volume in">
          <select style={input} value={f.volumeUnit} onChange={(e) => set("volumeUnit", e.target.value)}>
            <option value="sets">Working sets</option><option value="reps">Reps</option><option value="volume_load">Volume load (reps × lb)</option>
          </select>
        </Field>
      </div>

      <span style={lbl}>Reference period for the baseline (the training you're tapering from)</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <input style={input} type="date" value={f.refStart} onChange={(e) => set("refStart", e.target.value)} />
        <input style={input} type="date" value={f.refEnd} onChange={(e) => set("refEnd", e.target.value)} />
        <Btn sm onClick={suggestRef} disabled={!f.eventDate}>Suggest 2 weeks</Btn>
      </div>
      <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>At least 7 days, ending before the taper starts, with logged working sets. Nothing is estimated if there's no data.</div>

      <span style={lbl}>Taper training days</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {WEEKDAYS.map((d) => <button key={d} type="button" onClick={() => toggleDay(d)} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer", border: "1px solid " + (f.sessionWeekdays.includes(d) ? S.accent : S.border), background: f.sessionWeekdays.includes(d) ? "rgba(255,106,0,.14)" : "transparent", color: f.sessionWeekdays.includes(d) ? S.accent : S.text }}>{d}</button>)}
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: S.muted }}>More options: distribution, limits, event-specific lifts, intensity, readiness rules</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 8 }}>
          <Field label="Spread volume"><select style={input} value={f.distribution} onChange={(e) => set("distribution", e.target.value)}><option value="flat">Evenly</option><option value="linear_decrease">Heavier early, lighter late</option></select></Field>
          <Field label="Round session volume to" hint="Default 1."><input style={input} type="number" value={f.roundTo} onChange={(e) => set("roundTo", e.target.value)} /></Field>
          <Field label="Max per session (% of baseline)" hint="Default 100."><input style={input} type="number" value={f.maxSessionVolumePct} onChange={(e) => set("maxSessionVolumePct", e.target.value)} /></Field>
          <Field label="Rest days before the event" hint="Default 0 (no assumption)."><input style={input} type="number" min="0" value={f.lastSessionDaysBeforeEvent} onChange={(e) => set("lastSessionDaysBeforeEvent", e.target.value)} /></Field>
          <Field label="Event-specific lifts reduce by (%)" hint="Blank = same as the main %."><input style={input} type="number" value={f.eventSpecificReductionPct} onChange={(e) => set("eventSpecificReductionPct", e.target.value)} /></Field>
          <Field label="Other lifts reduce by (%)"><input style={input} type="number" value={f.generalReductionPct} onChange={(e) => set("generalReductionPct", e.target.value)} /></Field>
        </div>
        {f.exercises.length > 0 && (
          <>
            <span style={lbl}>Which lifts are event-specific? (leave the rest as normal)</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {f.exercises.map((e) => <button key={e.name} type="button" onClick={() => setRole(e.name, e.role === "event_specific" ? "" : "event_specific")} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 20, cursor: "pointer", border: "1px solid " + (e.role ? S.accent : S.border), background: e.role ? "rgba(255,106,0,.14)" : "transparent", color: e.role ? S.accent : S.text }}>{e.name}</button>)}
            </div>
          </>
        )}
        <span style={lbl}>Intensity to hold during the taper (shown, never changed by the engine)</span>
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr", gap: 10 }}>
          <select style={input} value={f.intensityType} onChange={(e) => set("intensityType", e.target.value)}><option value="">Not set</option><option value="pct1rm">% of 1RM</option><option value="load_lb">Load (lb)</option><option value="rpe">RPE</option></select>
          <input style={input} type="number" placeholder="min" value={f.intensityMin} onChange={(e) => set("intensityMin", e.target.value)} />
          <input style={input} type="number" placeholder="max" value={f.intensityMax} onChange={(e) => set("intensityMax", e.target.value)} />
        </div>
        <span style={lbl}>Coach-review flags (only from data that exists)</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <select style={input} value={f.readinessField} onChange={(e) => set("readinessField", e.target.value)}><option value="">No readiness rule</option><option value="energy">Energy</option><option value="sleep">Sleep</option><option value="mood">Mood</option></select>
          {f.readinessField && <input style={input} type="number" placeholder="flag if below" value={f.readinessMin} onChange={(e) => set("readinessMin", e.target.value)} />}
          {f.readinessField && <input style={input} type="number" placeholder="…this many days in a row" value={f.readinessDays} onChange={(e) => set("readinessDays", e.target.value)} />}
          <input style={input} type="number" placeholder="Flag if performance drops by %" value={f.performanceDropPct} onChange={(e) => set("performanceDropPct", e.target.value)} />
        </div>
      </details>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <Btn onClick={calculate} disabled={busy}>{busy ? "Calculating..." : "Calculate preview"}</Btn>
        {ok && <Btn teal onClick={create} disabled={busy}>Create taper plan</Btn>}
      </div>
      {err && <div style={{ fontSize: 12, color: S.danger, marginTop: 8 }}>{err}</div>}
      {preview && !ok && (
        <div style={{ border: "1px solid " + (preview.status === "invalid" ? S.danger : S.warning), borderRadius: RADIUS.md, padding: "8px 12px", marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: preview.status === "invalid" ? S.danger : S.warning, marginBottom: 4 }}>{preview.status === "invalid" ? "Fix these" : "Not enough data"}</div>
          {(preview.errors?.length ? preview.errors : preview.reasons || []).map((m, i) => <div key={i} style={{ fontSize: 12 }}>• {m}</div>)}
        </div>
      )}
      {ok && (<><div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginTop: 14 }}>Preview — nothing saved yet</div><PlanSummary plan={preview} />{preview.reasons.map((r, i) => <div key={i} style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>{r}</div>)}</>)}
    </Modal>
  );
}

function DetailModal({ row: initial, onClose, onChanged }) {
  const [row, setRow] = useState(initial);
  const [watch, setWatch] = useState(null);
  const [ovDate, setOvDate] = useState("");
  const [ovVals, setOvVals] = useState({});
  const [ovNote, setOvNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const plan = row.current_plan;
  const names = Object.keys(plan.exercises || {});

  useEffect(() => { taperWatch(row).then(setWatch); }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickDate = (d) => { setOvDate(d); const s = plan.sessions.find((x) => x.date === d); setOvVals(s ? { ...s.volumeByExercise } : {}); setMsg(null); };

  const saveOverride = async () => {
    setBusy(true); setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    const patch = Object.fromEntries(Object.entries(ovVals).map(([k, v]) => [k, v === "" ? NaN : Number(v)]));
    const r = await overrideTaper(row, { date: ovDate, volumeByExercise: patch, note: ovNote }, user?.id);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: (r.errors || ["Could not save."]).join(" ") }); return; }
    const next = { ...row, current_plan: r.plan, override_log: r.log };
    setRow(next); onChanged(next); setOvDate(""); setOvNote(""); setMsg({ ok: true, text: "Override saved and logged. The original calculation is unchanged." });
  };
  const setStatus = async (status) => {
    const { error } = await supabase.from("taper_plans").update({ status }).eq("id", row.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    const next = { ...row, status }; setRow(next); onChanged(next);
  };

  const phase = taperPhase(plan, todayStr());
  return (
    <Modal title={row.name} onClose={onClose} width={780}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        {phase && <StatusBadge label={PHASE_LABEL[phase][0]} tone={PHASE_LABEL[phase][1]} />}
        <StatusBadge label={row.status} tone={row.status === "cancelled" ? "red" : row.status === "completed" ? "green" : "neutral"} />
        <span style={{ fontSize: 12, color: S.muted }}>Event {row.event_date}. The taper ends the day before and is never restarted or extended automatically.</span>
      </div>
      <PlanSummary plan={plan} />

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Review flags</div>
        {!watch ? <div style={{ fontSize: 12, color: S.muted }}>Checking…</div> : (
          <>
            {watch.flags.length === 0 ? <div style={{ fontSize: 12, color: S.success }}>No flags from the data available.</div> : watch.flags.map((fl, i) => <div key={i} style={{ fontSize: 12, color: S.danger }}>⚑ {fl.reason}</div>)}
            {watch.unavailable.map((u, i) => <div key={i} style={{ fontSize: 11, color: S.muted }}>· {u}</div>)}
          </>
        )}
      </div>

      <div style={{ marginTop: 16, border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Override a session</div>
        <select style={input} value={ovDate} onChange={(e) => pickDate(e.target.value)}>
          <option value="">Choose a session…</option>{plan.sessions.map((s) => <option key={s.date} value={s.date}>{s.weekday} {s.date} ({s.total})</option>)}
        </select>
        {ovDate && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
              {names.map((n) => <Field key={n} label={n}><input style={input} type="number" min="0" value={ovVals[n] ?? ""} onChange={(e) => setOvVals((v) => ({ ...v, [n]: e.target.value }))} /></Field>)}
            </div>
            <Field label="Why (required)"><input style={input} value={ovNote} onChange={(e) => setOvNote(e.target.value)} placeholder="e.g. athlete reported a sore elbow" /></Field>
            <div style={{ marginTop: 8 }}><Btn sm onClick={saveOverride} disabled={busy || !ovNote.trim()}>{busy ? "Saving..." : "Save override"}</Btn></div>
          </>
        )}
        {msg && <div style={{ fontSize: 12, color: msg.ok ? S.accent2 : S.danger, marginTop: 8 }}>{msg.text}</div>}
        {(row.override_log || []).length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Override history (cannot be edited)</div>
            {row.override_log.map((o, i) => <div key={i} style={{ fontSize: 12, padding: "4px 0", borderTop: "1px solid " + S.border }}>{new Date(o.at).toLocaleString()} · {o.date}: {o.before.total} → <b>{o.after.total}</b> — “{o.note}”</div>)}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: S.muted }}>Mark as:</span>
        {["planned", "active", "completed", "cancelled"].filter((s) => s !== row.status).map((s) => <Btn key={s} sm onClick={() => setStatus(s)}>{s}</Btn>)}
      </div>
    </Modal>
  );
}

export function TaperPlanner({ clientId }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => { setPlans(await fetchTaperPlans(clientId)); setLoading(false); }, [clientId]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CardTitle style={{ marginBottom: 0 }}>Performance Taper</CardTitle>
        <Btn sm teal onClick={() => setCreating(true)}>New taper</Btn>
      </div>
      {loading ? null : plans.length === 0 ? (
        <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6 }}>No taper planned. Use this to cut volume before a meet or test while holding intensity — you set the event, the reduction and the baseline period; the plan is calculated from this client's logged training.</div>
      ) : plans.map((p) => {
        const ph = taperPhase(p.current_plan, todayStr());
        return (
          <div key={p.id} onClick={() => setOpen(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid " + S.border, cursor: "pointer" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: S.muted }}>Event {p.event_date} · {p.current_plan?.window?.durationDays} days · −{p.current_plan?.reductionPct}% · {p.current_plan?.plannedVolume} {p.current_plan?.unit}{(p.override_log || []).length ? ` · ${p.override_log.length} override${p.override_log.length > 1 ? "s" : ""}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>{ph && <StatusBadge label={PHASE_LABEL[ph][0]} tone={PHASE_LABEL[ph][1]} />}<StatusBadge label={p.status} tone="neutral" /></div>
          </div>
        );
      })}
      {creating && <CreateModal clientId={clientId} onClose={() => setCreating(false)} onCreated={(row) => { setCreating(false); setPlans((l) => [row, ...l]); setOpen(row); }} />}
      {open && <DetailModal row={open} onClose={() => setOpen(null)} onChanged={(row) => setPlans((l) => l.map((x) => (x.id === row.id ? row : x)))} />}
    </Card>
  );
}
