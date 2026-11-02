import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { buildCompletionRow } from "../../lib/workoutCompletion.js";
import { localDateStr } from "../../lib/dates.js";

const LOOKBACK_DAYS = 7;

// Days (before today) where the client logged sets but never tapped "Mark workout
// complete". A nudge only — logged sets don't prove a finished session, so we ask
// instead of assuming. One tap records the completion for that date.
export function UnconfirmedWorkoutsNotice({ profile, today }) {
  const [dates, setDates] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    const from = new Date(today + "T12:00:00"); from.setDate(from.getDate() - LOOKBACK_DAYS);
    const fromStr = localDateStr(from);
    const [logs, comps] = await Promise.all([
      supabase.from("workout_logs").select("date").eq("client_id", profile.id).gte("date", fromStr).lt("date", today),
      supabase.from("workout_completions").select("date").eq("client_id", profile.id).gte("date", fromStr).lt("date", today),
    ]);
    const done = new Set((comps.data || []).map((c) => c.date));
    setDates([...new Set((logs.data || []).map((l) => l.date))].filter((d) => !done.has(d)).sort());
  };
  useEffect(() => { load(); }, [profile.id, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async (date, status) => {
    setBusy(date);
    await supabase.from("workout_completions").upsert(buildCompletionRow({ clientId: profile.id, date, status }), { onConflict: "client_id,date", ignoreDuplicates: true });
    await load();
    setBusy(null);
  };

  if (!dates.length) return null;
  const label = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <Card style={{ marginBottom: 16, padding: "14px 20px", borderColor: S.warning }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Did you finish these workouts?</div>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>You logged sets on these days but didn't mark the session complete. Let your coach know how it went — one tap per day.</div>
      {dates.map((d) => (
        <div key={d} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid " + S.border, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13 }}>{label(d)}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <Btn sm teal onClick={() => confirm(d, "completed")} disabled={busy === d}>Finished it</Btn>
            <Btn sm onClick={() => confirm(d, "partial")} disabled={busy === d}>Only part</Btn>
          </span>
        </div>
      ))}
    </Card>
  );
}
