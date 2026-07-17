import { CardTitle } from "./Card.jsx";

// Title + right-aligned action slot, standardizing the
// `<div style={flex-between}><CardTitle/><Btn/></div>` pattern repeated across
// nearly every card that has a save/refresh/snapshot action.
export function SectionHeader({ title, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12 }}>
      <CardTitle>{title}</CardTitle>
      {action}
    </div>
  );
}
