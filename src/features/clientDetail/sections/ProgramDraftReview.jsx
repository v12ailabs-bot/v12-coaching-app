import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Card, CardTitle, Btn, DayFolder } from "../../../components/ui/index.js";
import { PHASE_ORDER, BLOCK_TYPES, BLOCK_TYPE_LABEL } from "../../../lib/constants.js";
import { validateTrainingPlan } from "../../../lib/programming/validateProgram.js";
import { estimateDay, shortenDay, normalizeSessionConfig, durationOptionsFor, ARRANGEMENTS, CUSTOM_MIN, CUSTOM_MAX, isValidSessionMinutes } from "../../../lib/programming/sessionDuration.js";
import { diffPrograms } from "../../../lib/programming/draftDiff.js";
import { updateExercise, removeExercise, addExercise, moveExercise, canMove, replaceDayExercises } from "../../../lib/programming/draftEdit.js";
import { createProgramVersion } from "./ProgramSection.jsx";

const inp = { background: S.bg, border: "1px solid " + S.border, color: S.text, padding: "6px 8px", fontSize: 13, outline: "none", width: "100%", borderRadius: RADIUS.sm };
const lbl = { fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4, display: "block" };
const ghost = { padding: "5px 9px", fontSize: 11, background: "transparent", color: S.text, border: "1px solid " + S.border, cursor: "pointer", borderRadius: RADIUS.sm };

