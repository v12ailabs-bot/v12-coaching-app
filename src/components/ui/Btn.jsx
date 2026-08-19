import { S, RADIUS, bS } from "../../theme.jsx";

export const Btn = ({ children, onClick, disabled, teal, sm, danger }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ ...bS(sm ? { padding: "7px 14px", fontSize: 10 } : {}), borderRadius: RADIUS.md, background: danger ? "#c0392b" : teal ? S.accent2 : S.accent, color: teal ? "#0A0A0B" : "white", opacity: disabled ? 0.5 : 1 }}>
    {children}
  </button>
);
