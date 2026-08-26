import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { PageTitle, Card, CardTitle, Btn } from "../../components/ui/index.js";
import { TodayWorkoutPreview } from "./TodayWorkoutPreview.jsx";
import { IntakeForm } from "../auth/IntakeForm.jsx";

// Onboarding checklist (spec Section 14) — same "N of M completed" card
// language used elsewhere in the app. Non-blocking: a Starter client can
// always use the rest of the app regardless of checklist state, since
// "pick a workout or challenge" can't be completed yet (the Starter Notion
// content library isn't wired up — see Section 8) and permanently gating
// onboarding on an impossible step would just trap every Starter user.
// Stops rendering once every AVAILABLE step is done, rather than sitting
// forever at "2 of 3" with no way to reach 3.
function OnboardingChecklist({ profile, hasSchedule, setPage }) {
  const steps = [
    { key: "schedule", label: "Set your schedule", done: hasSchedule, action: () => setPage("schedule") },
    { key: "library", label: "Visit the Library", done: !!profile.library_visited_at, action: () => setPage("resources") },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card style={{ borderLeft: "3px solid " + S.accent }}>
      <CardTitle>Get Started <span style={{ fontWeight: 400, color: S.muted, textTransform: "none", letterSpacing: 0 }}>({doneCount} of {steps.length} completed)</span></CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14, lineHeight: 1.6 }}>
        Picking a Starter workout or challenge is coming soon — your coach is still finishing that library. In the meantime:
      </div>
      {steps.map((s) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid " + S.border }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: s.done ? S.neon : "transparent", color: s.done ? "#0A0A0B" : S.muted, border: s.done ? "none" : "1px solid " + S.border }}>
            {s.done ? "✓" : ""}
          </div>
          <span style={{ flex: 1, fontSize: 14, color: s.done ? S.text : S.muted }}>{s.label}</span>
          {!s.done && <Btn sm onClick={s.action}>Go</Btn>}
        </div>
      ))}
    </Card>
  );
}

// Starter's own expiration screen (spec 9H) — deliberately not the generic
// access_until lockout used elsewhere: the account/history stays fully
// intact and usable again immediately on a real re-purchase, so this offers
// three real paths instead of just "reach out to the coach."
export function StarterExpiredScreen({ profile, logout }) {
  const [restarting, setRestarting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [applying, setApplying] = useState(false);

  const restartStarter = async () => {
    setRestarting(true); setMsg(null);
    try {
      const r = await fetch("/api/starter-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: profile.email }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      setMsg(data.error || "Starter checkout isn't live yet — check back soon.");
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setRestarting(false);
    }
  };

  if (applying) {
    return (
      <Card style={{ maxWidth: 560, margin: "40px auto 0" }}>
        <CardTitle>Apply for Coaching</CardTitle>
        <IntakeForm requestedTier="Coaching" onDone={() => setApplying(false)} />
      </Card>
    );
  }

  return (
    <Card style={{ textAlign: "center", padding: 48, marginTop: 40, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ fontSize: 36, marginBottom: 14 }}>⚡</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, marginBottom: 10 }}>Starter — Expired</div>
      <div style={{ color: S.muted, fontSize: 14, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 26px" }}>
        Your 30 days ended on {profile.starter_expires_at}. Nothing was deleted — your workout history, logged weights, and Library activity are all still here.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto" }}>
        <Btn onClick={restartStarter} disabled={restarting}>{restarting ? "Please wait..." : "Restart Starter — $15 / 30 days"}</Btn>
        <button disabled style={{ padding: 14, fontSize: 13, fontWeight: 600, background: "transparent", border: "1px solid " + S.border, color: S.muted, cursor: "not-allowed" }}>
          Upgrade to Program — $47/mo (coming soon)
        </button>
        <button onClick={() => setApplying(true)} style={{ padding: 14, fontSize: 13, fontWeight: 600, background: "transparent", border: "1px solid " + S.border, color: S.text, cursor: "pointer" }}>
          Apply for Coaching
        </button>
      </div>
      {msg && <div style={{ color: S.accent, fontSize: 12, marginTop: 16 }}>{msg}</div>}
      {logout && <div onClick={logout} style={{ color: S.muted, fontSize: 12, cursor: "pointer", marginTop: 20 }}>Log out</div>}
    </Card>
  );
}

export function StarterHome({ profile, setPage, goToWorkouts }) {
  const [hasSchedule, setHasSchedule] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("scheduled_workouts").select("id", { count: "exact", head: true }).eq("client_id", profile.id)
      .then(({ count }) => { setHasSchedule((count || 0) > 0); setLoading(false); });
  }, [profile.id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  return (
    <div>
      <PageTitle title={"Welcome, " + ((profile.name || "").split(" ")[0] || "there") + "."} sub="Starter — 30 days of access" />
      <OnboardingChecklist profile={profile} hasSchedule={hasSchedule} setPage={setPage} />
      <TodayWorkoutPreview profile={profile} onViewFull={() => goToWorkouts("today")} />
    </div>
  );
}
