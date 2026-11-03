import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { S, RADIUS } from "../theme.jsx";
import { Btn } from "./ui/index.js";
import { celebrationText, ACHIEVEMENTS_EVENT } from "../lib/achievements.js";

// Full-screen congratulations the moment a client's milestone or goal is hit (marked by database
// triggers when the qualifying workout/weigh-in is saved, or by the coach for manual milestones).
// Shows once per achievement: dismissing records client_acknowledged_at via a function that can
// only touch the caller's own rows. Checks on load, on focus, every 30s, and right after a save.
const BITS = ["🎉", "✨", "🏆", "💪", "🔥", "⭐"];

export function AchievementCelebration({ profile }) {
  const [queue, setQueue] = useState([]);
  const check = useCallback(async () => {
    if (!profile?.id || profile.role === "coach") return;
    const { data } = await supabase.from("client_goals").select("*").eq("client_id", profile.id)
      .not("achieved_at", "is", null).is("client_acknowledged_at", null).order("achieved_at", { ascending: true });
    setQueue((q) => ((data || []).length === q.length && (data || []).every((g, i) => q[i]?.id === g.id) ? q : data || []));
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    check();
    const t = setInterval(() => { if (document.visibilityState === "visible") check(); }, 30000);
    window.addEventListener("focus", check); window.addEventListener(ACHIEVEMENTS_EVENT, check);
    return () => { clearInterval(t); window.removeEventListener("focus", check); window.removeEventListener(ACHIEVEMENTS_EVENT, check); };
  }, [check]);

  const goal = queue[0];
  if (!goal) return null;
  const c = celebrationText(goal, (profile.name || "").split(" ")[0]);
  const dismiss = async () => {
    setQueue((q) => q.slice(1));
    await supabase.rpc("acknowledge_my_achievements", { p_ids: [goal.id] });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={c.title} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflow: "hidden" }}>
      <style>{`@keyframes v12Fall { from { transform: translateY(-12vh) rotate(0deg); opacity: 1; } to { transform: translateY(112vh) rotate(360deg); opacity: .9; } }
@keyframes v12Pop { from { transform: scale(.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      {Array.from({ length: 22 }, (_, i) => (
        <span key={i} aria-hidden style={{ position: "absolute", top: 0, left: `${(i * 4.6) % 100}%`, fontSize: 18 + (i % 4) * 5, animation: `v12Fall ${3.2 + (i % 5) * 0.6}s linear ${(i % 7) * 0.25}s infinite`, pointerEvents: "none" }}>{BITS[i % BITS.length]}</span>
      ))}
      <div style={{ position: "relative", background: S.surface, border: "1px solid " + S.accent, borderRadius: RADIUS.md, padding: "28px 24px", maxWidth: 420, width: "100%", textAlign: "center", animation: "v12Pop .35s ease both" }}>
        <div style={{ fontSize: 54, lineHeight: 1 }}>{c.emoji}</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 1, margin: "10px 0 6px", color: S.text }}>{c.title}</div>
        <div style={{ fontSize: 14, color: S.muted, lineHeight: 1.6, marginBottom: 20 }}>{c.body}</div>
        <Btn teal onClick={dismiss}>{queue.length > 1 ? `Awesome! (${queue.length - 1} more)` : "Awesome!"}</Btn>
      </div>
    </div>
  );
}
