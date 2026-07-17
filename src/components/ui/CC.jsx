import { S } from "../../theme.jsx";
import { Card } from "./Card.jsx";

// Chart card: title + subtitle + fixed-height chart area.
export const CC = ({ title, sub, children }) => (
  <Card>
    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, marginBottom: 2 }}>{title}</div>
    <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>{sub}</div>
    <div style={{ height: 230 }}>{children}</div>
  </Card>
);
