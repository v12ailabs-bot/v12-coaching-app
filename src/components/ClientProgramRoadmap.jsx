import { useState } from "react";
import { S, RADIUS } from "../theme.jsx";
import { Btn } from "./ui/index.js";
import { ProgramRoadmap } from "./ProgramRoadmap.jsx";

// Client-facing roadmap view: the phase stepper (tap a phase for its popup),
// a Current Phase card ("Week 2 of 4", what it's for, View Phase), Quick Stats
// and phase progress — all from the client's real data. A stat with no data is
// hidden, never shown as zero. Also used (with the client's real stats) for the
// coach's "Preview", so the coach sees exactly this.
const label = { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted };
const box = { border: "1px solid " + S.border, borderRadius: RADIUS.lg, padding: 14, background: S.surface2 };

export function ClientProgramRoadmap({ phases, currentPhase, startDate, stats, showPhaseCard = true }) {
  const [openIndex, setOpenIndex] = useState(null);
  const currentIndex = phases.findIndex((p) => p.phase === currentPhase);
  const current = currentIndex === -1 ? null : phases[currentIndex];
  const next = currentIndex === -1 ? null : phases[currentIndex + 1];
  const rows = stats ? [
    stats.completed != null && ["Workouts completed", `${stats.completed} / ${stats.scheduled}`],
    stats.attendancePct != null && ["Attendance", `${stats.attendancePct}%`, stats.attendancePct >= 80 ? S.success : stats.attendancePct >= 60 ? S.warning : S.danger],
    stats.proteinAvg != null && ["Protein (avg per day)", `${stats.proteinAvg} g`],
  ].filter(Boolean) : [];
  const blurb = current && (current.objective || current.note);

  return (
    <div>
      <ProgramRoadmap phases={phases} currentPhase={currentPhase} startDate={startDate} openIndex={openIndex} onOpenChange={setOpenIndex} />
      {current && (showPhaseCard || rows.length > 0 || stats) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginTop: 14 }}>
          {showPhaseCard && (
            <div style={{ ...box, borderColor: S.accent }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, background: "rgba(255,106,0,.16)", border: "2px solid " + S.accent, color: S.accent }}>{currentIndex + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={label}>Current phase</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, lineHeight: 1.1, color: S.text }}>{current.phase}</div>
                  {stats && <div style={{ fontSize: 12, color: S.muted }}>Week {stats.phaseWeek} of {stats.phaseWeeks}</div>}
                </div>
              </div>
              {blurb && <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6, marginTop: 10 }}>{blurb}</div>}
              {next && <div style={{ fontSize: 11, color: S.muted, marginTop: 8 }}>What's next: <span style={{ color: S.text, fontWeight: 600 }}>{next.phase}</span></div>}
              <div style={{ marginTop: 12 }}><Btn sm onClick={() => setOpenIndex(currentIndex)}>View Phase ›</Btn></div>
            </div>
          )}
          {(rows.length > 0 || stats) && (
            <div style={box}>
              {rows.length > 0 && (
                <>
                  <div style={{ ...label, marginBottom: 8 }}>Quick stats</div>
                  {rows.map(([k, v, c]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid " + S.border, fontSize: 13 }}>
                      <span style={{ color: S.muted }}>{k}</span><span style={{ fontWeight: 700, color: c || S.text }}>{v}</span>
                    </div>
                  ))}
                </>
              )}
              {stats && (
                <div style={{ marginTop: rows.length ? 12 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={label}>Phase progress</span><span>{stats.phaseWeek} of {stats.phaseWeeks} weeks · {stats.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: S.bg, borderRadius: 3, overflow: "hidden" }}><div style={{ width: stats.pct + "%", height: "100%", background: "linear-gradient(90deg," + S.accent + ",#ff9a4d)", transition: "width .4s" }} /></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
