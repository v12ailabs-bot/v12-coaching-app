import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId, todayStr } from "../../theme.jsx";
import { Card, Btn, ProgressRing } from "../../components/ui/index.js";
import { totalWeeksFromPhases } from "../../components/ProgramRoadmap.jsx";
import { computeBMI, bmiCategory } from "../../lib/bmi.js";

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

// Hero card: current phase + status ring (was ClientHero) merged with the
// weight/BMI/photo snapshot (was the standalone ProgressSnapshot card) into
// one card, per the mobile mockup's density — both sections drove the same
// "View Progress" destination, so they now share one button instead of two.
// Neither section requires the other: a client with no phase set yet still
// sees their weight snapshot, and vice versa.
export function ClientHero({ profile, risk, goalScore, checkins, setPage }) {
  const [program, setProgram] = useState(null);
  const [totalWeeks, setTotalWeeks] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("programs").select("id,phase,phase_note,weeks,start_date")
      .eq("client_id", trainingOwnerId(profile)).order("created_at", { ascending: false })
      .limit(1).maybeSingle()
      .then(async ({ data }) => {
        setProgram(data || null);
        // The program's real length comes from the coach's own roadmap
        // (program_phases), not the separate programs.weeks number, which
        // can silently drift out of sync with it — e.g. a coach plans a
        // 6-month/24-week roadmap one phase at a time while programs.weeks
        // is still whatever the last AI generation defaulted it to (12).
        if (data?.id) {
          const { data: phases } = await supabase.from("program_phases").select("week_end").eq("program_id", data.id);
          setTotalWeeks(totalWeeksFromPhases(phases, data.weeks));
        } else {
          setTotalWeeks(data?.weeks ?? null);
        }
        setLoading(false);
      });
  }, [profile.id, profile.shared_program_owner_id]);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("progress_photos").select("path,taken_on")
        .eq("client_id", profile.id).order("taken_on", { ascending: false }).limit(1);
      const row = rows?.[0];
      if (row) {
        const { data: signed } = await supabase.storage.from("progress-photos").createSignedUrl(row.path, 3600);
        setPhoto({ ...row, url: signed?.signedUrl });
      }
    })();
  }, [profile.id]);

  if (loading) return null;

  const hasPhase = !!program?.phase;
  const weights = checkins.filter((c) => c.weight != null);
  const latestWeight = weights.length ? weights[weights.length - 1].weight : null;
  const weekAgo = weights.length ? weights.find((w) => w.date <= weights[weights.length - 1].date && new Date(weights[weights.length - 1].date) - new Date(w.date) >= 6 * 86400000) : null;
  const delta = latestWeight != null && weekAgo ? +(latestWeight - weekAgo.weight).toFixed(1) : null;
  const bmi = profile.client_type === "coaching" ? computeBMI(profile.height_in, latestWeight) : null;
  const hasSnapshot = latestWeight != null || photo?.url;

  if (!hasPhase && !hasSnapshot) return null;

  const week = hasPhase ? weekOf(program.start_date, totalWeeks) : null;
  const status = hasPhase ? deriveStatus(risk, goalScore) : null;
  const ringValue = !status ? 0 : status.label === "Not Enough Data" ? 0 : (goalScore?.overallScore ?? risk?.adh?.score ?? 0);
  const statusText = status && status.label === "Behind" && risk?.flags?.[0]?.clientMessage
    ? risk.flags[0].clientMessage
    : status ? STATUS_MESSAGE[status.label] : null;
  const statusColor = status ? TONE_COLOR[status.tone] : S.muted;

  return (
    <Card>
      {hasPhase && (
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 8 }}>Current Phase</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: S.text, lineHeight: 1 }}>{program.phase}</div>
            {week && totalWeeks && (
              <div style={{ fontSize: 13, color: S.text, marginTop: 6 }}>
                Week <strong>{week}</strong> of {totalWeeks}
              </div>
            )}
            {program.phase_note && <div style={{ fontSize: 12, color: S.muted, marginTop: 8, lineHeight: 1.6 }}>{program.phase_note}</div>}
          </div>
          <ProgressRing value={ringValue} size={92} color={statusColor} caption={status.label.toUpperCase()} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: statusColor, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              {status.label === "On Track" ? "You're On Track" : status.label === "Ahead" ? "You're Ahead" : status.label === "Not Enough Data" ? "Not Enough Data Yet" : (risk?.riskLevel ? risk.riskLevel + " Risk" : "Behind")}
            </div>
            <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6 }}>{statusText}</div>
          </div>
        </div>
      )}

      {hasSnapshot && (
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", marginTop: hasPhase ? 16 : 0, paddingTop: hasPhase ? 16 : 0, borderTop: hasPhase ? "1px solid " + S.border : "none" }}>
          {latestWeight != null && (
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Weight</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, lineHeight: 1 }}>{latestWeight}<span style={{ fontSize: 12, color: S.muted }}> lbs</span></div>
              {delta != null && (
                <div style={{ fontSize: 11, marginTop: 4, color: delta < 0 ? S.success : delta > 0 ? S.danger : S.muted }}>
                  {delta === 0 ? "No change" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} lbs this week`}
                </div>
              )}
            </div>
          )}
          {bmi != null && (
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>BMI (est.)</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, lineHeight: 1 }}>{bmi}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: S.muted }}>{bmiCategory(bmi)}</div>
            </div>
          )}
          {photo?.url && (
            <img src={photo.url} alt="Latest progress" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid " + S.border }} />
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}><Btn sm onClick={() => setPage("progress")}>View Progress</Btn></div>
    </Card>
  );
}
