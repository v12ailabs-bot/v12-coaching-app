import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S, RADIUS } from "../../../theme.jsx";
import { Btn } from "../../../components/ui/index.js";

// AI "they hit it — what now?" for a milestone with achieved_at set. Requested automatically the
// first time the coach sees a hit milestone (one per milestone, stored), then the coach either
// continues with it (archives the hit milestone and starts the next target) or discards it.
// The exercise suggestion is advice shown here — nothing in the program changes automatically.
const ACTION_LABEL = { continue: "Keep progressing this lift", variation: "Move to a variation", swap: "Swap the exercise", retire: "Retire the exercise" };

export function MilestoneNextStep({ goal, onAccept }) {
  const [rec, setRec] = useState(undefined);   // undefined = loading, null = none yet
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const asked = useRef(false);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/goal-insight", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify({ milestone_goal_id: goal.id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not get a recommendation.");
      setRec(json.recommendation);
    } catch (e) { setErr(e.message); setRec(null); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    let live = true;
    supabase.from("milestone_recommendations").select("*").eq("goal_id", goal.id).maybeSingle().then(({ data }) => {
      if (!live) return;
      setRec(data || null);
      if (!data && !asked.current) { asked.current = true; generate(); }
    });
    return () => { live = false; };
  }, [goal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (rec?.payload?.next_target) setValue(String(rec.payload.next_target.value)); }, [rec?.id]);

  const decide = async (status) => {
    await supabase.from("milestone_recommendations").update({ status, decided_at: new Date().toISOString() }).eq("id", rec.id);
    setRec((r) => ({ ...r, status }));
  };
  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const n = value === "" ? null : Number(value);
      await onAccept(goal, rec.payload.exercise_plan?.action === "retire" ? null : n);
      await decide("accepted");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const box = { marginTop: 10, border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 12, background: S.surface2, fontSize: 12, lineHeight: 1.6 };
  if (rec === undefined || (busy && !rec)) return <div style={{ ...box, color: S.muted }}>Working out the next step…</div>;
  if (!rec) return <div style={box}><span style={{ color: S.danger }}>{err || "No recommendation yet."}</span> <Btn sm onClick={generate} disabled={busy}>Try again</Btn></div>;
  if (rec.status === "discarded") return <div style={{ ...box, color: S.muted }}>AI next step discarded. Use "Set Next Target" to choose one yourself.</div>;
  if (rec.status === "accepted") return null;

  const p = rec.payload || {}, t = p.next_target, plan = p.exercise_plan || {};
  return (
    <div style={box}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.accent2, marginBottom: 4 }}>AI recommended next step</div>
      {p.headline && <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.headline}</div>}
      {t
        ? <div>Next target: <b>{goal.target_value}{goal.unit} → {t.value}{goal.unit}</b>{t.weeks ? ` over ~${t.weeks} weeks` : ""}{t.reasoning && <span style={{ color: S.muted }}> — {t.reasoning}</span>}</div>
        : <div style={{ color: S.muted }}>No safe next target suggested — set one yourself.</div>}
      <div style={{ marginTop: 4 }}>Exercise: <b>{ACTION_LABEL[plan.action] || plan.action}</b>{plan.suggested_exercise ? <> → <b>{plan.suggested_exercise}</b></> : null}{plan.reasoning && <span style={{ color: S.muted }}> — {plan.reasoning}</span>}</div>
      {p.coach_note && <div style={{ color: S.muted, marginTop: 4 }}>Tip: {p.coach_note}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        {t && plan.action !== "retire" && <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} style={{ background: S.surface, border: "1px solid " + S.border, color: S.text, padding: "6px 8px", fontSize: 12, width: 90, borderRadius: RADIUS.md }} />}
        <Btn sm teal onClick={accept} disabled={busy || (t && plan.action !== "retire" && !(Number(value) > 0))}>{plan.action === "retire" || !t ? "Accept" : "Continue — set this target"}</Btn>
        <Btn sm onClick={() => decide("discarded")} disabled={busy}>Discard</Btn>
      </div>
      <div style={{ color: S.muted, fontSize: 11, marginTop: 6 }}>Continuing archives the milestone they hit{t && plan.action !== "retire" ? " and starts the next target" : ""}. Exercise changes are advice — apply them when you edit the program.</div>
      {err && <div style={{ color: S.danger, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
