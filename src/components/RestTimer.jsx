import { useState, useEffect, useRef } from "react";
import { S } from "../theme.jsx";
import { Card, CardTitle } from "./ui/index.js";

const PRESETS = [60, 90, 120];

// Pure client-side countdown — no persisted data, no new table, resets on
// reload. Named explicitly in the desktop reference layout (right column,
// alongside Today's Workout and Coaching Cue) even though nothing like it
// existed in the app before.
export function RestTimer() {
  const [duration, setDuration] = useState(90);
  const [remaining, setRemaining] = useState(90);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { setRunning(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const reset = (d = duration) => { setRunning(false); setDuration(d); setRemaining(d); };
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const pct = duration ? Math.round((remaining / duration) * 100) : 0;

  return (
    <Card style={{ marginBottom: 0 }}>
      <CardTitle>Rest Timer</CardTitle>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ position: "relative", width: 100, height: 100 }}>
          <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke={S.surface2} strokeWidth="7" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={S.accent} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - pct / 100)} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>
            {mm}:{ss}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {PRESETS.map((p) => (
            <button key={p} onClick={() => reset(p)}
              style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + (duration === p ? S.accent : S.border), background: duration === p ? "rgba(255,106,0,.08)" : "transparent", color: duration === p ? S.accent : S.muted }}>
              {p}s
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setRunning((r) => !r)} disabled={remaining === 0}
            style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", border: "none", background: S.accent, color: "white", opacity: remaining === 0 ? 0.5 : 1 }}>
            {running ? "Pause" : "Start"}
          </button>
          <button onClick={() => reset()} style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}>
            Reset
          </button>
        </div>
      </div>
    </Card>
  );
}
