import { S } from "../../theme.jsx";

export const PageTitle = ({ title, sub }) => (
  <>
    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 38, lineHeight: 1, marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 13, color: S.muted, marginBottom: 28 }}>{sub}</div>
  </>
);
