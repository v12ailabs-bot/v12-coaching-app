import { Stat } from "../../components/ui/index.js";

// Pure display: six stat tiles, all values computed by the parent from real
// data (profiles/daily_checkins/client_goals/leads/daily_metrics) — nothing
// here is fabricated or hardcoded.
export function CoachStatCards({ totalClients, activeClients, checkInCompletion, avgProgress, monthlyRevenue, newLeads }) {
  return (
    <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 16, marginBottom: 24 }}>
      <Stat label="Total Clients" value={totalClients} unit="" />
      <Stat label="Active Clients" value={activeClients} unit="" />
      <Stat label="Check-In Completion" value={checkInCompletion} unit="%" />
      <Stat label="Avg Client Progress" value={avgProgress ?? "—"} unit={avgProgress != null ? "%" : ""} />
      <Stat label="Monthly Revenue" value={"$" + monthlyRevenue.toLocaleString()} unit="" />
      <Stat label="New Leads" value={newLeads} unit="" />
    </div>
  );
}
