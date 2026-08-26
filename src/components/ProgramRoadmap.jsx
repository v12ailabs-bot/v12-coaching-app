import { S } from "../theme.jsx";

// Pure display component: a coach-planned phase sequence (program_phases,
// ordered by order_index) rendered as completed / current / upcoming against
// the existing programs.phase field. No data fetching here — callers pass
// `phases` and `currentPhase` so this reuses cleanly in both the coach and
// client views.
export function ProgramRoadmap({ phases, currentPhase }) {
  if (!phases || phases.length === 0) return null;

  const currentIndex = phases.findIndex((p) => p.phase === currentPhase);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", padding: "8px 2px" }}>
      {phases.map((p, i) => {
        const status = currentIndex === -1 ? "upcoming" : i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        const color = status === "done" ? S.success : status === "current" ? S.accent : S.muted;
        // Done + current phases glow (traveled/active ground); upcoming stays
        // flat and dim — the roadmap should read at a glance as "how far
        // we've come" rather than every phase looking equally weighted.
        const glow = status === "done" ? `0 0 14px rgba(34,197,94,.55)` : status === "current" ? `0 0 18px rgba(255,106,0,.7)` : "none";
        return (
          <div key={p.id || i} style={{ display: "flex", alignItems: "flex-start", flex: "1 0 auto", minWidth: 110 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%", opacity: status === "upcoming" ? 0.55 : 1 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, flexShrink: 0, boxShadow: glow, transition: "box-shadow .3s ease",
                background: status === "done" ? S.success : status === "current" ? "rgba(255,106,0,.14)" : "transparent",
                color: status === "done" ? "#0B0B0D" : color,
                border: status === "current" ? "2px solid " + S.accent : "1px solid " + S.border,
              }}>
                {status === "done" ? "✓" : i + 1}
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: status === "upcoming" ? S.muted : S.text, marginTop: 8, whiteSpace: "nowrap" }}>{p.phase}</div>
              {(p.week_start != null && p.week_end != null) && (
                <div style={{ fontSize: 10, color: S.muted, marginTop: 2 }}>Weeks {p.week_start}-{p.week_end}</div>
              )}
              {status === "current" && <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.accent, marginTop: 2, fontWeight: 700 }}>Current</div>}
            </div>
            {i < phases.length - 1 && (
              <div style={{
                height: 3, flex: "1 0 20px", marginTop: 18, minWidth: 20, borderRadius: 2, transition: "background .3s ease, box-shadow .3s ease",
                background: status === "done" ? S.success : status === "current" ? "linear-gradient(90deg, " + S.accent + ", " + S.border + ")" : S.border,
                boxShadow: status === "done" ? "0 0 8px rgba(34,197,94,.5)" : status === "current" ? "0 0 8px rgba(255,106,0,.4)" : "none",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
