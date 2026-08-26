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

// Derives the client-facing status word from real data only — never a
// hardcoded positive default. `risk.last == null` means the client has no
// check-in history at all, so there's nothing to judge yet regardless of
// what the (necessarily flag-free) risk assessment says. When a weight goal
// exists, its pace (goalScore.progressRatio, uncapped unlike `score`) can
// show genuine "Ahead" — something the flag-based risk level alone can't
// express, since severity only ever measures how far behind, not how far
// ahead.
function deriveStatus(risk, goalScore) {
  if (!risk?.last) return { label: "Not Enough Data", tone: "neutral" };
  if (goalScore) {
    if (goalScore.classification === "Gathering Data") return { label: "Not Enough Data", tone: "neutral" };
    if (goalScore.progressRatio != null && goalScore.progressRatio >= 1.1) return { label: "Ahead", tone: "positive" };
    if (goalScore.classification === "On Track") return { label: "On Track", tone: "positive" };
    return { label: "Behind", tone: goalScore.classification === "Off Track" ? "negative" : "warning" };
  }
  if (risk.riskLevel === "On Track") return { label: "On Track", tone: "positive" };
  if (risk.riskLevel === "High") return { label: "Behind", tone: "negative" };
  if (risk.riskLevel === "Medium" || risk.riskLevel === "Low") return { label: "Behind", tone: "warning" };
  return { label: "Not Enough Data", tone: "neutral" };
}

const STATUS_MESSAGE = {
  Ahead: "You're ahead of pace — great work, keep it up.",
  "On Track": "You're on track. Keep pushing — results are coming.",
  Behind: "Let's get you back on track — check the details below.",
  "Not Enough Data": "Log a few check-ins so we can start tracking your progress.",
};

const TONE_COLOR = { positive: S.success, warning: S.warning, negative: S.danger, neutral: S.muted };

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
  const status = deriveStatus(risk, goalScore);
  const ringValue = status.label === "Not Enough Data" ? 0 : (goalScore?.overallScore ?? risk?.adh?.score ?? 0);
  const statusText = status.label === "Behind" && risk?.flags?.[0]?.clientMessage
    ? risk.flags[0].clientMessage
    : STATUS_MESSAGE[status.label];
  const statusColor = TONE_COLOR[status.tone];

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
      <ProgressRing value={ringValue} size={110} color={statusColor} caption={status.label.toUpperCase()} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: statusColor, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          {status.label === "On Track" ? "You're On Track" : status.label === "Ahead" ? "You're Ahead" : status.label === "Not Enough Data" ? "Not Enough Data Yet" : (risk?.riskLevel ? risk.riskLevel + " Risk" : "Behind")}
        </div>
        <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6, marginBottom: 14 }}>{statusText}</div>
        <Btn sm onClick={() => setPage("progress")}>View Details</Btn>
      </div>
    </Card>
  );
}
