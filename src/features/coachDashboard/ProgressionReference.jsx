import { useState } from "react";
import { S, RADIUS } from "../../theme.jsx";
import { Card, StatusBadge, Btn } from "../../components/ui/index.js";
import { METHODS, evaluateProgression } from "../../lib/progression/methods.js";
import { TAPER_TEMPLATE } from "../../lib/progression/taper.js";

// Coach reference for every progression method: what it is for, what it needs,
// the exact rules, a worked example computed LIVE by the same engine the app uses
// (so the example can't drift from the calculation), and — where it helps — the
// published tables as a picture and a small "try it" calculator. Implementation
// status is always shown honestly: calculated vs. reference-only.
const STATUS = { calculated: ["Calculated by the app", "green"], "reference-only": ["Reference only", "amber"], "not-implemented": ["Not implemented", "neutral"] };
const RESULT_TONE = { increase: "green", progress: "green", prescription: "green", hold: "amber", decrease: "amber", regression: "red", insufficient_data: "amber", non_comparable: "neutral", invalid: "red", reference_only: "neutral" };
const lbl = { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, margin: "14px 0 5px" };
const input = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "6px 8px", fontSize: 12, outline: "none", borderRadius: RADIUS.md, width: "100%" };

function ResultView({ r }) {
  return (
    <div style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: "8px 12px", fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <StatusBadge label={r.status.replace(/_/g, " ")} tone={RESULT_TONE[r.status] || "neutral"} />
        {r.recommendedLoad != null && <b>→ {r.recommendedLoad} lb</b>}
        {r.proposedAdjustment && <b>→ {r.proposedAdjustment.type.replace(/_/g, " ")}: {r.proposedAdjustment.from} → {r.proposedAdjustment.to} {r.proposedAdjustment.unit}</b>}
      </div>
      {[...(r.reasons || []), ...(r.missing || [])].map((x, i) => <div key={i} style={{ color: S.muted }}>• {x}</div>)}
    </div>
  );
}

// Published APRE bands as sideways bars: reps on set 3 → load change (lb).
function AprePicture({ method }) {
  const bands = method.adjustmentTable;
  const maxAbs = 15;
  return (
    <div>
      <div style={lbl}>Set 3 reps → change in load (lb)</div>
      {bands.map((b, i) => {
        const [lo, hi] = b.change;
        const label = `${b.min}${b.max == null ? "+" : b.max === b.min ? "" : "–" + b.max} reps`;
        const color = hi <= 0 && lo < 0 ? S.warning : lo > 0 ? S.success : S.muted;
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px", gap: 8, alignItems: "center", fontSize: 12, padding: "3px 0" }}>
            <span>{label}</span>
            <div style={{ position: "relative", height: 14, background: S.surface2, borderRadius: 7 }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: S.border }} />
              <div style={{ position: "absolute", top: 2, bottom: 2, borderRadius: 5, background: color, opacity: 0.85,
                left: `${50 + (Math.min(lo, hi) / maxAbs) * 50}%`, width: `${Math.max((Math.abs(hi - lo) / maxAbs) * 50, 1.5)}%` }} />
            </div>
            <span style={{ color: S.muted }}>{lo === hi ? (lo === 0 ? "no change" : `${lo > 0 ? "+" : ""}${lo}`) : `${lo > 0 ? "+" : ""}${lo} to ${hi > 0 ? "+" : ""}${hi}`}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>Bars show the published range; your "low / middle / high" setting picks a point inside it. Reps outside these bands get no calculated change.</div>
      <div style={lbl}>Set structure</div>
      <div style={{ fontSize: 12 }}>{method.structure.map((s) => `Set ${s.n}: ${s.reps === "max" ? "max reps" : s.reps + " reps"} @ ${s.pct === "adjusted" ? "adjusted load" : s.pct + "%"}`).join("  ·  ")}</div>
      <div style={lbl}>Sources cross-checked</div>
      {method.sources.map((x, i) => <div key={i} style={{ fontSize: 11, color: S.muted }}>• {x}</div>)}
    </div>
  );
}

// Small interactive calculators for the two methods coaches ask about most.
function TryIt({ method }) {
  const isApre = method.id.startsWith("apre_");
  const [reps, setReps] = useState(isApre ? "8" : "12,12,12");
  const [load, setLoad] = useState("200");
  const [inc, setInc] = useState("5");
  const [step, setStep] = useState("low");
  const [out, setOut] = useState(null);
  const run = () => {
    const l = Number(load), i = Number(inc);
    if (isApre) {
      setOut(evaluateProgression(method.id, { config: { increment: i, stepMode: step }, currentLoad: l, sets: [{ sets: 3, reps: parseInt(reps, 10), weight: l }] }));
    } else {
      const rs = reps.split(",").map((x) => parseInt(x.trim(), 10));
      setOut(evaluateProgression("double_progression", { config: { repMin: 8, repMax: 12, requiredSets: rs.length, increment: i }, currentLoad: l, sets: rs.map((r, k) => ({ sets: k + 1, reps: r, weight: l })) }));
    }
  };
  return (
    <div>
      <div style={lbl}>Try it</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, alignItems: "end" }}>
        <div><div style={{ fontSize: 10, color: S.muted }}>{isApre ? "Reps on set 3" : "Reps per set (8–12 range, comma-separated)"}</div><input style={input} value={reps} onChange={(e) => setReps(e.target.value)} /></div>
        <div><div style={{ fontSize: 10, color: S.muted }}>{isApre ? "Working weight (lb)" : "Current load (lb)"}</div><input style={input} type="number" value={load} onChange={(e) => setLoad(e.target.value)} /></div>
        <div><div style={{ fontSize: 10, color: S.muted }}>Increment (lb)</div><input style={input} type="number" value={inc} onChange={(e) => setInc(e.target.value)} /></div>
        {isApre && <div><div style={{ fontSize: 10, color: S.muted }}>Change within range</div><select style={input} value={step} onChange={(e) => setStep(e.target.value)}><option value="low">Low</option><option value="mid">Middle</option><option value="high">High</option></select></div>}
        <Btn sm teal onClick={run}>Calculate</Btn>
      </div>
      {out && <div style={{ marginTop: 8 }}><ResultView r={out} /></div>}
    </div>
  );
}

