import { S } from "../../theme.jsx";

export const Fld = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</label>
    {children}
  </div>
);
