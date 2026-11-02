import { S } from "../../theme.jsx";

// `val` may be null/undefined = "not answered yet": the slider shows a neutral
// "Not set" and rests at the midpoint, but nothing counts as a response until
// the client moves it or taps/releases it (so confirming the resting value is
// still possible).
export const Sld = ({ label, val, min, max, sfx, onChange }) => {
  const unset = val == null || val === "";
  const resting = Math.round((min + max) / 2);
  const confirm = () => { if (unset) onChange(resting); };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: S.muted, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: unset ? S.muted : S.accent, fontWeight: 600 }}>{unset ? "Not set" : `${val}${sfx || ""}`}</span>
      </div>
      <input type="range" min={min} max={max} value={unset ? resting : val} style={unset ? { opacity: 0.5 } : undefined}
        onChange={e => onChange(+e.target.value)} onPointerUp={confirm} onKeyUp={confirm} />
    </div>
  );
};
