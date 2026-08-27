import { useState } from "react";
import { S } from "../theme.jsx";
import { Modal } from "./ui/Modal.jsx";

// The program's real total length, derived from the coach's own roadmap
// (the highest week_end across all planned phases) rather than a separate
// programs.weeks number that can silently drift out of sync with it —
// e.g. a 6-month/24-week roadmap built one phase at a time while
// programs.weeks is still whatever the last AI generation defaulted it to
// (12). Falls back to `fallbackWeeks` only when no phase has a week_end set.
export function totalWeeksFromPhases(phases, fallbackWeeks) {
  const ends = (phases || []).map((p) => p.week_end).filter((w) => w != null);
  return ends.length ? Math.max(...ends) : fallbackWeeks;
}

const DAY_MS = 86400000;
const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
// Phase week numbers are 1-indexed relative to the program's start_date —
// week 1 is start_date itself, so week N's range starts (N-1)*7 days in.
export function dateRangeForWeeks(startDate, weekStart, weekEnd) {
  if (!startDate || weekStart == null || weekEnd == null) return null;
  const base = new Date(startDate + "T00:00:00Z");
  const from = new Date(base.getTime() + (weekStart - 1) * 7 * DAY_MS);
  const to = new Date(base.getTime() + (weekEnd * 7 - 1) * DAY_MS);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

// Pure display component: a coach-planned phase sequence (program_phases,
// ordered by order_index) rendered as completed / current / upcoming against
// the existing programs.phase field. No data fetching here — callers pass
// `phases` and `currentPhase` so this reuses cleanly in both the coach and
// client views. `startDate` (programs.start_date) is optional — when
// present, each phase shows its real calendar date range instead of just
// abstract week numbers. Clicking a phase circle opens that phase's own note
// (program_phases.note) in a full modal popup (same Modal primitive/X-to-
// close pattern as the Progress popup on the client card) — works
// identically wherever this component is used, coach or client side, since
// it's the same component.
const EXIT_CRITERIA_LABEL = { complete: "✓", incomplete: "○", na: "–" };
const EXIT_CRITERIA_COLOR = { complete: S.success, incomplete: S.muted, na: S.muted };

// `forCoach` gates the strategy detail a client shouldn't see per spec —
// progression_strategy and the exit-criteria checklist are coaching/decision
// detail, not something a client needs to parse. Objective/training/movement
// focus are safe for both: they're the "why am I here" / "what are we
// working on" language the client-facing roadmap is built around.
export function ProgramRoadmap({ phases, currentPhase, startDate, forCoach = false }) {
  const [openIndex, setOpenIndex] = useState(null);
  if (!phases || phases.length === 0) return null;

  const currentIndex = phases.findIndex((p) => p.phase === currentPhase);
  const openPhase = openIndex != null ? phases[openIndex] : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", padding: "8px 2px" }}>
        {phases.map((p, i) => {
          const status = currentIndex === -1 ? "upcoming" : i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const color = status === "done" ? S.success : status === "current" ? S.accent : S.muted;
          // Done + current phases glow (traveled/active ground); upcoming
          // stays flat and dim — the roadmap should read at a glance as
          // "how far we've come" rather than every phase looking equally
          // weighted.
          const glow = status === "done" ? `0 0 14px rgba(34,197,94,.55)` : status === "current" ? `0 0 18px rgba(255,106,0,.7)` : "none";
          return (
            <div key={p.id || i} style={{ display: "flex", alignItems: "flex-start", flex: "1 0 auto", minWidth: 110 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%", opacity: status === "upcoming" ? 0.55 : 1 }}>
                <button onClick={() => setOpenIndex(i)} title={p.note ? "View phase note" : "No note for this phase yet"}
                  style={{
                    width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    fontSize: 15, fontWeight: 700, flexShrink: 0, boxShadow: glow, transition: "box-shadow .3s ease",
                    background: status === "done" ? S.success : status === "current" ? "rgba(255,106,0,.14)" : "transparent",
                    color: status === "done" ? "#0B0B0D" : color,
                    border: status === "current" ? "2px solid " + S.accent : "1px solid " + S.border,
                  }}>
                  {status === "done" ? "✓" : i + 1}
                </button>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: status === "upcoming" ? S.muted : S.text, marginTop: 8, whiteSpace: "nowrap" }}>{p.phase}</div>
                {(p.week_start != null && p.week_end != null) && (
                  <div style={{ fontSize: 10, color: S.muted, marginTop: 2, whiteSpace: "nowrap" }}>
                    {dateRangeForWeeks(startDate, p.week_start, p.week_end) || `Weeks ${p.week_start}-${p.week_end}`}
                  </div>
                )}
                {status === "current" && <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.accent, marginTop: 2, fontWeight: 700 }}>Current</div>}
                {forCoach && p.exit_criteria?.length > 0 && (
                  <div style={{ fontSize: 10, color: S.muted, marginTop: 2, whiteSpace: "nowrap" }}>
                    {p.exit_criteria.filter((c) => c.status === "complete").length}/{p.exit_criteria.length} exit criteria
                  </div>
                )}
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
      {openPhase && (
        <Modal title={openPhase.phase} onClose={() => setOpenIndex(null)}>
          {(openPhase.week_start != null && openPhase.week_end != null) && (
            <div style={{ fontSize: 12, color: S.muted, marginBottom: 12 }}>
              {dateRangeForWeeks(startDate, openPhase.week_start, openPhase.week_end) || `Weeks ${openPhase.week_start}-${openPhase.week_end}`}
            </div>
          )}
          {openPhase.objective && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>
                {forCoach ? "Objective" : "Why We're Here"}
              </div>
              <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6 }}>{openPhase.objective}</div>
            </div>
          )}
          {(openPhase.training_focus || openPhase.movement_focus) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {openPhase.training_focus && <span style={{ fontSize: 11, color: S.text, border: "1px solid " + S.border, borderRadius: 20, padding: "4px 10px" }}>{openPhase.training_focus}</span>}
              {openPhase.movement_focus && <span style={{ fontSize: 11, color: S.text, border: "1px solid " + S.border, borderRadius: 20, padding: "4px 10px" }}>{openPhase.movement_focus}</span>}
            </div>
          )}
          {forCoach && openPhase.progression_strategy && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Progression Strategy</div>
              <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6 }}>{openPhase.progression_strategy}</div>
            </div>
          )}
          {forCoach && openPhase.exit_criteria?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>
                Phase Exit Criteria — {openPhase.exit_criteria.filter((c) => c.status === "complete").length}/{openPhase.exit_criteria.length} Complete
              </div>
              {openPhase.exit_criteria.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: S.text, padding: "3px 0" }}>
                  <span style={{ color: EXIT_CRITERIA_COLOR[c.status], fontWeight: 700 }}>{EXIT_CRITERIA_LABEL[c.status] || "○"}</span>
                  {c.label}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, color: openPhase.note ? S.text : S.muted, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {openPhase.note || (!openPhase.objective && "No note for this phase yet.")}
          </div>
        </Modal>
      )}
    </>
  );
}
