import { S } from "../../theme.jsx";

const VARIANTS = {
  success: { fg: S.accent2 },
  error: { fg: "#ff6b5b" },
  info: { fg: S.muted },
};

// Standardizes the inline save/error message pattern repeated ad hoc in
// nearly every save handler across the app (`msg && <div style={{color:...}}>`).
export function Alert({ variant = "info", children }) {
  if (!children) return null;
  const v = VARIANTS[variant] || VARIANTS.info;
  return (
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: v.fg }}>
      {children}
    </div>
  );
}
