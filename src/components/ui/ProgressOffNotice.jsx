import { S } from "../../theme.jsx";
import { Card } from "./Card.jsx";

// Shown instead of the client's progress screens when the coach has turned
// progress tracking off for their program. Data is still being collected.
export function ProgressOffNotice() {
  return (
    <Card style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Progress tracking is off for your program</div>
      <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6 }}>Your coach is keeping track of your progress for you. Keep logging your workouts and check-ins as usual.</div>
    </Card>
  );
}
