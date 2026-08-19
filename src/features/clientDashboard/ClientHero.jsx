import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId, todayStr } from "../../theme.jsx";
import { Card, Btn, ProgressRing } from "../../components/ui/index.js";

// Clamped so a program that's run past its planned length (or one whose
// start_date is in the future) never renders an impossible "Week 14 of 12" —
// it holds at the last real week instead.
function weekOf(startDate, weeks) {
  if (!startDate || !weeks) return null;
  const elapsed = Math.floor((new Date(todayStr()) - new Date(startDate)) / 86400000 / 7) + 1;
  return Math.max(1, Math.min(weeks, elapsed));
}

const STATUS_COPY = {
  "On Track": "You're on track. Keep pushing — results are coming.",
  Low: "Mostly on track — a small adjustment could help.",
  Medium: "A few things need attention this week.",
  High: "Let's get you back on track — check the details below.",
};

// Hero card: the coach's existing phase selection (programs.phase, unchanged
// mechanism) plus a real Week X of Y and the same risk assessment the coach
// sees, surfaced as a status ring instead of buried in plain text.
export function ClientHero({ profile, risk, goalScore, setPage }) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("programs").select("phase,phase_note,weeks,start_date")
      .eq("client_id", trainingOwnerId(profile)).order("created_at", { ascending: false })
      .limit(1).maybeSingle()
      .then(({ data }) => { setProgram(data || null); setLoading(false); });
  }, [profile.id, profile.shared_program_owner_id]);

  if (loading) return null;
  if (!program?.phase) return null;

  const week = weekOf(program.start_date, program.weeks);
  const ringValue = goalScore?.overallScore ?? risk?.adh?.score ?? 0;
  const statusText = risk?.flags?.[0]?.clientMessage || STATUS_COPY[risk?.riskLevel] || STATUS_COPY["On Track"];

  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 8 }}>Current Phase</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: S.text, lineHeight: 1 }}>{program.phase}</div>
        {week && program.weeks && (
          <div style={{ fontSize: 14, color: S.text, marginTop: 6 }}>
            Week <strong>{week}</strong> of {program.weeks}
          </div>
        )}
        {program.phase_note && <div style={{ fontSize: 13, color: S.muted, marginTop: 8, lineHeight: 1.6, maxWidth: 420 }}>{program.phase_note}</div>}
      </div>
      <ProgressRing value={ringValue} size={110} caption="ON TRACK" />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: risk?.riskLevel === "On Track" || !risk?.riskLevel ? S.success : risk?.riskLevel === "High" ? S.danger : S.warning, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          {risk?.riskLevel && risk.riskLevel !== "On Track" ? risk.riskLevel + " Risk" : "You're On Track"}
        </div>
        <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6, marginBottom: 14 }}>{statusText}</div>
        <Btn sm onClick={() => setPage("program")}>View Details</Btn>
      </div>
    </Card>
  );
}
