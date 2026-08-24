import { S } from "../../theme.jsx";
import { Card } from "./Card.jsx";

// Chart card: title + subtitle + fixed-height chart area. `height` defaults
// to 230 (the size every existing caller was built around) — pass a smaller
// value for compact previews (e.g. the mobile Workouts progress preview)
// without touching any of those callers.
export const CC = ({ title, sub, height = 230, children }) => (
  <Card>
    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, marginBottom: 2 }}>{title}</div>
    <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>{sub}</div>
    <div style={{ height }}>{children}</div>
  </Card>
);
