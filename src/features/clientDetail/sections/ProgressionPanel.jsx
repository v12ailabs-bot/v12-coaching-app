import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Btn, StatusBadge } from "../../../components/ui/index.js";
import { METHODS } from "../../../lib/progression/methods.js";
import { workingSets, latestSessionRows } from "../../../lib/progression/engine.js";
import { recommendForExercise, fetchRecommendations, decide } from "../../../lib/progression/data.js";

// Coach-side progression panel for one exercise: assign a method + its
// parameters, run the deterministic engine on the latest logged session, and
// approve / edit / reject the result. Everything calculated comes from
// src/lib/progression (no AI arithmetic); reference-only methods show what is
// missing and offer no calculation. Approving records the coach's prescription
// in progression_recommendations — it does not change the client's workout
// (exercises has no prescribed-load field), so nothing reaches the client
// without a later, explicit step.

const input = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "6px 8px", fontSize: 12, outline: "none", borderRadius: RADIUS.md, width: "100%" };
const lbl = { fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3, display: "block" };
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const STATUS_TONE = { progress: "green", regression: "red", non_comparable: "neutral", increase: "green", decrease: "amber", hold: "amber", prescription: "green", insufficient_data: "amber", invalid: "red", reference_only: "neutral" };
const STATUS_LABEL = { progress: "Progress", regression: "Regression", non_comparable: "Not comparable", increase: "Increase", decrease: "Decrease", hold: "Hold", prescription: "Prescription", insufficient_data: "Insufficient data", invalid: "Invalid", reference_only: "Reference only" };

