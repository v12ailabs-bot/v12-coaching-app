import { S } from "../../theme.jsx";

// Overview-page-only header treatment — bold and legible at a glance, unlike
// the tiny uppercase CardTitle used for form sections elsewhere in the app
// (ClientDetailPage etc.), which stays untouched since it's shared far beyond
// this page.
export function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: S.text, letterSpacing: 0.2 }}>{children}</div>
      {action}
    </div>
  );
}
