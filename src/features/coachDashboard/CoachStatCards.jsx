import { MetricCard } from "../../components/ui/index.js";

const fmtDelta = (pct) => (pct == null ? null : { text: `${pct > 0 ? "↑" : pct < 0 ? "↓" : "→"} ${Math.abs(pct)}% from last month`, tone: pct > 0 ? "good" : pct < 0 ? "bad" : "neutral" });
const fmtWeekDelta = (pct) => (pct == null ? null : { text: `${pct > 0 ? "↑" : pct < 0 ? "↓" : "→"} ${Math.abs(pct)}% vs last week`, tone: pct > 0 ? "good" : pct < 0 ? "bad" : "neutral" });

// Pure display: six stat tiles. Every value AND every trend is computed by
// the parent from real data (profiles/daily_checkins/client_goals/leads/
// daily_metrics) — trends that can't be honestly derived yet (no historical
// snapshot to diff Active Clients against) are simply omitted rather than
// invented.
export function CoachStatCards({ totalClients, totalClientsTrendPct, activeClients, checkInCompletion, checkInTrendPct, avgProgress, avgProgressTrendPct, monthlyRevenue, revenueTrendPct, newLeads, leadsTrendPct }) {
  return (
    <div className="g6" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 16, marginBottom: 24 }}>
      <MetricCard icon="👥" label="Total Clients" value={totalClients} unit="" trend={fmtDelta(totalClientsTrendPct)} />
      <MetricCard icon="⚡" label="Active Clients" value={activeClients} unit="" />
      <MetricCard icon="✅" label="Check-In Completion" value={checkInCompletion} unit="%" trend={fmtWeekDelta(checkInTrendPct)} />
      <MetricCard icon="📊" label="Avg Client Progress" value={avgProgress ?? "—"} unit={avgProgress != null ? "%" : ""} trend={fmtWeekDelta(avgProgressTrendPct)} />
      <MetricCard icon="💰" label="Monthly Revenue" value={"$" + monthlyRevenue.toLocaleString()} unit="" trend={fmtDelta(revenueTrendPct)} />
      <MetricCard icon="✨" label="New Leads" value={newLeads} unit="" trend={fmtDelta(leadsTrendPct)} />
    </div>
  );
}
