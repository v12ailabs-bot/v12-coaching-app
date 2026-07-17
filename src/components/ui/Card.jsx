import { S, RADIUS, SHADOW } from "../../theme.jsx";

export const Card = ({ children, style }) => (
  <div className="card" style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.md, boxShadow: SHADOW.card, padding: 24, marginBottom: 20, ...style }}>
    {children}
  </div>
);

export const CardTitle = ({ children }) => (
  <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 16 }}>
    {children}
  </div>
);
