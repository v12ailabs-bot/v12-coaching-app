import { S } from "../../theme.jsx";

const TONES = {
  red: { bg: "rgba(239,68,68,.16)", fg: S.danger },
  amber: { bg: "rgba(250,204,21,.14)", fg: S.warning },
  green: { bg: "rgba(34,197,94,.14)", fg: S.success },
  accent: { bg: "rgba(255,106,0,.12)", fg: S.accent },
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
