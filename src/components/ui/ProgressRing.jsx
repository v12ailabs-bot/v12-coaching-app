import { S } from "../../theme.jsx";

// Circular progress indicator — hero phase/week progress, daily check-in %,
// goal completion, etc. Pass `value` (0-100). Renders a centered "XX%" plus
// an optional small caption below it; pass `children` to replace that
// default center content entirely (e.g. a non-percentage value).
export function ProgressRing({ value, size = 120, strokeWidth = 10, color = S.accent, trackColor = S.border, caption, children }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
        {children ?? (
          <>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: size * 0.28, lineHeight: 1, color: S.text }}>{Math.round(pct)}%</div>
            {caption && <div style={{ fontSize: Math.max(8, size * 0.075), letterSpacing: 1, textTransform: "uppercase", color: S.muted, textAlign: "center" }}>{caption}</div>}
          </>
        )}
      </div>
    </div>
  );
}
