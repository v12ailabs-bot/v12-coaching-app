import { S } from "../../theme.jsx";

// Standardized "nothing here yet" placeholder — several sections today just
// render nothing (or an empty list with no explanation) when there's no data.
export function EmptyState({ title, sub }) {
  return (
    <div style={{ padding: "28px 16px", textAlign: "center", color: S.muted }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: sub ? 4 : 0 }}>{title}</div>
      {sub && <div style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}
