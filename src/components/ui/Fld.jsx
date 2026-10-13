import { S } from "../../theme.jsx";

export const Fld = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</label>
    {children}
  </div>
);
