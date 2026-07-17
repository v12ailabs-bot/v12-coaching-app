import { S } from "../../theme.jsx";

const TONES = {
  red: { bg: "rgba(192,57,43,.16)", fg: "#ff6b5b" },
  amber: { bg: "rgba(245,158,11,.14)", fg: "#f5a623" },
  green: { bg: "rgba(0,201,167,.14)", fg: S.accent2 },
  accent: { bg: "rgba(255,77,0,.12)", fg: S.accent },
  neutral: { bg: S.surface2, fg: S.muted },
};

// Small pill badge for status/flag labels (active/archived, on-track/behind,
// check-in flags, etc). Generalizes the ad hoc "Chip" pattern that used to be
// redefined locally inside the Coach Dashboard.
export function StatusBadge({ label, tone = "neutral" }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span style={{ padding: "3px 9px", fontSize: 10, fontWeight: 600, borderRadius: 4, background: t.bg, color: t.fg, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}
