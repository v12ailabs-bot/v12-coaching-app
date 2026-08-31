import { S } from "../../theme.jsx";
import { PageTitle, Card, CardTitle } from "../../components/ui/index.js";
import { V12RoadmapCard } from "./V12RoadmapCard.jsx";

// Replaces the old per-client Notion dashboard link with an in-app page —
// same evergreen reference a client can revisit any time, not a one-time
// gate (that's ClientWelcome, shown once at first login). Condensed from the
// real V12 Performance Coaching welcome doc (philosophy/what-it-is/what-it-
// isn't/expectations/results) — not the full essay-length version, just the
// parts worth a client re-reading months in.
const PILLARS = [
  ["LOOK GOOD", "Bodybuilding volume for the physique — sarcoplasmic fullness and size."],
  ["MOVE GOOD", "Athletic conditioning and explosive power — work capacity that carries over to life."],
  ["PERFORM GOOD", "Powerlifting strength for a nervous system that recruits everything you've got."],
];

const RESULTS = [
  "Steady, sustainable fat loss — without losing muscle",
  "Progressive strength gains, bodyweight and weighted",
  "Better endurance and work capacity",
  "A leaner, more defined physique",
  "Habits and discipline that outlast the program",
];

const EXPECTATIONS = [
  "Follow the program as written — trust the process",
  "Log every training session",
  "Hit your nutrition targets consistently",
  "Tell your coach if something isn't working",
  "Submit your weekly check-in on time",
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
            This isn't quick fixes or crash dieting — it's a structured system built on{" "}
            <span style={{ color: S.neon, fontWeight: 700 }}>consistency, structure, and intelligent progression</span>,
            combining hybrid calisthenics, strength training, and conditioning into real capability, not just aesthetics.
            You'll <span style={{ color: S.neon, fontWeight: 700 }}>look good, move good, and perform good</span>, all at once.
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

      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card>
          <CardTitle>What To Expect</CardTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: S.text, lineHeight: 1.9 }}>
            {RESULTS.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Card>
        <Card>
          <CardTitle>What's Expected Of You</CardTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: S.text, lineHeight: 1.9 }}>
            {EXPECTATIONS.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </Card>
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