function ConfigForm({ methodId, config, onChange }) {
  const set = (k, v) => onChange({ ...config, [k]: v });
  const field = (k, label, props = {}) => (
    <div><label style={lbl}>{label}</label><input style={input} type="number" step="any" value={config[k] ?? ""} onChange={(e) => set(k, numOrNull(e.target.value))} {...props} /></div>
  );
  const isApre = methodId.startsWith("apre_");
  const isDensity = methodId === "density_progression";
  const effort = config.effort || { metric: "", required: false, max: null };
  const setEffort = (patch) => {
    const next = { ...effort, ...patch };
    onChange({ ...config, effort: next.metric ? next : undefined });
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
        {methodId === "double_progression" && <>{field("repMin", "Rep min")}{field("repMax", "Rep max")}</>}
        {methodId === "linear_progression" && field("targetReps", "Target reps")}
        {!isApre && !isDensity && methodId !== "percentage_based" && field("requiredSets", "Working sets")}
        {isApre && (
          <div>
            <label style={lbl}>Change within published range</label>
            <select style={input} value={config.stepMode || "low"} onChange={(e) => set("stepMode", e.target.value)}>
              <option value="low">Low (smaller change)</option><option value="mid">Middle</option><option value="high">High (larger change)</option>
            </select>
          </div>
        )}
        {methodId === "percentage_based" && field("percent", "% of 1RM")}
        {!isDensity && field("increment", "Increment (lb)")}
        {!isDensity && <div>
          <label style={lbl}>Equipment (default increment)</label>
          <select style={input} value={config.equipment || ""} onChange={(e) => set("equipment", e.target.value || undefined)}>
            <option value="">—</option>{["barbell", "dumbbell", "machine", "cable", "kettlebell", "other"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>}
      </div>
      {isDensity && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            <div><label style={lbl}>Mode</label>
              <select style={input} value={config.mode || ""} onChange={(e) => set("mode", e.target.value || undefined)}>
                <option value="">Choose…</option><option value="fixed_time">Fixed time — more work</option><option value="fixed_work">Fixed work — less time</option><option value="fixed_interval">Fixed intervals — more output</option>
              </select></div>
            <div><label style={lbl}>Work unit</label>
              <select style={input} value={config.unit || ""} onChange={(e) => set("unit", e.target.value || undefined)}>
                <option value="">Choose…</option><option value="reps">Reps</option><option value="rounds">Rounds</option><option value="volume_load">Volume load (reps × lb)</option><option value="reps_at_load">Reps at a set load</option>
              </select></div>
            {config.unit === "rounds" && field("repsPerRound", "Reps per round")}
            {config.unit === "reps_at_load" && field("load", "Prescribed load (lb)")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            {config.mode === "fixed_time" && <>{field("timeCapSec", "Time cap (sec)")}{field("minImprovement", "Min improvement (work)")}{field("increment", "Increase target by")}{field("maxTarget", "Max target")}</>}
            {config.mode === "fixed_work" && <>{field("workAmount", "Prescribed work")}{field("minImprovementSec", "Min faster (sec)")}{field("timeStepSec", "Cut target by (sec)")}{field("minTimeSec", "Fastest target (sec)")}{field("restSec", "Prescribed rest (sec)")}</>}
            {config.mode === "fixed_interval" && <>{field("workSec", "Work (sec)")}{field("restSec", "Rest (sec)")}{field("rounds", "Rounds")}{field("minImprovement", "Min improvement (output)")}{field("increment", "Increase target by")}{field("maxTarget", "Max target")}</>}
            {field("regressionTolerance", "Regression tolerance")}
            {field("regressionFlagAfter", "Flag me after N regressions")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, alignItems: "end" }}>
            <div><label style={lbl}>Readiness rule</label>
              <select style={input} value={config.readiness?.field || ""} onChange={(e) => onChange({ ...config, readiness: e.target.value ? { field: e.target.value, min: config.readiness?.min ?? 5, required: !!config.readiness?.required } : undefined })}>
                <option value="">None</option><option value="energy">Energy</option><option value="sleep">Sleep</option><option value="mood">Mood</option>
              </select></div>
            {config.readiness && <div><label style={lbl}>Minimum value</label><input style={input} type="number" step="any" value={config.readiness.min ?? ""} onChange={(e) => onChange({ ...config, readiness: { ...config.readiness, min: numOrNull(e.target.value) } })} /></div>}
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!config.requirePainCheck} onChange={(e) => set("requirePainCheck", e.target.checked || undefined)} />Require a pain check</label>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!config.includeWarmup} onChange={(e) => set("includeWarmup", e.target.checked || undefined)} />Count warm-up sets</label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <div><label style={lbl}>Prescription effective from</label><input style={input} type="date" value={config.effectiveFrom || ""} onChange={(e) => set("effectiveFrom", e.target.value || undefined)} /></div>
            <div><label style={lbl}>Fixed baseline date (optional)</label><input style={input} type="date" value={config.baselineDate || ""} onChange={(e) => set("baselineDate", e.target.value || undefined)} /></div>
          </div>
        </div>
      )}
      {methodId !== "percentage_based" && !isApre && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, alignItems: "end" }}>
          <div>
            <label style={lbl}>Effort rule</label>
            <select style={input} value={effort.metric || ""} onChange={(e) => setEffort({ metric: e.target.value })}>
              <option value="">None</option><option value="rir">RIR</option><option value="rpe">RPE</option>
            </select>
          </div>
          {effort.metric && <>
            <div><label style={lbl}>Max allowed</label><input style={input} type="number" step="any" value={effort.max ?? ""} onChange={(e) => setEffort({ max: numOrNull(e.target.value) })} /></div>
            <label style={{ fontSize: 12, color: S.text, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!effort.required} onChange={(e) => setEffort({ required: e.target.checked })} />Required on every set</label>
          </>}
          <label style={{ fontSize: 12, color: S.text, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={!!config.technique?.required} onChange={(e) => onChange({ ...config, technique: e.target.checked ? { required: true } : undefined })} />Coach confirms technique
          </label>
        </div>
      )}
    </div>
  );
}

