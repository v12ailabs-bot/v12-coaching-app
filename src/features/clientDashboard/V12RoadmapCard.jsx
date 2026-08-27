import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";
import { JOURNEY_STEPS, JOURNEY_LENGTH_DAYS, daysSinceStart, currentJourneyStepIndex, journeyStepStatus, isStepDataComplete, fetchJourneyContext } from "../../lib/v12Journey.js";

// Compact home preview of the client's first-30-days onboarding journey --
// distinct from ProgramRoadmapCard (the coach's long-term phase plan).
// Renders nothing once the journey is over (day 30+) or hasn't started yet
// (no start date on record), so it doesn't linger as clutter past onboarding.
export function V12RoadmapCard({ profile, setPage }) {
  const [startDate, setStartDate] = useState(undefined);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    supabase.from("programs").select("start_date").eq("client_id", trainingOwnerId(profile))
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setStartDate(data?.start_date || (profile.created_at || "").slice(0, 10) || null));
  }, [profile.id, profile.shared_program_owner_id]);

  useEffect(() => { fetchJourneyContext(trainingOwnerId(profile)).then(setCtx); }, [profile.id, profile.shared_program_owner_id]);

  if (startDate === undefined || !ctx) return null;
  const day = daysSinceStart(startDate);
  if (day == null || day < 0 || day > JOURNEY_LENGTH_DAYS) return null;

  const currentIndex = currentJourneyStepIndex(day);
  const pct = Math.min(100, Math.round((day / JOURNEY_LENGTH_DAYS) * 100));

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <CardTitle>Your V12 Roadmap</CardTitle>
        <span style={{ fontSize: 11, color: S.muted }}>Day {day} of {JOURNEY_LENGTH_DAYS}</span>
      </div>
      <div style={{ height: 4, background: S.border, borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: S.success, borderRadius: 2 }} />
      </div>
      {JOURNEY_STEPS.map((step, i) => {
        const status = journeyStepStatus(i, currentIndex, isStepDataComplete(step, ctx));
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
              background: status === "done" ? S.success : status === "current" ? "rgba(255,106,0,.16)" : status === "behind" ? "rgba(250,204,21,.16)" : "transparent",
              border: status === "current" ? "2px solid " + S.accent : status === "behind" ? "2px solid " + S.warning : "1px solid " + S.border,
            }} />
            <span style={{ fontSize: 13, color: status === "upcoming" ? S.muted : S.text, fontWeight: status === "current" ? 700 : 500, flex: 1 }}>
              {step.label} — {step.title}
            </span>
            {status === "current" && <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.accent, fontWeight: 700 }}>Current</span>}
            {status === "behind" && <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.warning, fontWeight: 700 }}>Incomplete</span>}
          </div>
        );
      })}
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("v12roadmap")}>View Full Roadmap</Btn></div>
    </Card>
  );
}
