import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId } from "../../theme.jsx";
import { PageTitle, Card } from "../../components/ui/index.js";
import { JOURNEY_STEPS, JOURNEY_LENGTH_DAYS, daysSinceStart, currentJourneyStepIndex, journeyStepStatus, isStepDataComplete } from "../../lib/v12Journey.js";
import { ONBOARDING_TASK_DEFS, fetchOnboardingTasks, isTaskActive, tasksByKey, onboardingComplete } from "../../lib/onboardingTasks.js";

// Plain-language status for a client reading their own Day-0 gate -- no
// "coach review" jargon, just "what's happening right now" per spec Part 15.
function dayZeroStatusLine(def, task, active) {
  if (task.status === "completed") return "Complete";
  if (def.owner === "client") return active ? "Your turn" : "Not yet started";
  return active ? "Your coach is reviewing your information" : "Waiting on the step before this";
}

// Full-page version of the first-30-days onboarding journey (see
// V12RoadmapCard for the home preview). Every step is always visible as an
// overview per spec, but only the current/completed steps expand with their
// "why" and focus areas -- upcoming steps stay collapsed rather than
// revealing content out of order.
export function V12RoadmapPage({ profile }) {
  const [startDate, setStartDate] = useState(undefined);
  const [onboardingTasks, setOnboardingTasks] = useState(null);
  const [checkinWeeks, setCheckinWeeks] = useState(null);

  useEffect(() => {
    supabase.from("programs").select("start_date").eq("client_id", trainingOwnerId(profile))
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setStartDate(data?.start_date || (profile.created_at || "").slice(0, 10) || null));
  }, [profile.id, profile.shared_program_owner_id]);

  useEffect(() => { fetchOnboardingTasks(profile.id).then(setOnboardingTasks); }, [profile.id]);

  useEffect(() => {
    supabase.from("weekly_checkins").select("week_number").eq("client_id", trainingOwnerId(profile)).not("week_number", "is", null)
      .then(({ data }) => setCheckinWeeks(new Set((data || []).map((w) => w.week_number).filter((n) => n != null))));
  }, [profile.id, profile.shared_program_owner_id]);

  if (startDate === undefined || !onboardingTasks || !checkinWeeks) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const ctx = { onboardingDone: onboardingComplete(onboardingTasks), checkinWeeks };
  const day = daysSinceStart(startDate);
  const dayClamped = day == null ? 0 : Math.max(0, Math.min(day, JOURNEY_LENGTH_DAYS));
  const currentIndex = currentJourneyStepIndex(dayClamped);
  const pct = Math.round((dayClamped / JOURNEY_LENGTH_DAYS) * 100);
  const journeyOver = day != null && day > JOURNEY_LENGTH_DAYS;

  return (
    <div>
      <PageTitle title="Your V12 Roadmap" sub="30-Day Client Journey" />

      {journeyOver ? (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: S.text, lineHeight: 1.7 }}>
            You've completed your first 30 days. Your coach has moved you into your ongoing training phases — see your Program Roadmap on Home for what's next.
          </div>
        </Card>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: S.muted, marginBottom: 6 }}>
            <span>Day {dayClamped} of {JOURNEY_LENGTH_DAYS}</span>
            <span>{pct}% Complete</span>
          </div>
          <div style={{ height: 6, background: S.border, borderRadius: 3, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ height: "100%", width: pct + "%", background: S.success, borderRadius: 3 }} />
          </div>
        </>
      )}

      {JOURNEY_STEPS.map((step, i) => {
        const status = journeyStepStatus(i, currentIndex, isStepDataComplete(step, ctx));
        const expanded = status === "current" || status === "done" || status === "behind" || journeyOver;
        return (
          <Card key={step.key} style={{ marginBottom: 14, opacity: status === "upcoming" && !journeyOver ? 0.65 : 1, border: "1px solid " + (status === "current" ? S.accent : status === "behind" ? S.warning : S.border) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14,
                background: status === "done" ? S.success : status === "current" ? "rgba(255,106,0,.16)" : status === "behind" ? "rgba(250,204,21,.16)" : "transparent",
                color: status === "done" ? "#0B0B0D" : status === "current" ? S.accent : status === "behind" ? S.warning : S.muted,
                border: status === "current" ? "2px solid " + S.accent : status === "behind" ? "2px solid " + S.warning : "1px solid " + S.border,
              }}>
                {status === "done" ? "✓" : status === "behind" ? "!" : i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20 }}>{step.label} — {step.title}</div>
                <div style={{ fontSize: 11, color: S.muted }}>{step.dayStart === step.dayEnd ? `Day ${step.dayStart}` : `Days ${step.dayStart}–${step.dayEnd}`}</div>
              </div>
              {status === "current" && <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.accent, fontWeight: 700, flexShrink: 0 }}>Current</span>}
              {status === "behind" && <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.warning, fontWeight: 700, flexShrink: 0 }}>Incomplete</span>}
            </div>
            {expanded && (
              <>
                <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6, marginTop: 12 }}>{step.why}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {step.focus.map((f) => (
                    <span key={f} style={{ fontSize: 11, color: S.muted, border: "1px solid " + S.border, borderRadius: 20, padding: "4px 10px" }}>{f}</span>
                  ))}
                </div>
                {step.key === "day0" && onboardingTasks && !onboardingComplete(onboardingTasks) && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + S.border }}>
                    {(() => { const byKey = tasksByKey(onboardingTasks); return ONBOARDING_TASK_DEFS.map((def) => {
                      const task = byKey[def.key];
                      if (!task) return null;
                      const active = isTaskActive(task, byKey);
                      return (
                        <div key={def.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", opacity: active || task.status === "completed" ? 1 : 0.5 }}>
                          <span style={{ fontSize: 12, color: S.text }}>{def.clientLabel || def.coachLabel}</span>
                          <span style={{ fontSize: 12, color: task.status === "completed" ? S.success : S.muted, fontWeight: 600 }}>
                            {dayZeroStatusLine(def, task, active)}
                          </span>
                        </div>
                      );
                    }); })()}
                  </div>
                )}
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
