import { S } from "../../theme.jsx";

export const RG = ({ options, value, onChange, cap }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {options.map(opt => (
      <button key={opt} onClick={() => onChange(opt)}
        style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + (value === opt ? S.accent : S.border), background: value === opt ? "rgba(255,106,0,.08)" : "transparent", color: value === opt ? S.accent : S.muted, textTransform: cap ? "capitalize" : "none" }}>
        {opt}
      </button>
    ))}
  </div>
);
