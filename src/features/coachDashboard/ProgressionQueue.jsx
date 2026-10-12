import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS } from "../../theme.jsx";
import { Card, StatusBadge, Btn } from "../../components/ui/index.js";
import { METHODS } from "../../lib/progression/methods.js";
import { ProgressionPanel } from "../clientDetail/sections/ProgressionPanel.jsx";

// Progression review queue: every exercise (across clients) that has a calculated
// progression method and a logged session nobody has evaluated yet, plus every
// recommendation waiting for your decision. Open a row to run the engine and
// approve / edit / reject it in place (the same panel as Workout Review).
// "Evaluated" = a recommendation exists for the exercise's latest session.
const DAY = 86400000;

export function ProgressionQueue() {
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState([]);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const { data: exs } = await supabase.from("exercises").select("*").not("progression_method", "is", null).is("retired_at", null);
    const calculated = (exs || []).filter((e) => METHODS[e.progression_method]?.status === "calculated");
    const ids = calculated.map((e) => e.id);
    if (!ids.length) { setRows([]); setPending([]); return; }
    const since = new Date(Date.now() - 28 * DAY).toISOString().slice(0, 10);
    const [{ data: logs }, { data: recs }, { data: profs }] = await Promise.all([
      supabase.from("workout_logs").select("*").in("exercise_id", ids).gte("date", since).order("date"),
      supabase.from("progression_recommendations").select("id,exercise_id,session_date,status,method_id,calc_result,client_id").in("exercise_id", ids).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,name").in("id", [...new Set(calculated.map((e) => e.client_id))]),
    ]);
    const name = Object.fromEntries((profs || []).map((p) => [p.id, p.name]));
    const logsBy = {}; (logs || []).forEach((l) => { (logsBy[l.exercise_id] = logsBy[l.exercise_id] || []).push(l); });
    const latestRec = {}; (recs || []).forEach((r) => { if (!latestRec[r.exercise_id] || r.session_date > latestRec[r.exercise_id]) latestRec[r.exercise_id] = r.session_date; });
    const due = calculated.map((e) => {
      const ls = logsBy[e.id] || [];
      const last = ls.length ? ls[ls.length - 1].date : null;
      return { e, logs: ls, last, client: name[e.client_id] || "Client" };
    }).filter((x) => x.last && !(latestRec[x.e.id] && latestRec[x.e.id] >= x.last)).sort((a, b) => (a.last < b.last ? 1 : -1));
    const exById = Object.fromEntries(calculated.map((e) => [e.id, e]));
    setRows(due);
    setPending((recs || []).filter((r) => r.status === "pending").map((r) => ({ ...r, ex: exById[r.exercise_id], client: name[r.client_id] || "Client" })));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (rows === null) return <div className="spinner" style={{ margin: "40px auto" }} />;
  return (
    <div>
      <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6, marginBottom: 14 }}>
        Sessions your clients logged that haven't been run through their progression rule yet, and recommendations waiting on you. Nothing changes for a client until you approve.
      </div>

      {pending.length > 0 && (
        <Card>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 10 }}>Waiting for your decision ({pending.length})</div>
          {pending.map((r) => (
            <div key={r.id} style={{ padding: "8px 0", borderTop: "1px solid " + S.border }}>
              <div onClick={() => setOpen(open === "p" + r.id ? null : "p" + r.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div><b style={{ fontSize: 13 }}>{r.client}</b> <span style={{ fontSize: 13 }}>· {r.ex?.name}</span><div style={{ fontSize: 11, color: S.muted }}>{METHODS[r.method_id]?.name || r.method_id} · session {r.session_date}</div></div>
                <StatusBadge label={r.calc_result?.status?.replace(/_/g, " ") || "pending"} tone="amber" />
              </div>
              {open === "p" + r.id && r.ex && <div style={{ marginTop: 8 }}><ProgressionPanel exercise={r.ex} clientId={r.client_id} logs={[]} /></div>}
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 10 }}>Ready to review ({rows.length})</div>
        {rows.length === 0 ? <div style={{ fontSize: 13, color: S.success }}>All caught up — every logged session has been evaluated.</div> : rows.map(({ e, logs, last, client }) => (
          <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid " + S.border }}>
            <div onClick={() => setOpen(open === e.id ? null : e.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{client}</b> <span style={{ fontSize: 13 }}>· {e.name}</span>
                <div style={{ fontSize: 11, color: S.muted }}>{METHODS[e.progression_method]?.name} · last session {last}{e.prescribed_weight ? ` · target ${e.prescribed_weight} lb` : ""}</div>
              </div>
              <Btn sm teal onClick={(ev) => { ev.stopPropagation(); setOpen(open === e.id ? null : e.id); }}>{open === e.id ? "Close" : "Review"}</Btn>
            </div>
            {open === e.id && <div style={{ marginTop: 8 }}><ProgressionPanel exercise={e} clientId={e.client_id} logs={logs} /></div>}
          </div>
        ))}
      </Card>
      <Btn sm onClick={load}>Refresh</Btn>
    </div>
  );
}
