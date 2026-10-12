import { useState, useEffect, useRef, useCallback } from "react";
import { S, RADIUS } from "../theme.jsx";
import { Card, CardTitle } from "./ui/index.js";

const PRESETS = [60, 90, 120];
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: setting just isn't remembered */ } };

// One rest timer shared by the desktop card and the phone bar. Pure client-side —
// no persisted workout data. The countdown is based on an END TIMESTAMP, not on
// counting ticks, so it stays correct when a phone throttles timers or the
// screen sleeps; it recalculates the moment the page becomes visible again.
// When it reaches zero it vibrates (where the device allows it — Android; iOS
// Safari doesn't support vibration) and plays a short triple beep. Sound needs
// the browser's audio to be "unlocked" by a tap, so prime() is called from the
// tap that starts the timer / logs a set.
export function useRestTimer() {
  const [duration, setDurationState] = useState(() => read("v12_rest_duration", 90));
  const [endAt, setEndAt] = useState(null);
  const [remaining, setRemaining] = useState(() => read("v12_rest_duration", 90));
  const [finished, setFinished] = useState(false);
  const [alertOn, setAlertOnState] = useState(() => read("v12_rest_alert", true));
  const [autoStart, setAutoStartState] = useState(() => read("v12_rest_auto", true));
  const ctxRef = useRef(null);
  const firedRef = useRef(false);
  const running = endAt != null;

  const prime = useCallback(() => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctxRef.current) ctxRef.current = new AC();
      if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    } catch { /* no audio available */ }
  }, []);

  const beep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    [0, 0.28, 0.56].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
    });
  }, []);

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    setFinished(true);
    if (alertOn) {
      try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 500]); } catch { /* unsupported */ }
      beep();
    }
    setTimeout(() => setFinished(false), 10000);
  }, [alertOn, beep]);

  useEffect(() => {
    if (endAt == null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) { setEndAt(null); fire(); }
    };
    tick();
    const id = setInterval(tick, 250);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [endAt, fire]);

  const start = useCallback((secs) => {
    prime();
    const d = secs ?? (remaining > 0 && remaining < duration && !running ? remaining : duration);
    firedRef.current = false; setFinished(false);
    setRemaining(d); setEndAt(Date.now() + d * 1000);
  }, [duration, remaining, running, prime]);
  const pause = useCallback(() => { setEndAt(null); }, []);
  const reset = useCallback((d) => {
    const next = d ?? duration;
    setEndAt(null); firedRef.current = false; setFinished(false); setRemaining(next);
  }, [duration]);
  const setDuration = useCallback((d) => { setDurationState(d); write("v12_rest_duration", d); setEndAt(null); firedRef.current = false; setFinished(false); setRemaining(d); }, []);
  const setAlertOn = useCallback((v) => { setAlertOnState(v); write("v12_rest_alert", v); if (v) { prime(); } }, [prime]);
  const setAutoStart = useCallback((v) => { setAutoStartState(v); write("v12_rest_auto", v); }, []);
  // Called after a set is logged: restarts the full rest period if auto-start is on.
  const startAfterSet = useCallback(() => { if (autoStart) { firedRef.current = false; setFinished(false); setRemaining(duration); setEndAt(Date.now() + duration * 1000); } }, [autoStart, duration]);

  return { duration, remaining, running, finished, alertOn, autoStart, prime, start, pause, reset, setDuration, setAlertOn, setAutoStart, startAfterSet };
}

