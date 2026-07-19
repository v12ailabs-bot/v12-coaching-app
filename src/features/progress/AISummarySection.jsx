import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, Btn, CollapsibleSection } from "../../components/ui/index.js";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const monthLabel = (period) => { const [y,m] = (period||"").split("-"); return m ? `${MONTH_NAMES[+m-1]} ${y}` : period; };

// Visible to both coach and client (client_summaries RLS: client reads own,
// coach reads all) — coachView only gates the "Generate" action, never the
// read access. All months start collapsed; a row's full `content` is fetched
// lazily on its first expand (not in the initial list load), then cached so
// re-toggling never re-fetches it.
export function ClientSummaries({ profile, coachView }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState("idle");   // idle | loading | error
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [content, setContent] = useState({});       // id -> content
  const [contentLoading, setContentLoading] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("client_summaries").select("id,period,created_at").eq("client_id", profile.id).order("period", { ascending: false });
    setRows(data || []); setLoading(false);
  }, [profile.id]);
  useEffect(() => { setErr(""); setGen("idle"); setExpanded(new Set()); setContent({}); load(); }, [load]);

  const toggle = async (row) => {
    const next = new Set(expanded);
    if (next.has(row.id)) { setExpanded(next); return; }
    next.add(row.id); setExpanded(next);
    if (content[row.id] != null) return;
    setContentLoading((prev) => new Set(prev).add(row.id));
    const { data } = await supabase.from("client_summaries").select("content").eq("id", row.id).maybeSingle();
    setContent((prev) => ({ ...prev, [row.id]: data?.content || "" }));
    setContentLoading((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
  };

  const generate = async () => {
    setGen("loading"); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ client_id: profile.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate a summary.");
      setGen("idle"); await load();
    } catch (e) { setErr(e.message); setGen("error"); }
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20 }}>AI Monthly Recaps</div>
          <div style={{ fontSize: 11, color: S.muted }}>Generated from this client's last 30 days of logs. Saved by month — one recap per month.</div>
        </div>
        {coachView && <Btn onClick={generate} disabled={gen === "loading"}>{gen === "loading" ? "Generating..." : "Generate this month"}</Btn>}
      </div>
      {coachView && err && <div style={{ color: "#ff6b5b", fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {loading ? <div className="spinner" style={{ margin: "20px auto" }} /> :
        rows.length === 0 ? <div style={{ color: S.muted, fontSize: 13 }}>No recaps yet{coachView ? " — generate this month's to start the history." : "."}</div> :
        rows.map((r) => (
          <CollapsibleSection key={r.id} title={monthLabel(r.period)} summary={(r.created_at || "").slice(0, 10)}
            expanded={expanded.has(r.id)} onToggle={() => toggle(r)}>
            {contentLoading.has(r.id)
              ? <div className="spinner" style={{ margin: "10px auto" }} />
              : <div style={{ fontSize: 13.5, color: S.text, opacity: 0.92, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{content[r.id]}</div>}
          </CollapsibleSection>
        ))
      }
    </Card>
  );
}
