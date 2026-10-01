import { S } from "../../theme.jsx";
import { Card, CardTitle, Btn, ProgressRing } from "../../components/ui/index.js";

// Ring shows 30-day check-in adherence (the same figure assessClientRisk
// already computes) rather than a fabricated "today" percentage — daily
// check-in itself is binary (done/not done for today).
export function CheckInCard({ doneToday, adherenceScore, setPage }) {
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <ProgressRing value={adherenceScore ?? 0} size={100} caption="Adherence" />
      <div style={{ flex: 1, minWidth: 140 }}>
        <CardTitle>Today</CardTitle>
        <div style={{ fontSize: 13, color: S.text, marginBottom: 14 }}>
          {doneToday ? "Today completed. Nice work." : "Complete your targets, check-in, and nutrition for today."}
        </div>
        {!doneToday && <Btn sm onClick={() => setPage("daily")}>Complete Today</Btn>}
      </div>
    </Card>
  );
}