export function ProgressionPanel({ exercise, clientId, logs }) {
  const [methodId, setMethodId] = useState(exercise.progression_method || "");
  const [config, setConfig] = useState(exercise.progression_config || {});
  const [savedAs, setSavedAs] = useState({ methodId: exercise.progression_method || "", config: exercise.progression_config || {} });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [recs, setRecs] = useState([]);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [currentLoad, setCurrentLoad] = useState("");
  const [oneRepMax, setOneRepMax] = useState("");
  const [week, setWeek] = useState("");
  const [techniqueOk, setTechniqueOk] = useState(false);
  const [painAns, setPainAns] = useState(""); // "" = not asked, "no", "yes"
  const [editLoad, setEditLoad] = useState({});
  // The client's current target for this exercise (set by approving a recommendation).
  const [target, setTarget] = useState(exercise.prescribed_weight ? { weight: exercise.prescribed_weight, at: exercise.prescribed_set_at } : null);
  const clearTarget = async () => {
    if (!window.confirm("Remove the target weight the client sees for this exercise?")) return;
    const { error } = await supabase.from("exercises").update({ prescribed_weight: null, prescribed_set_at: null, prescribed_recommendation_id: null }).eq("id", exercise.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    exercise.prescribed_weight = null; setTarget(null); setMsg({ ok: true, text: "Target removed." });
  };

  const method = methodId ? METHODS[methodId] : null;
  const dirty = methodId !== savedAs.methodId || JSON.stringify(config) !== JSON.stringify(savedAs.config);

  // Default the current load to the heaviest working load of the latest session.
  useEffect(() => {
    const { sets } = workingSets(latestSessionRows(logs).rows);
    const loads = sets.map((s) => s.load).filter((v) => v != null);
    if (loads.length && currentLoad === "") setCurrentLoad(String(Math.max(...loads)));
  }, [logs]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecs = useCallback(async () => setRecs(await fetchRecommendations(exercise.id)), [exercise.id]);
  useEffect(() => { loadRecs(); }, [loadRecs]);

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("exercises").update({ progression_method: methodId || null, progression_config: config }).eq("id", exercise.id);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setSavedAs({ methodId, config });
    exercise.progression_method = methodId || null; exercise.progression_config = config; // keep the shared row current
    setMsg({ ok: true, text: "Progression settings saved." });
  };

  const run = async () => {
    setRunning(true); setOutcome(null);
    const res = await recommendForExercise({
      exercise: { ...exercise, progression_method: savedAs.methodId, progression_config: savedAs.config }, clientId,
      currentLoad: numOrNull(currentLoad), oneRepMax: numOrNull(oneRepMax), week: week === "" ? undefined : Number(week), techniqueConfirmed: techniqueOk || undefined, painReported: painAns === "yes" ? true : painAns === "no" ? false : undefined,
    });
    setOutcome(res); setRunning(false); loadRecs();
  };

  const act = async (rec, decision, modifiedLoad) => {
    const r = await decide(rec, { decision, modifiedLoad });
    if (!r.ok) setMsg({ ok: false, text: r.error });
    else {
      setMsg({ ok: true, text: r.prescribedWeight ? `Recommendation ${r.status}. The client now sees a ${r.prescribedWeight} lb target.` : `Recommendation ${r.status}.` });
      if (r.prescribedWeight) { exercise.prescribed_weight = r.prescribedWeight; exercise.prescribed_set_at = new Date().toISOString(); setTarget({ weight: r.prescribedWeight, at: exercise.prescribed_set_at }); }
    }
    setOutcome(null); loadRecs();
  };

  const shown = outcome?.calcResult;
  const pendingRec = recs.find((r) => r.status === "pending");

  return (
    <div style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 12, margin: "0 0 14px" }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 8 }}>Progression</div>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={lbl}>Method</label>
          <select style={input} value={methodId} onChange={(e) => { setMethodId(e.target.value); setConfig({}); setOutcome(null); }}>
            <option value="">None assigned</option>
            {Object.values(METHODS).filter((m) => m.scope !== "plan").map((m) => <option key={m.id} value={m.id}>{m.name}{m.status === "calculated" ? "" : " (reference only)"}</option>)}
          </select>
        </div>
        {method && <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.5 }}>{method.purpose}</div>}
        {method?.status === "calculated" && <ConfigForm methodId={methodId} config={config} onChange={setConfig} />}
        {method && method.status !== "calculated" && (
          <div style={{ fontSize: 12, color: S.warning, lineHeight: 1.6 }}>
            Not calculated by the app. To enable it the following must be verified:
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{method.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn sm onClick={save} disabled={saving || !dirty}>{saving ? "Saving..." : "Save settings"}</Btn>
          {msg && <span style={{ fontSize: 12, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</span>}
        </div>

        {target && (
          <div style={{ fontSize: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>Client's current target: <b>{target.weight} lb</b>{target.at ? <span style={{ color: S.muted }}> · set {new Date(target.at).toLocaleDateString()}</span> : null}</span>
            <Btn sm onClick={clearTarget}>Remove</Btn>
          </div>
        )}
        {savedAs.methodId && METHODS[savedAs.methodId]?.status === "calculated" && (
          <div style={{ borderTop: "1px solid " + S.border, paddingTop: 10, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Latest session</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, alignItems: "end" }}>
              {savedAs.methodId !== "percentage_based" && savedAs.methodId !== "density_progression" && <div><label style={lbl}>{savedAs.methodId.startsWith("apre_") ? "Working weight / nRM (lb)" : "Current load (lb)"}</label><input style={input} type="number" step="any" value={currentLoad} onChange={(e) => setCurrentLoad(e.target.value)} /></div>}
              {savedAs.methodId === "percentage_based" && <>
                <div><label style={lbl}>Verified 1RM (lb)</label><input style={input} type="number" step="any" value={oneRepMax} onChange={(e) => setOneRepMax(e.target.value)} /></div>
                {savedAs.config.weeklyPercents && <div><label style={lbl}>Week</label><input style={input} type="number" value={week} onChange={(e) => setWeek(e.target.value)} /></div>}
              </>}
              {savedAs.methodId === "density_progression" && (
                <div><label style={lbl}>Pain today?</label>
                  <select style={input} value={painAns} onChange={(e) => setPainAns(e.target.value)}><option value="">Not asked</option><option value="no">No pain</option><option value="yes">Pain reported</option></select></div>
              )}
              {savedAs.config.technique?.required && <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={techniqueOk} onChange={(e) => setTechniqueOk(e.target.checked)} />Technique was acceptable</label>}
              <Btn sm teal onClick={run} disabled={running}>{running ? "Calculating..." : "Calculate recommendation"}</Btn>
            </div>
            {outcome?.error && <div style={{ fontSize: 12, color: S.danger }}>{outcome.error}</div>}
            {shown && !outcome?.stored && (
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <StatusBadge label={STATUS_LABEL[shown.status] || shown.status} tone={STATUS_TONE[shown.status] || "neutral"} />
                {!outcome.sessionDate && <div style={{ color: S.muted, marginTop: 4 }}>No logged sessions for this exercise yet.</div>}
                {[...(shown.reasons || []), ...(shown.missing || [])].map((r, i) => <div key={i} style={{ color: S.muted, marginTop: 2 }}>• {r}</div>)}
              </div>
            )}
          </div>
        )}

        {recs.length > 0 && (
          <div style={{ borderTop: "1px solid " + S.border, paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Recommendations</div>
            {recs.map((r) => {
              const c = r.calc_result || {};
              return (
                <div key={r.id} style={{ padding: "8px 0", borderTop: "1px solid " + S.border, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: S.muted }}>Session {r.session_date}</span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <StatusBadge label={STATUS_LABEL[c.status] || c.status} tone={STATUS_TONE[c.status] || "neutral"} />
                      <StatusBadge label={r.status} tone={r.status === "pending" ? "amber" : r.status === "rejected" ? "red" : "green"} />
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {c.calc?.nonLoad
                      ? (c.proposedAdjustment ? <>Proposed: <b>{c.proposedAdjustment.type.replace(/_/g, " ")}</b> {c.proposedAdjustment.from} → <b>{c.proposedAdjustment.to}</b> {c.proposedAdjustment.unit}</> : "No target change proposed")
                      : c.recommendedLoad != null ? <>Calculated load: <b>{c.recommendedLoad} lb</b></> : "No calculated load"}
                    {c.coachReviewFlag && <> · <b style={{ color: S.danger }}>Flagged for your review</b></>}
                    {r.approved_prescription && <> · Approved: <b>{r.approved_prescription.load} lb</b>{r.approved_prescription.source === "coach_override" ? " (coach override)" : ""}</>}
                  </div>
                  {(c.reasons || []).map((x, i) => <div key={i} style={{ color: S.muted, marginTop: 2 }}>• {x}</div>)}
                  {r.decision_note && <div style={{ color: S.muted }}>Note: {r.decision_note}</div>}
                  {r.status === "pending" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <Btn sm onClick={() => act(r, "approve")} disabled={!c.calc?.nonLoad && c.recommendedLoad == null}>{c.calc?.nonLoad && !c.proposedAdjustment ? "Acknowledge" : "Approve"}</Btn>
                      {!c.calc?.nonLoad && <input style={{ ...input, width: 80 }} type="number" step="any" placeholder="Load" value={editLoad[r.id] ?? ""} onChange={(e) => setEditLoad((m) => ({ ...m, [r.id]: e.target.value }))} />}
                      {!c.calc?.nonLoad && <Btn sm teal onClick={() => act(r, "modify", Number(editLoad[r.id]))} disabled={!(Number(editLoad[r.id]) > 0)}>Edit &amp; approve</Btn>}
                      <Btn sm danger onClick={() => act(r, "reject")}>Reject</Btn>
                    </div>
                  )}
                </div>
              );
            })}
            {pendingRec && <div style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>Approving a load sets the target weight the client sees. Approving a density change updates that exercise's target in its progression settings (nothing the client sees changes).</div>}
          </div>
        )}
      </div>
    </div>
  );
}
