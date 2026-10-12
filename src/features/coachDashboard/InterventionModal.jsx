import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS } from "../../theme.jsx";
import { Modal, Btn, Tabs, StatusBadge } from "../../components/ui/index.js";
import { callHeadCoach } from "../clientDetail/sections/HeadCoachSection.jsx";
import { StrengthTab } from "../progress/StrengthTab.jsx";
import { estimateBodyComposition, bodyFatCategory } from "../../lib/bodyComposition.js";
import { mergeDailyNutrition } from "../../lib/scoring/nutritionAdherence.js";
import { adherenceFrom } from "../../lib/scoring.js";
import { yesterdayDate, yesterdayStr } from "../../lib/dates.js";

// Attention Center pop-up (per the Intervention reference): one modal that
// answers "why is this client flagged, what does the evidence say, and what
// should I do" without leaving the dashboard. Everything shown comes from data
// the dashboard already loaded (assessClientRisk flags + daily check-ins +
// nutrition plan/meal logs) plus the client's real Head Coach tasks/
// recommendations. Approve / Edit / Dismiss go through the SAME coach-decision
// route HeadCoachSection uses (approve / modify / reject) — no second approval
// path. With no Head Coach recommendation yet, the "recommended" box falls
// back to the rule-based flag actions and says so, never presenting
// rule-based advice as AI output.

const avg = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const fmt = (v, d = 0) => (v == null ? "—" : Number(v).toFixed(d));
const textareaStyle = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: 10, fontSize: 13, fontFamily: "inherit", outline: "none", borderRadius: RADIUS.md };

