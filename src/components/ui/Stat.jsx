import { S, RADIUS } from "../../theme.jsx";

export const Stat = ({ label, value, unit }) => (
  <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 20 }}>
    <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 34, lineHeight: 1 }}>
      {value}<span style={{ fontSize: 13, color: S.muted }}>{unit}</span>
    </div>
  </div>
);