const mmss = (r) => `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;

// Desktop / landscape column card (unchanged look), now alert-capable.
export function RestTimer({ timer }) {
  const own = useRestTimer();
  const t = timer || own;
  const pct = t.duration ? Math.round((t.remaining / t.duration) * 100) : 0;
  return (
    <Card style={{ marginBottom: 0, borderColor: t.finished ? S.success : undefined }}>
      <CardTitle>Rest Timer</CardTitle>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ position: "relative", width: 100, height: 100 }}>
          <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke={S.surface2} strokeWidth="7" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={t.finished ? S.success : S.accent} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - pct / 100)} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>
            {t.finished ? "GO!" : mmss(t.remaining)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {PRESETS.map((p) => (
            <button key={p} onClick={() => t.setDuration(p)}
              style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + (t.duration === p ? S.accent : S.border), background: t.duration === p ? "rgba(255,106,0,.08)" : "transparent", color: t.duration === p ? S.accent : S.muted }}>
              {p}s
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => (t.running ? t.pause() : t.start())} disabled={t.remaining === 0 && !t.running}
            style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", border: "none", background: S.accent, color: "white", opacity: t.remaining === 0 && !t.running ? 0.5 : 1 }}>
            {t.running ? "Pause" : "Start"}
          </button>
          <button onClick={() => t.reset()} style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}>Reset</button>
        </div>
        <Toggles t={t} />
      </div>
    </Card>
  );
}

function Toggles({ t }) {
  const chip = (on, label, onClick) => (
    <button onClick={onClick} style={{ padding: "4px 10px", fontSize: 10, cursor: "pointer", borderRadius: 20, border: "1px solid " + (on ? S.accent : S.border), background: on ? "rgba(255,106,0,.1)" : "transparent", color: on ? S.accent : S.muted }}>{label}</button>
  );
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
      {chip(t.alertOn, t.alertOn ? "🔔 Sound + vibrate on" : "🔕 Alert off", () => t.setAlertOn(!t.alertOn))}
      {chip(t.autoStart, t.autoStart ? "Auto-start after each set" : "Auto-start off", () => t.setAutoStart(!t.autoStart))}
    </div>
  );
}

// Phone version: a slim bar pinned above the bottom navigation, so the timer is
// always on screen while logging (portrait or landscape). Tap the time to open
// the alert / auto-start switches.
export function RestTimerBar({ timer }) {
  const t = timer;
  const [open, setOpen] = useState(false);
  const pct = t.duration ? Math.round((t.remaining / t.duration) * 100) : 0;
  const color = t.finished ? S.success : S.accent;
  return (
    <div style={{ position: "fixed", left: 8, right: 8, bottom: "calc(58px + env(safe-area-inset-bottom) + 8px)", zIndex: 900, background: S.surface, border: "1px solid " + (t.finished ? S.success : S.border), borderRadius: RADIUS.lg, boxShadow: "0 6px 24px rgba(0,0,0,.5)", padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setOpen((o) => !o)} aria-label="Rest timer settings" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 8, color: S.text }}>
          <span style={{ position: "relative", width: 34, height: 34 }}>
            <svg width="34" height="34" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="17" cy="17" r="14" fill="none" stroke={S.surface2} strokeWidth="4" />
              <circle cx="17" cy="17" r="14" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={2 * Math.PI * 14} strokeDashoffset={2 * Math.PI * 14 * (1 - pct / 100)} />
            </svg>
          </span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, lineHeight: 1, minWidth: 62, textAlign: "left", color: t.finished ? S.success : S.text }}>{t.finished ? "GO!" : mmss(t.remaining)}</span>
        </button>
        <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "center" }}>
          {PRESETS.map((p) => (
            <button key={p} onClick={() => t.setDuration(p)} style={{ padding: "5px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 14, border: "1px solid " + (t.duration === p ? S.accent : S.border), background: t.duration === p ? "rgba(255,106,0,.1)" : "transparent", color: t.duration === p ? S.accent : S.muted }}>{p}</button>
          ))}
        </div>
        <button onClick={() => (t.running ? t.pause() : t.start())} disabled={t.remaining === 0 && !t.running} style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", border: "none", borderRadius: 8, background: S.accent, color: "white", opacity: t.remaining === 0 && !t.running ? 0.5 : 1 }}>{t.running ? "Pause" : "Start"}</button>
        <button onClick={() => t.reset()} aria-label="Reset rest timer" style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", border: "1px solid " + S.border, borderRadius: 8, background: "transparent", color: S.muted }}>↺</button>
      </div>
      {open && <div style={{ marginTop: 8 }}><Toggles t={t} /></div>}
    </div>
  );
}