function Glance({ label, value, unit, sub, tone }) {
  return (
    <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone || S.text, marginTop: 2 }}>{value}<span style={{ fontSize: 12, color: S.muted }}>{unit}</span></div>
      {sub && <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function InterventionModal({ assessment, daily: dailyAll = [], nutCtx: nutAll, openClient, onClose }) {
  const { client, flags = [], loggingFlags = [], riskLevel, goalScore } = assessment;
  // Clients usually check in at the end of the day and the coach reads it the
  // next day, so every number here is "as of yesterday": today's (partial or
  // empty) day is left out instead of dragging the averages down.
  const asOf = yesterdayDate(), asOfStr = yesterdayStr();
  const daily = dailyAll.filter((r) => r.date <= asOfStr);
  const nutCtx = nutAll ? { ...nutAll, mealLogs: (nutAll.mealLogs || []).filter((m) => m.date <= asOfStr) } : nutAll;
  const adh = adherenceFrom(daily, 30, asOf);
  const [tab, setTab] = useState("overview");
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewNote, setReviewNote] = useState(null);
  const [body, setBody] = useState(null);

  const load = useCallback(async () => {
    const { data: tasks } = await supabase.from("head_coach_tasks").select("*").eq("client_id", client.id).eq("task_type", "REVIEW_CHECK_IN").order("created_at", { ascending: false }).limit(10);
    const ids = (tasks || []).map((t) => t.id);
    const { data: rows } = ids.length ? await supabase.from("head_coach_recommendations").select("*").in("task_id", ids) : { data: [] };
    setRecs((tasks || []).map((t) => ({ task: t, rec: (rows || []).find((r) => r.task_id === t.id) || null })).filter((x) => x.rec));
    setLoading(false);
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  // Body-composition inputs: height/age/sex from the profile row, waist and
  // tape measurements from weekly check-ins (same sources the client's own
  // Progress page uses).
  useEffect(() => {
    (async () => {
      const [{ data: prof }, { data: wk }] = await Promise.all([
        supabase.from("profiles").select("height_in,age,sex").eq("id", client.id).maybeSingle(),
        supabase.from("weekly_checkins").select("date,waist,chest,hips,arms").eq("client_id", client.id).order("date"),
      ]);
      setBody({ prof: prof || {}, weekly: wk || [] });
    })();
  }, [client.id]);

  // A "quick review": the existing Head Coach check-in review on the client's
  // latest daily check-in (rules + one bounded AI call, 28s cap) — same
  // pipeline and approval path as the Head Coach tab, just started from here.
  const runReview = async () => {
    setReviewing(true); setError(null); setReviewNote(null);
    try {
      const { data: latest } = await supabase.from("daily_checkins").select("id").eq("client_id", client.id).order("date", { ascending: false }).limit(1).maybeSingle();
      if (!latest) throw new Error("This client has no daily check-ins to review yet.");
      const res = await callHeadCoach({ checkin_id: latest.id });
      await load();
      if (res.task?.status && res.task.status !== "DECISION_READY") setReviewNote(`Review finished with status ${res.task.status}${res.safetyGate?.reason ? ` — ${res.safetyGate.reason}` : ""}.`);
    } catch (e) { setError(e.message); }
    setReviewing(false);
  };

  const pending = recs.find((x) => x.rec.status === "pending" && x.task.status === "DECISION_READY") || null;
  const output = pending?.rec.ai_output;

  const decide = async (decision, modification) => {
    setBusy(true); setError(null);
    try {
      await callHeadCoach({ recommendation_id: pending.rec.id, decision, modification: modification || undefined });
      setEditing(false);
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  // Primary issue = the most severe flag (red before amber); evidence = every
  // flag's detail plus any check-in logging gaps.
  const primary = flags.find((f) => f.tone === "red") || flags[0] || loggingFlags[0] || null;
  const evidence = [...flags, ...loggingFlags];
  const nextSteps = [...new Set(evidence.map((f) => f.action).filter(Boolean))];

  // Key data at a glance — only from real rows; "—" when there isn't any.
  const since30 = (() => { const d = new Date(asOf); d.setDate(d.getDate() - 29); return d.toISOString().split("T")[0]; })();
  const weights = daily.filter((r) => r.weight != null);
  const lastW = weights.length ? weights[weights.length - 1].weight : null;
  const recentW = weights.filter((r) => r.date >= since30);
  const wDelta = recentW.length >= 2 ? recentW[recentW.length - 1].weight - recentW[0].weight : null;
  const nutDays = mergeDailyNutrition(daily, nutCtx?.mealLogs).filter((r) => r.date >= since30);
  const avgProtein = avg(nutDays.filter((r) => r.protein_g != null).map((r) => r.protein_g));
  const avgCal = avg(nutDays.filter((r) => r.calories != null).map((r) => r.calories));
  const plan = nutCtx?.plan || null;

  const statusLabel = riskLevel === "High" ? "At Risk" : "Needs Attention";
  const statusTone = riskLevel === "High" ? "red" : "amber";

  const tabs = [{ key: "overview", label: "Overview" }, { key: "strength", label: "Strength" }, { key: "body", label: "Body" }, { key: "data", label: "Data" }, { key: "history", label: "History", badge: recs.length || null }];

  return (
    <Modal title="Needs Attention" onClose={onClose} width={720}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{client.name || client.email}</div>
          {client.goal && <div style={{ fontSize: 12, color: S.muted }}>{client.goal}</div>}
        </div>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div style={{ marginTop: 16 }}>
        {error && <div style={{ fontSize: 12, color: S.danger, marginBottom: 10 }}>{error}</div>}

        {tab === "overview" && (
          <>
            <div style={{ border: "1px solid " + (primary?.tone === "red" ? S.danger : S.warning), borderRadius: RADIUS.md, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: primary?.tone === "red" ? S.danger : S.warning, textTransform: "uppercase", letterSpacing: 1 }}>Primary issue</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{primary ? `${primary.label} — ${primary.detail}` : "Flagged for review."}</div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Evidence</div>
            <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
              {evidence.length ? evidence.map((f, i) => <li key={i}><b>{f.label}.</b> {f.detail}</li>) : <li>No specific flags — see the Data tab.</li>}
            </ul>

            <div style={{ border: "1px solid " + S.border, background: S.surface2, borderRadius: RADIUS.md, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: S.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Recommended intervention · {pending ? "Head Coach (AI)" : "Rule-based"}
              </div>
              {loading ? <div className="spinner" style={{ margin: "8px auto" }} /> : pending ? (
                <>
                  <div style={{ fontSize: 14 }}>{output?.recommendation || "—"}</div>
                  {output?.rationale && <div style={{ fontSize: 12, color: S.muted, marginTop: 6 }}>{output.rationale}</div>}
                  <div style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>Confidence: {output?.confidence_level || "—"}</div>
                  {editing ? (
                    <div style={{ marginTop: 10 }}>
                      <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} style={textareaStyle} />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <Btn sm onClick={() => decide("modify", { recommendation: editText })} disabled={busy || !editText.trim()}>Save &amp; Approve</Btn>
                        <Btn sm onClick={() => setEditing(false)} disabled={busy}>Cancel</Btn>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <Btn onClick={() => decide("approve")} disabled={busy}>Approve</Btn>
                      <Btn teal onClick={() => { setEditText(output?.recommendation || ""); setEditing(true); }} disabled={busy}>Edit</Btn>
                      <Btn danger onClick={() => decide("reject")} disabled={busy}>Dismiss</Btn>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {nextSteps.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{nextSteps.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  ) : <div style={{ fontSize: 13 }}>No suggested action from the rules.</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <Btn sm onClick={runReview} disabled={reviewing}>{reviewing ? "Reviewing…" : "Run quick review"}</Btn>
                    <span style={{ fontSize: 11, color: S.muted }}>Reviews the latest check-in and drafts a recommendation you can approve here.</span>
                  </div>
                  {reviewNote && <div style={{ fontSize: 12, color: S.warning, marginTop: 8 }}>{reviewNote}</div>}
                </>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Key data at a glance <span style={{ fontWeight: 400, color: S.muted }}>· as of yesterday ({asOfStr})</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              <Glance label="Weight" value={fmt(lastW, 1)} unit={lastW != null ? " lb" : ""} sub={wDelta != null ? `${wDelta > 0 ? "+" : ""}${wDelta.toFixed(1)} lb / 30d` : null} />
              <Glance label="Protein (avg)" value={fmt(avgProtein)} unit={avgProtein != null ? " g" : ""} sub={plan?.protein_g ? `Target ${plan.protein_g} g` : null} />
              <Glance label="Calories (avg)" value={fmt(avgCal)} sub={plan?.calories ? `Target ${plan.calories}` : null} />
              <Glance label="Training" value={adh ? adh.trainingRate : "—"} unit={adh ? "%" : ""} sub="check-ins with workout done" />
              <Glance label="Check-ins" value={adh ? adh.score : "—"} unit={adh ? "%" : ""} sub="days logged, 30d" />
              {goalScore?.overallScore != null && <Glance label="Goal score" value={goalScore.overallScore} unit="/100" sub={goalScore.classification} />}
            </div>
          </>
        )}

        {tab === "strength" && <StrengthTab profile={client} />}

        {tab === "body" && (() => {
          const prof = body?.prof || {};
          const wk = body?.weekly || [];
          const lastWk = (key) => { const r = [...wk].reverse().find((x) => x[key] != null); return r ? r[key] : null; };
          const firstWk = (key) => { const r = wk.find((x) => x[key] != null); return r ? r[key] : null; };
          const waist = lastWk("waist");
          const { pct, method } = estimateBodyComposition({ heightIn: Number(prof.height_in), weightLb: lastW, waistIn: waist, age: prof.age, sex: prof.sex });
          const cat = bodyFatCategory(pct, prof.age, prof.sex);
          return (
            <>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Weight trend</div>
            {weights.length >= 2 ? (
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weights.map((w) => ({ date: w.date.slice(5), weight: w.weight }))}>
                    <XAxis dataKey="date" tick={{ fill: S.muted, fontSize: 10 }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: S.muted, fontSize: 10 }} width={36} />
                    <Tooltip contentStyle={{ background: S.surface, border: "1px solid " + S.border, fontSize: 12 }} />
                    <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <div style={{ fontSize: 13, color: S.muted }}>Fewer than 2 weigh-ins — no trend yet.</div>}
              <div style={{ fontSize: 12, fontWeight: 700, margin: "16px 0 6px" }}>Body composition</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                <Glance label="Body fat (est.)" value={pct != null ? pct : "—"} unit={pct != null ? "%" : ""} sub={pct != null ? `${cat || ""}${method === "weight" ? " · from weight" : " · from waist"}` : "Needs weight, height, age and sex"} />
                {[["waist", "Waist"], ["chest", "Chest"], ["hips", "Hips"], ["arms", "Arms"]].map(([k, label]) => {
                  const cur = lastWk(k), first = firstWk(k);
                  return cur != null ? <Glance key={k} label={label} value={cur} unit=" in" sub={first != null && wk.filter((x) => x[k] != null).length > 1 ? `${cur - first > 0 ? "+" : ""}${(cur - first).toFixed(1)} in since first` : null} /> : null;
                })}
              </div>
              {method === "weight" && <div style={{ fontSize: 11, color: S.muted, marginTop: 8 }}>Estimated from weight — a waist measurement in a weekly check-in gives a more accurate number.</div>}
            </>
          );
        })()}

        {tab === "data" && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Recent check-ins</div>
            {daily.length === 0 ? <div style={{ fontSize: 13, color: S.muted }}>No check-ins in the last 8 weeks.</div> : (
              <div style={{ fontSize: 12 }}>
                {daily.slice(-7).reverse().map((r) => (
                  <div key={r.date} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: "1px solid " + S.border }}>
                    <span>{r.date}</span>
                    <span style={{ color: S.muted }}>{r.workout || "—"} · {r.diet || "—"}{r.weight != null ? ` · ${r.weight} lb` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          loading ? <div className="spinner" style={{ margin: "20px auto" }} /> : recs.length === 0 ? (
            <div style={{ fontSize: 13, color: S.muted }}>No Head Coach reviews for this client yet.</div>
          ) : recs.map(({ task, rec }) => (
            <div key={rec.id} style={{ borderTop: "1px solid " + S.border, padding: "10px 0", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: S.muted, fontSize: 11 }}>{new Date(task.created_at).toLocaleDateString()}</span>
                <StatusBadge label={rec.status} tone={rec.status === "pending" ? "amber" : rec.status === "rejected" ? "red" : "neutral"} />
              </div>
              <div style={{ marginTop: 4 }}>{rec.coach_modification?.recommendation || rec.ai_output?.recommendation || "—"}</div>
              {rec.coach_decision_note && <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>Note: {rec.coach_decision_note}</div>}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <Btn sm teal onClick={() => { onClose(); openClient(client.id); }}>Open Client →</Btn>
      </div>
    </Modal>
  );
}