function MethodCard({ m }) {
  const [open, setOpen] = useState(false);
  const [label, tone] = STATUS[m.status] || ["", "neutral"];
  const example = m.workedExample ? (() => { try { return evaluateProgression(m.id, m.workedExample.input); } catch { return null; } })() : null;
  return (
    <Card style={{ marginBottom: 12 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: S.text, textAlign: "left", display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", padding: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{m.name}</div>
          <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>{m.purpose}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}><StatusBadge label={label} tone={tone} /><span style={{ color: S.muted }}>{open ? "▲" : "▼"}</span></div>
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          {m.status !== "calculated" && (m.missing || []).length > 0 && (
            <div style={{ border: "1px solid " + S.warning, borderRadius: RADIUS.md, padding: "8px 12px", marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: S.warning, textTransform: "uppercase", letterSpacing: 1 }}>Not calculated — still needed</div>
              {m.missing.map((x, i) => <div key={i} style={{ fontSize: 12 }}>• {x}</div>)}
            </div>
          )}
          {m.requiredInputs?.length > 0 && (<><div style={lbl}>What it needs</div>{m.requiredInputs.map((x, i) => <div key={i} style={{ fontSize: 12 }}>• {x}</div>)}</>)}
          {m.prescriptionParameters?.length > 0 && (
            <><div style={lbl}>Settings</div>
              {m.prescriptionParameters.map((p, i) => (
                <div key={i} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid " + S.border }}>
                  <b>{p.key}</b> <span style={{ color: S.muted }}>({p.type}{p.required === true ? ", required" : p.required ? ", required for " + p.required : ""})</span>{p.note && <div style={{ color: S.muted }}>{p.note}</div>}
                </div>
              ))}</>
          )}
          {m.eligibility && m.status === "calculated" && (<><div style={lbl}>When it will recommend a change</div><div style={{ fontSize: 12, lineHeight: 1.6 }}>{m.eligibility}</div></>)}
          {m.rules?.length > 0 && (<><div style={lbl}>The rules</div>{m.rules.map((x, i) => <div key={i} style={{ fontSize: 12, padding: "2px 0" }}>{i + 1}. {x}</div>)}</>)}
          {m.adjustmentTable && <AprePicture method={m} />}
          {m.id === "performance_taper" && (
            <div style={{ fontSize: 12, color: S.muted, marginTop: 8 }}>Template defaults (suggestions only, never imposed): {TAPER_TEMPLATE.suggestedDurationDays.join("–")}-day window, {TAPER_TEMPLATE.suggestedReductionPct.join("–")}% volume reduction. Create tapers from a client's Overview page.</div>
          )}
          {m.workedExample && (
            <><div style={lbl}>Worked example (calculated live)</div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>{m.workedExample.description}</div>
              {example && <ResultView r={example} />}</>
          )}
          {(m.id === "double_progression" || m.id.startsWith("apre_")) && <TryIt method={m} />}
          {m.validation?.length > 0 && (<><div style={lbl}>What it refuses</div>{m.validation.map((x, i) => <div key={i} style={{ fontSize: 12, color: S.muted }}>• {x}</div>)}</>)}
        </div>
      )}
    </Card>
  );
}

export function ProgressionReference() {
  const all = Object.values(METHODS);
  const calc = all.filter((m) => m.status === "calculated").length;
  return (
    <div>
      <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6, marginBottom: 14 }}>
        How each progression method works, exactly as the app calculates it. {calc} of {all.length} are fully calculated; the app never invents a number for the rest. Every recommendation is advisory until you approve it.
      </div>
      {all.map((m) => <MethodCard key={m.id} m={m} />)}
    </div>
  );
}
