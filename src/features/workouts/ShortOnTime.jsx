import { useState, useMemo } from "react";
import { S } from "../../theme.jsx";
import { estimateDay, shortenDay } from "../../lib/programming/sessionDuration.js";

const CHOICES = [20, 30, 45, 60];

// "I have less time today." A read-only guide, never a change to the program:
// shows what to keep (and any sets to trim) so the main training stimulus is
// preserved — primary lift first, then secondary, then essential accessories —
// and what to skip. Rest periods are not shortened. Everything is counted
// against the time the client has (warm-up and cooldown included).
export function ShortOnTime({ exercises }) {
  const [minutes, setMinutes] = useState(null);
  // Counts everything — the client's own clock, not a coached appointment.
  const cfg = { prep: "coached", finish: "coached" };
  const full = useMemo(() => estimateDay(exercises, cfg).coached, [exercises]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = useMemo(() => (minutes ? shortenDay(exercises, minutes, cfg) : null), [exercises, minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = CHOICES.filter((m) => m < full);
  if (!choices.length) return null;

  const kept = plan ? plan.exercises.map((e) => {
    const r = plan.reduced.find((x) => x.name === e.name);
    return r ? `${e.name} — ${r.to} sets (instead of ${r.from})` : e.name;
  }) : [];

  return (
    <div style={{ marginTop: 12, fontSize: 12, color: S.muted }}>
      <span>Short on time? Full session ≈ {full} min. </span>
      {choices.map((m) => (
        <button key={m} onClick={() => setMinutes(minutes === m ? null : m)}
          style={{ marginRight: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", background: minutes === m ? "rgba(255,106,0,.12)" : "transparent", color: minutes === m ? S.accent : S.text, border: "1px solid " + (minutes === m ? S.accent : S.border), borderRadius: 12 }}>
          I have {m} min
        </button>
      ))}
      {plan && (
        <div style={{ marginTop: 10, background: S.surface2, border: "1px solid " + S.border, padding: "10px 14px", lineHeight: 1.7 }}>
          <div style={{ color: S.text, fontWeight: 600 }}>Shortened session ≈ {plan.after} min{plan.fits ? "" : " (the closest we can get without cutting your main lift)"}</div>
          <div><span style={{ color: S.accent2 }}>Do:</span> {kept.join(" · ")}</div>
          {plan.removed.length > 0 && <div><span style={{ color: S.danger }}>Skip today:</span> {plan.removed.join(", ")}</div>}
          <div style={{ fontSize: 11 }}>Keep your normal rest on the big lifts. Skipped work isn't a missed workout — log what you did and mark it complete.</div>
        </div>
      )}
    </div>
  );
}
