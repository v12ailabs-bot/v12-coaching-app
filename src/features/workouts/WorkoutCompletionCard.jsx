import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, Btn } from "../../components/ui/index.js";
import { buildCompletionRow } from "../../lib/workoutCompletion.js";

// "I finished this workout" — an explicit, one-per-day confirmation. Logging
// sets does not complete a workout; only this button (or the Today check-in's
// Workout answer) does. An existing record is never overwritten.
export function WorkoutCompletionCard({ profile, date, dayLabel, dayOfWeek, setsLoggedToday, refreshKey }) {
  const [completion, setCompletion] = useState(undefined); // undefined = loading
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    supabase.from("workout_completions").select("*").eq("client_id", profile.id).eq("date", date).maybeSingle()
      .then(({ data }) => { if (live) setCompletion(data || null); });
    return () => { live = false; };
  }, [profile.id, date, refreshKey]);

  const submit = async (status) => {
    setBusy(true); setError("");
    // ignoreDuplicates => INSERT … ON CONFLICT DO NOTHING: a second tap (or a
    // second device) can never overwrite the first record.
    const { error: err } = await supabase.from("workout_completions")
      .upsert(buildCompletionRow({ clientId: profile.id, date, dayOfWeek, status, note, setsLogged: setsLoggedToday }), { onConflict: "client_id,date", ignoreDuplicates: true });
    if (err) setError(err.message);
    const { data } = await supabase.from("workout_completions").select("*").eq("client_id", profile.id).eq("date", date).maybeSingle();
    setCompletion(data || null);
    setBusy(false);
  };

  if (completion === undefined) return null;
  if (completion) {
    return (
      <Card style={{ marginBottom: 16, padding: "14px 20px", borderColor: S.accent2 }}>
        <div style={{ color: S.accent2, fontWeight: 700, fontSize: 14 }}>
          ✓ Workout {completion.status === "partial" ? "partly completed" : "completed"}{completion.day_of_week ? ` · ${dayLabel || completion.day_of_week}` : ""}
        </div>
        {completion.note && <div style={{ fontSize: 12, color: S.muted, marginTop: 4 }}>{completion.note}</div>}
      </Card>
    );
  }
  return (
    <Card style={{ marginBottom: 16, padding: "14px 20px" }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Finished {dayLabel || "today's workout"}?</div>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>
        {setsLoggedToday ? `${setsLoggedToday} set${setsLoggedToday > 1 ? "s" : ""} logged today. ` : ""}Logging sets doesn't finish the workout — tap below when you're done so your coach sees it accurately.
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note for your coach (how it felt, what you skipped…)"
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 13, outline: "none", marginBottom: 10 }} />
      {error && <div style={{ color: S.danger, fontSize: 12, marginBottom: 8 }}>Couldn't save: {error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn teal onClick={() => submit("completed")} disabled={busy}>{busy ? "Saving…" : "✓ Mark workout complete"}</Btn>
        <Btn sm onClick={() => submit("partial")} disabled={busy}>I did part of it</Btn>
      </div>
    </Card>
  );
}
