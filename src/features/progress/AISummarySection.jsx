import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, Btn, DayFolder } from "../../components/ui/index.js";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const monthLabel = (period) => { const [y,m] = (period||"").split("-"); return m ? `${MONTH_NAMES[+m-1]} ${y}` : period; };

export function ClientSummaries({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState("idle");   // idle | loading | error
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("client_summaries").select("*").eq("client_id", profile.id).order("period", { ascending: false });
    setRows(data || []); setLoading(false);
  }, [profile.id]);
  useEffect(() => { setErr(""); setGen("idle"); load(); }, [load]);

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
        <Btn onClick={generate} disabled={gen === "loading"}>{gen === "loading" ? "Generating..." : "Generate this month"}</Btn>
      </div>
      {err && <div style={{ color: "#ff6b5b", fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {loading ? <div className="spinner" style={{ margin: "20px auto" }} /> :
        rows.length === 0 ? <div style={{ color: S.muted, fontSize: 13 }}>No recaps yet. Generate this month's to start the history.</div> :
        rows.map((r, idx) => (
          <DayFolder key={r.id} title={monthLabel(r.period)} meta={(r.created_at || "").slice(0, 10)} defaultOpen={idx === 0}>
            <div style={{ fontSize: 13.5, color: S.text, opacity: 0.92, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{r.content}</div>
          </DayFolder>
        ))
      }
    </Card>
  );
}
