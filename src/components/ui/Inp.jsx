import { S } from "../../theme.jsx";

export const Inp = (props) => (
  <input {...props} style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", ...props.style }} />
);
