import { S } from "../../theme.jsx";

export const Sld = ({ label, val, min, max, sfx, onChange }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: S.muted, marginBottom: 6 }}>
      <span>{label}</span><span style={{ color: S.accent, fontWeight: 600 }}>{val}{sfx}</span>
    </div>
    <input type="range" min={min} max={max} value={val} onChange={e => onChange(+e.target.value)} />
  </div>
);