// The coach's review/approval workspace for an AI-generated program. The draft
// lives in program_drafts and is invisible to the client; nothing reaches the
// client's active program until "Approve & assign" succeeds (approve_program_draft
// swaps it in atomically and keeps any exercise that has logged history).
export function ProgramDraftReview({ client, trainOwnerId, authHeaders, refreshKey, onApproved, onRegenerate, generating }) {
  const [draft, setDraft] = useState(null);       // DB row
  const [plan, setPlan] = useState(null);         // working copy of draft.payload
  const [cfg, setCfg] = useState(null);           // working session_config
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);         // "save" | "approve" | "discard" | `revise:${day}`
  const [msg, setMsg] = useState(null);
  const [issues, setIssues] = useState(null);     // validation errors blocking approval
  const [showDiff, setShowDiff] = useState(false);
  const [instr, setInstr] = useState({});         // per-day AI instruction text
  const [custom, setCustom] = useState(false);
  const [keepPrompt, setKeepPrompt] = useState(null); // { items:[{id,name,day,sets,reps,logCount,lastDate,sameNameInDraft}], keep:Set } while the coach chooses

  const load = useCallback(async () => {
    const { data } = await supabase.from("program_drafts").select("*").eq("client_id", trainOwnerId).eq("status", "draft").maybeSingle();
    setDraft(data || null);
    setPlan(data ? structuredClone(data.payload) : null);
    setCfg(data ? normalizeSessionConfig(data.session_config) : null);
    setDirty(false); setIssues(null);
  }, [trainOwnerId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const flash = (ok, text) => setMsg({ ok, text });
  const edit = (next) => { setPlan(next); setDirty(true); };

  const estimates = useMemo(() => (plan && cfg ? Object.fromEntries(plan.weekly_split.map((d) => [d.day, estimateDay(d.exercises, cfg)])) : {}), [plan, cfg]);
  const diff = useMemo(() => (draft && plan ? diffPrograms(draft.original_payload, plan) : null), [draft, plan]);

  if (!draft || !plan) return null;

  const persist = async () => {
    const { error } = await supabase.from("program_drafts").update({ payload: plan, session_config: cfg, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "draft");
    if (error) throw error;
    setDirty(false);
  };
  const run = async (key, fn) => {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { flash(false, e.message || String(e)); } finally { setBusy(null); }
  };

  const save = () => run("save", async () => { await persist(); flash(true, "Draft saved."); });

  const revise = (day, text) => run(`revise:${day}`, async () => {
    if (dirty) await persist();
    const r = await fetch("/api/generate-program", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ action: "revise_day", draft_id: draft.id, day, instruction: text }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    setInstr((p) => ({ ...p, [day]: "" }));
    await load();
    flash(true, `${day} revised${data.summary ? ` — ${data.summary}` : ""}. Other days were not changed.`);
  });

  const fitDay = (day) => {
    const d = plan.weekly_split.find((x) => x.day === day);
    const r = shortenDay(d.exercises, cfg.session_minutes, cfg);
    if (!r.removed.length && !r.reduced.length) { flash(true, `${day} already fits ${cfg.session_minutes} min.`); return; }
    const parts = [...r.reduced.map((x) => `${x.name}: ${x.from}→${x.to} sets`), ...r.removed.map((n) => `remove ${n}`)];
    if (!window.confirm(`Fit ${day} to ${cfg.session_minutes} min (${r.before}→${r.after} min of coached work)?\n\n${parts.join("\n")}\n\nThe primary lift and all rest periods are kept.`)) return;
    edit(replaceDayExercises(plan, day, r.exercises));
    flash(r.fits, r.fits ? `${day} trimmed to fit.` : `${day} trimmed as far as the primary lifts allow (${r.after} min) — still over budget.`);
  };

  // Step 1: validate, then — if the client's current program has exercises with
  // logged history — ask the coach which to keep and which to retire.
  const approve = () => run("approve", async () => {
    const v = validateTrainingPlan(plan);
    if (!v.ok) { setIssues(v.errors); throw new Error("Fix the highlighted problems before approving."); }
    setIssues(null);
    const { data: current } = await supabase.from("exercises").select("id,name,day_of_week,sets,reps").eq("client_id", trainOwnerId).eq("source", "ai").is("retired_at", null);
    const ids = (current || []).map((e) => e.id);
    const { data: logs } = ids.length ? await supabase.from("workout_logs").select("exercise_id,date").in("exercise_id", ids) : { data: [] };
    const stats = new Map();
    (logs || []).forEach((l) => { const s = stats.get(l.exercise_id) || { n: 0, last: "" }; s.n++; if (l.date > s.last) s.last = l.date; stats.set(l.exercise_id, s); });
    const draftNames = new Set(v.program.weekly_split.flatMap((d) => d.exercises.map((e) => e.name.trim().toLowerCase())));
    const items = (current || []).filter((e) => stats.has(e.id)).map((e) => ({
      ...e, logCount: stats.get(e.id).n, lastDate: stats.get(e.id).last, sameNameInDraft: draftNames.has(String(e.name).trim().toLowerCase()),
    }));
    if (items.length) {
      // Default: keep a logged exercise unless the new program already contains it
      // (then the new version replaces it; the old one's history stays on record).
      setKeepPrompt({ items, keep: new Set(items.filter((i) => !i.sameNameInDraft).map((i) => i.id)) });
      return;
    }
    if (!window.confirm(`Approve and assign "${v.program.program_name}" to ${client.name || client.email}?\n\nIt becomes their active program (a restore point is saved first). Their existing exercises have no logged history, so they are simply replaced; coach-added exercises are untouched.`)) return;
    await finishApprove(v.program, []);
  });

  // Step 2: the atomic swap. keepIds = logged exercises the coach chose to keep.
  const finishApprove = async (program, keepIds) => {
    const { error: upErr } = await supabase.from("program_drafts").update({ payload: program, session_config: cfg, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "draft");
    if (upErr) throw upErr;
    await createProgramVersion(trainOwnerId, "Before approving AI draft");
    const { error } = await supabase.rpc("approve_program_draft", { p_draft_id: draft.id, p_keep_exercise_ids: keepIds });
    if (error) throw error;
    await createProgramVersion(trainOwnerId, `AI draft approved${draft.template_name ? ` · ${draft.template_name}` : ""}`);
    setKeepPrompt(null); setDraft(null); setPlan(null);
    onApproved?.();
  };
  const confirmKeep = () => run("approve", async () => {
    const v = validateTrainingPlan(plan);
    if (!v.ok) { setKeepPrompt(null); setIssues(v.errors); throw new Error("Fix the highlighted problems before approving."); }
    await finishApprove(v.program, [...keepPrompt.keep]);
  });
  const toggleKeep = (id) => setKeepPrompt((p) => { const keep = new Set(p.keep); keep.has(id) ? keep.delete(id) : keep.add(id); return { ...p, keep }; });

  const discard = () => run("discard", async () => {
    if (!window.confirm("Discard this draft? The client's current program is not affected.")) return;
    const { error } = await supabase.from("program_drafts").update({ status: "discarded", updated_at: new Date().toISOString() }).eq("id", draft.id).eq("status", "draft");
    if (error) throw error;
    setDraft(null); setPlan(null);
    onApproved?.();
  });

  const setMinutes = (v) => { setCfg((c) => normalizeSessionConfig({ ...c, session_minutes: Number(v) })); setDirty(true); };
  const options = durationOptionsFor(cfg.arrangement);
  const independent = cfg.arrangement === "independent_online";
  const showCustom = custom || !options.includes(cfg.session_minutes);
  const errorFor = (day, i) => (issues || []).filter((e) => e.path.startsWith(`weekly_split[${plan.weekly_split.findIndex((d) => d.day === day)}].exercises[${i}]`));
  const fmtRev = (r) => `${new Date(r.at).toLocaleString()} · ${r.kind === "ai_day_revision" ? `AI revised ${r.day}: “${r.instruction}”` : r.kind}`;

  return (
    <Card style={{ marginBottom: 20, border: "1px solid " + S.accent }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <CardTitle>Draft for review — not yet assigned</CardTitle>
          <div style={{ fontSize: 12, color: S.muted }}>
            {plan.program_name} · {plan.weeks} weeks · {plan.weekly_split.length} days{draft.template_name ? ` · template: ${draft.template_name}` : ""}. {client.name || "The client"} still sees their current program until you approve this.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn sm onClick={save} disabled={!!busy || !dirty}>{busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}</Btn>
          <Btn sm teal onClick={approve} disabled={!!busy || generating}>{busy === "approve" ? "Approving…" : "✓ Approve & assign"}</Btn>
          <Btn sm danger onClick={discard} disabled={!!busy}>Discard</Btn>
        </div>
      </div>

      {msg && <div style={{ margin: "10px 0", padding: "8px 14px", fontSize: 12, fontWeight: 600, background: msg.ok ? "rgba(0,201,167,.14)" : "rgba(192,57,43,.16)", color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</div>}
      {issues && (
        <div style={{ margin: "10px 0", padding: "10px 14px", fontSize: 12, background: "rgba(192,57,43,.16)", color: S.danger }}>
          {issues.map((e, i) => <div key={i}>• {e.message}</div>)}
        </div>
      )}
      {(draft.warnings || []).length > 0 && (
        <details style={{ margin: "10px 0", fontSize: 12, color: S.warning }}>
          <summary style={{ cursor: "pointer" }}>{draft.warnings.length} programming note{draft.warnings.length > 1 ? "s" : ""} from the checker (advisory)</summary>
          <div style={{ color: S.muted, marginTop: 6 }}>{draft.warnings.map((w, i) => <div key={i}>• {w.message}</div>)}</div>
        </details>
      )}

      {keepPrompt && (
        <div style={{ background: S.surface2, border: "1px solid " + S.warning, padding: 14, margin: "12px 0", borderRadius: RADIUS.sm }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Which current exercises should stay?</div>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>
            These exercises in {client.name || "the client"}'s current program have logged workouts. Tick the ones to <b>keep</b> in the program alongside the new plan. Unticked ones are removed from their workout screen — their logged history stays on record. Exercises with no logs are simply replaced.
          </div>
          {keepPrompt.items.map((i) => (
            <label key={i.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid " + S.border, cursor: "pointer" }}>
              <input type="checkbox" checked={keepPrompt.keep.has(i.id)} onChange={() => toggleKeep(i.id)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13 }}>
                <b>{i.name}</b> <span style={{ color: S.muted }}>· {i.day_of_week || "unscheduled"}{i.sets ? ` · ${i.sets}×${i.reps || "?"}` : ""} · {i.logCount} set{i.logCount === 1 ? "" : "s"} logged, last {i.lastDate}</span>
                {i.sameNameInDraft && <span style={{ display: "block", fontSize: 11, color: S.warning }}>The new program also includes this exercise — keeping both would duplicate it.</span>}
              </span>
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Btn teal onClick={confirmKeep} disabled={!!busy}>{busy === "approve" ? "Approving…" : `Approve — keep ${keepPrompt.keep.size}, remove ${keepPrompt.items.length - keepPrompt.keep.size}`}</Btn>
            <button style={ghost} onClick={() => setKeepPrompt(null)} disabled={!!busy}>Cancel</button>
          </div>
        </div>
      )}

      {/* Session length / who supervises what */}
      <div style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, margin: "12px 0", borderRadius: RADIUS.sm }}>
        <div className="g3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          <div><label style={lbl}>Coaching arrangement</label>
            <select style={inp} value={cfg.arrangement} onChange={(e) => { setCfg(normalizeSessionConfig({ ...cfg, arrangement: e.target.value })); setCustom(false); setDirty(true); }}>
              {Object.entries(ARRANGEMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div><label style={lbl}>Session length (coached)</label>
            <select style={inp} value={showCustom ? "custom" : cfg.session_minutes} onChange={(e) => { if (e.target.value === "custom") setCustom(true); else { setCustom(false); setMinutes(e.target.value); } }}>
              {options.map((m) => <option key={m} value={m}>{m} min</option>)}
              {independent && <option value="custom">Custom…</option>}
            </select>
            {independent && showCustom && <input style={{ ...inp, marginTop: 6 }} type="number" min={CUSTOM_MIN} max={CUSTOM_MAX} value={cfg.session_minutes} onChange={(e) => { const n = Number(e.target.value); setCfg((c) => ({ ...c, session_minutes: n })); setDirty(true); }} onBlur={() => !isValidSessionMinutes(cfg.session_minutes, cfg.arrangement) && setMinutes(60)} />}
          </div>
          <div><label style={lbl}>Warm-up / activation</label>
            <select style={inp} value={cfg.prep} onChange={(e) => { setCfg({ ...cfg, prep: e.target.value }); setDirty(true); }}>
              <option value="independent">Client does it independently (not counted)</option><option value="coached">Part of the supervised session</option></select></div>
          <div><label style={lbl}>Cooldown</label>
            <select style={inp} value={cfg.finish} onChange={(e) => { setCfg({ ...cfg, finish: e.target.value }); setDirty(true); }}>
              <option value="independent">Client does it independently (not counted)</option><option value="coached">Part of the supervised session</option></select></div>
        </div>
        <div style={{ fontSize: 11, color: S.muted, marginTop: 8 }}>
          Estimates use sets × reps, the rest periods you set, transitions and supersets. Changing these settings re-estimates every day; use "Fit to {cfg.session_minutes} min" on a day to trim it the safe way (lowest-priority work first, primary lift and rest periods kept). To change what the AI builds for the new length, regenerate.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button style={ghost} onClick={() => setShowDiff((v) => !v)}>{showDiff ? "Hide" : "Show"} changes vs. original AI draft{diff?.changedDays.length ? ` (${diff.changedDays.length} day${diff.changedDays.length > 1 ? "s" : ""})` : ""}</button>
        <button style={ghost} disabled={generating || !!busy} onClick={() => { if (window.confirm("Regenerate the whole program? This replaces the draft (and your edits to it). The client's active program is not affected.")) onRegenerate?.(); }}>↻ Regenerate entire program</button>
      </div>
      {showDiff && diff && (
        <div style={{ background: S.surface2, border: "1px solid " + S.border, padding: 12, marginBottom: 12, fontSize: 12, color: S.muted }}>
          {diff.changedDays.length === 0 && <div>No changes — this matches what the AI produced.</div>}
          {diff.days.filter((d) => d.status !== "unchanged").map((d) => (
            <div key={d.day} style={{ marginBottom: 8 }}>
              <strong style={{ color: S.text }}>{d.day}</strong>
              {d.added.map((n) => <div key={"a" + n} style={{ color: S.accent2 }}>+ {n}</div>)}
              {d.removed.map((n) => <div key={"r" + n} style={{ color: S.danger }}>− {n}</div>)}
              {d.changed.map((c) => <div key={"c" + c.name}>~ {c.name}: {c.fields.map((f) => `${f.field.replace("_seconds", "")} ${f.from ?? "—"} → ${f.to ?? "—"}`).join(", ")}</div>)}
              {d.reordered && <div>↕ order changed</div>}
            </div>
          ))}
          {(draft.revisions || []).length > 0 && <div style={{ marginTop: 6 }}><strong style={{ color: S.text }}>Revision history</strong>{draft.revisions.map((r, i) => <div key={i}>{fmtRev(r)}{r.summary ? ` — ${r.summary}` : ""}</div>)}</div>}
        </div>
      )}

      {plan.weekly_split.map((d) => {
        const est = estimates[d.day];
        const over = est && !est.fits;
        return (
          <DayFolder key={d.day} defaultOpen title={d.day} meta={`${d.exercises.length} exercises`}
            headerAction={est && <span style={{ fontSize: 11, color: over ? S.danger : S.accent2, whiteSpace: "nowrap" }}>{est.coached} min coached{est.prep ? ` · +${est.prep} prep` : ""}{est.finish ? ` · +${est.finish} finish` : ""} / {est.budget}</span>}>
            {d.focus && <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>Focus: {d.focus}</div>}
            <div>
              {d.exercises.map((e, i) => {
                const errs = errorFor(d.day, i);
                const set = (patch) => edit(updateExercise(plan, d.day, i, patch));
                const bad = (re) => (errs.some((x) => re.test(x.path)) ? S.danger : S.border);
                const field = (label, width, node) => <div style={{ flex: `0 1 ${width}px`, minWidth: Math.min(width, 90) }}><label style={lbl}>{label}</label>{node}</div>;
                return (
                  <div key={i} style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: S.muted, paddingBottom: 8, width: 18 }}>{i + 1}</span>
                      <div style={{ flex: "1 1 200px", minWidth: 160 }}><label style={lbl}>Exercise</label><input style={{ ...inp, borderColor: bad(/name/) }} value={e.name} onChange={(ev) => set({ name: ev.target.value })} /></div>
                      <div style={{ display: "flex", gap: 4, paddingBottom: 2 }}>
                        <button style={ghost} disabled={!canMove(plan, d.day, i, -1)} title="Move up" onClick={() => edit(moveExercise(plan, d.day, i, -1))}>↑</button>
                        <button style={ghost} disabled={!canMove(plan, d.day, i, +1)} title="Move down" onClick={() => edit(moveExercise(plan, d.day, i, +1))}>↓</button>
                        <button style={ghost} title="Ask the AI for a replacement for this exercise" disabled={!!busy} onClick={() => revise(d.day, `Replace "${e.name}" with a different exercise that trains the same movement pattern and muscles, respecting the client's equipment and injuries. Keep everything else in this day the same.`)}>⇄</button>
                        <button style={{ ...ghost, color: S.danger }} title="Remove" onClick={() => edit(removeExercise(plan, d.day, i))}>✕</button>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      {field("Sets", 70, <input style={{ ...inp, borderColor: bad(/sets/) }} type="number" min={1} max={12} value={e.sets ?? ""} onChange={(ev) => set({ sets: ev.target.value })} />)}
                      {field("Reps", 90, <input style={{ ...inp, borderColor: bad(/reps/) }} value={e.reps ?? ""} onChange={(ev) => set({ reps: ev.target.value })} />)}
                      {field("Rest (s)", 80, <input style={{ ...inp, borderColor: bad(/rest/) }} type="number" min={0} max={600} value={e.rest_seconds ?? ""} onChange={(ev) => set({ rest_seconds: ev.target.value })} />)}
                      {field("Phase", 170, <select style={inp} value={e.section || ""} onChange={(ev) => set({ section: ev.target.value || null })}><option value="">Unset</option>{PHASE_ORDER.map((p) => <option key={p} value={p}>{p}</option>)}</select>)}
                      {field("Block", 170, <select style={inp} value={e.block_type || "straight_set"} onChange={(ev) => set({ block_type: ev.target.value, group_id: ev.target.value === "straight_set" ? null : (e.group_id || "A") })}>{BLOCK_TYPES.map((t) => <option key={t} value={t}>{BLOCK_TYPE_LABEL[t]}</option>)}</select>)}
                      {e.block_type && e.block_type !== "straight_set" && field("Group", 80, <input style={inp} placeholder="e.g. A" value={e.group_id || ""} onChange={(ev) => set({ group_id: ev.target.value })} />)}
                    </div>
                    {e.notes && <div style={{ fontSize: 11, color: S.muted, marginTop: 8, lineHeight: 1.5 }}>{e.notes}</div>}
                    {errs.length > 0 && <div style={{ fontSize: 11, color: S.danger, marginTop: 6 }}>{errs.map((x) => x.message).join(" ")}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <button style={ghost} onClick={() => edit(addExercise(plan, d.day))}>+ Add exercise</button>
              {over && <button style={{ ...ghost, color: S.warning }} onClick={() => fitDay(d.day)}>Fit to {cfg.session_minutes} min</button>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input style={{ ...inp, flex: 1 }} placeholder={`Ask the AI to change ${d.day} only — e.g. "dumbbells only, no overhead pressing"`} value={instr[d.day] || ""} onChange={(ev) => setInstr((p) => ({ ...p, [d.day]: ev.target.value }))} />
              <Btn sm teal disabled={!!busy || !(instr[d.day] || "").trim()} onClick={() => revise(d.day, instr[d.day].trim())}>{busy === `revise:${d.day}` ? "Revising…" : "Revise day"}</Btn>
            </div>
          </DayFolder>
        );
      })}
    </Card>
  );
}
