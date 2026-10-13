import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, CardTitle, Fld, Inp, Btn, Alert } from "../../components/ui/index.js";
import { todayStr } from "../../lib/dates.js";

// Quick weight + waist entry for Program Only clients, on Home and Progress
// where they actually look. Writes the same daily_checkins row the Habits page's
// Body Metrics box writes (weight/waist only), so both always agree.
export function BodyMetricsCard({ profile, onSaved }) {
  const today = todayStr();
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from("daily_checkins").select("weight,waist").eq("client_id", profile.id).eq("date", today).maybeSingle()
      .then(({ data }) => { setWeight(data?.weight ?? ""); setWaist(data?.waist ?? ""); });
  }, [profile.id, today]);

  const save = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from("daily_checkins").upsert(
      { client_id: profile.id, date: today, weight: weight === "" ? null : parseFloat(weight), waist: waist === "" ? null : parseFloat(waist) },
      { onConflict: "client_id,date" }
    );
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    onSaved && onSaved();
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardTitle>Log Weight & Waist · Today</CardTitle>
      <Alert variant="error">{err}</Alert>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 120px" }}><Fld label="Bodyweight (lb)"><Inp type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="lb" /></Fld></div>
        <div style={{ flex: "1 1 120px" }}><Fld label="Waist (in)"><Inp type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="inches" /></Fld></div>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <Btn onClick={save} disabled={busy || (weight === "" && waist === "")}>{busy ? "Saving..." : "Save"}</Btn>
          {saved && <span style={{ color: S.accent2, fontSize: 12, fontWeight: 600 }}>Saved!</span>}
        </div>
      </div>
    </Card>
  );
}
