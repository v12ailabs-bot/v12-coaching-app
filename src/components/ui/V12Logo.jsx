import { S } from "../../theme.jsx";

// Stylized wordmark from the approved login mockup: a silver "V", glowing
// orange "12", and a glowing orange lightning-bolt accent — replaces the
// flat single-color "V12" text used everywhere else in the app (topbar,
// login). `size` sets the wordmark's font-size; everything else scales off it.
export function V12Logo({ size = 30 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.1, flexShrink: 0 }}>
      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: size, lineHeight: 1, display: "flex" }}>
        <span style={{ background: "linear-gradient(180deg,#F4F5F7,#9A9CA5)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>V</span>
        <span style={{ color: S.accent, textShadow: `0 0 ${Math.round(size * 0.4)}px rgba(255,106,0,.6)` }}>12</span>
      </span>
      <svg width={size * 0.42} height={size * 0.8} viewBox="0 0 24 40" style={{ filter: `drop-shadow(0 0 ${Math.round(size * 0.2)}px rgba(255,106,0,.75))`, flexShrink: 0 }}>
        <polygon points="15,0 2,22 11,22 8,40 22,16 12,16" fill={S.accent} />
      </svg>
    </div>
  );
}
