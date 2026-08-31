import { S } from "../../theme.jsx";
import { PageTitle } from "../../components/ui/index.js";
import { V12RoadmapCard } from "./V12RoadmapCard.jsx";

// Replaces the old per-client Notion dashboard link with an in-app page —
// same evergreen reference a client can revisit any time, not a one-time
// gate (that's ClientWelcome, shown once at first login). Trimmed to the
// philosophy/expectations blurb only — the onboarding checklist and "what
// happens next" steps in ClientWelcome are onboarding-specific and don't
// belong in a page meant to stay relevant for the life of the account.
const PILLARS = [
  ["LOOK GOOD", "Bodybuilding volume for the physique — sarcoplasmic fullness and size."],
  ["MOVE GOOD", "Athletic conditioning and explosive power — work capacity that carries over to life."],
  ["PERFORM GOOD", "Powerlifting strength for a nervous system that recruits everything you've got."],
];

export function ClientDashboardPage({ profile, setPage }) {
  const programOnly = profile.client_type === "program_only";

  return (
    <div>
      <PageTitle title="Dashboard" sub="The V12 philosophy — and what to expect" />

      <div style={{ position: "relative", overflow: "hidden", border: "1px solid " + S.border, background: S.surface, padding: "40px 32px", marginBottom: 24 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 0%, rgba(198,255,0,.14) 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(255,106,0,.10) 0%, transparent 50%)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: S.neon, marginBottom: 12 }}>V12 Performance Systems</div>
          <div style={{ fontSize: 15, color: S.text, opacity: 0.9, maxWidth: 620, lineHeight: 1.7 }}>
            V12 is one hybrid system that builds the powerlifter's strength, the bodybuilder's physique, and the
            athlete's engine — at the same time. You'll <span style={{ color: S.neon, fontWeight: 700 }}>look good, move good, and perform good</span>, all at once.
          </div>
        </div>
      </div>

      <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {PILLARS.map(([title, body]) => (
          <div key={title} style={{ background: S.surface, border: "1px solid " + S.border, borderTop: "2px solid " + S.neon, padding: 22 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: S.neon, letterSpacing: 1 }}>{title}</div>
            <div style={{ fontSize: 13, color: S.muted, marginTop: 8, lineHeight: 1.6 }}>{body}</div>
          </div>
        ))}
      </div>

      {/* Coaching clients' progression is AI-generated and lives in its own
          Milestones tab, tied to live goal/phase tracking — it doesn't
          belong on this evergreen welcome page. V12 Program clients have no
          coach-built progression, so the generic roadmap is the closest
          equivalent and belongs here. */}
      {programOnly && <V12RoadmapCard profile={profile} setPage={setPage} />}
    </div>
  );
}
