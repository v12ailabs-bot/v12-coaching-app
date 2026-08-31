import { S, RADIUS, avatarFrom, COLORS } from "../../theme.jsx";
import { PageTitle, Card, StatusBadge } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";
import { Sparkline, TrendPill } from "./QuickAnalytics.jsx";
import { RecentActivityFeed } from "./RecentActivityFeed.jsx";
import { RecentNotes } from "./RecentNotes.jsx";
import { ProgramSubscribersPanel } from "./ProgramSubscribersPanel.jsx";

// Purpose-built mobile presentation for the coach dashboard — dense
// "modules" instead of the desktop's many full-size stacked cards, built
// entirely from data CoachHome.jsx already fetches/computes (passed down as
// props here; nothing re-fetched). Desktop's own render path in CoachHome.jsx
// is untouched — this only replaces what's shown on screens ≤720px wide.

function SnapshotTile({ label, value }) {
  return (
    <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 14 }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function PerformanceSnapshot({ totalClients, activeClients, atRiskCount, offlineCount }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Performance Snapshot</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <SnapshotTile label="Total Clients" value={totalClients} />
        <SnapshotTile label="Active" value={activeClients} />
        <SnapshotTile label="At Risk" value={atRiskCount} />
        <SnapshotTile label="Offline" value={offlineCount} />
      </div>
    </Card>
  );
}

function ClientOverviewRow({ rows, sparklineByClient, openClient, setPage }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle action={<button onClick={() => setPage("clients")} style={{ background: "none", border: "none", color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>See all →</button>}>Client Overview</SectionTitle>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 4 }}>
        {rows.map((r, i) => (
          <div key={r.id} onClick={() => openClient(r.id)} style={{ flexShrink: 0, width: 76, cursor: "pointer", textAlign: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", margin: "0 auto 6px", background: COLORS[i % COLORS.length], color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
              {avatarFrom(r.name)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: S.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name.split(" ")[0]}</div>
            <div style={{ fontSize: 11, color: S.accent2, fontWeight: 700, marginBottom: 2 }}>{Math.round(r.progress)}%</div>
            <Sparkline data={sparklineByClient[r.id] || []} color={COLORS[i % COLORS.length]} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function PerformanceOverview({ checkinSeries, checkinDeltaPct, progressSeries, progressDeltaPct }) {
  const checkinNow = checkinSeries[checkinSeries.length - 1]?.value;
  const progressNow = progressSeries[progressSeries.length - 1]?.value;
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Performance Overview <span style={{ fontSize: 11, color: S.muted, fontWeight: 400, marginLeft: 6 }}>Last 6 Weeks</span></SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          ["Check-in Rate", checkinNow, checkinDeltaPct, checkinSeries, S.accent],
          ["Avg Progress", progressNow, progressDeltaPct, progressSeries, S.accent2],
        ].map(([label, now, delta, series, color]) => (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted }}>{label}</div>
              <TrendPill deltaPct={delta} />
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, marginBottom: 8 }}>{now ?? "—"}{now != null ? "%" : ""}</div>
            <Sparkline data={series} color={color} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function CheckInOverviewCompact({ counts, totalCheckinsThisWeek, setPage }) {
  const totalClients = counts.completed + counts.partial + counts.missed;
  const completionRate = totalClients ? Math.round((counts.completed / totalClients) * 100) : 0;
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Check-In Overview <span style={{ fontSize: 10, color: S.muted, fontWeight: 400, marginLeft: 6 }}>This Week</span></SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24 }}>{totalCheckinsThisWeek}</div><div style={{ fontSize: 10, color: S.muted }}>Total Check-ins</div></div>
        <div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.accent2 }}>{completionRate}%</div><div style={{ fontSize: 10, color: S.muted }}>Completion Rate</div></div>
        <div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.danger }}>{counts.missed}</div><div style={{ fontSize: 10, color: S.muted }}>Missed</div></div>
      </div>
      <button onClick={() => setPage("metrics")} style={{ background: "none", border: "none", color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>View Detailed Check-in Report →</button>
    </Card>
  );
}

// Merges the 5 desktop alert panels (at-risk, onboarding, milestone, phase,
// messages) into one severity-sorted priority queue — same underlying data,
// no new fetches. A client can appear more than once if they have more than
// one distinct open issue; that's intentional (one row per issue, matching
// "what do I need to act on today", not "which clients have any issue").
function buildQueue({ needs, onboardingAlerts, milestoneAlerts, phaseAlerts, messages, nameOf }) {
  const items = [];
  needs.forEach((n) => items.push({ clientId: n.client.id, name: n.client.name || n.client.email, text: n.flags[0]?.label || "Needs attention", badge: n.riskLevel === "High" ? "At Risk" : "Monitor", tone: n.riskLevel === "High" ? "red" : "amber", severity: 3 }));
  phaseAlerts.forEach((a) => items.push({ clientId: a.clientId, name: nameOf(a.clientId), text: `${a.phase} ${a.daysUntilEnd < 0 ? "overdue" : "ending soon"}`, badge: "Monitor", tone: "amber", severity: 2 }));
  messages.forEach((m) => {
    const worst = m.items.find((x) => x.tone === "red") || m.items[0];
    if (!worst) return;
    items.push({ clientId: m.id, name: nameOf(m.id), text: worst.label, badge: worst.tone === "red" ? "At Risk" : "Monitor", tone: worst.tone === "red" ? "red" : "amber", severity: worst.tone === "red" ? 3 : 1 });
  });
  milestoneAlerts.filter((a) => a.kind === "approaching").forEach((a) => items.push({ clientId: a.clientId, name: nameOf(a.clientId), text: `${a.exercise} — ${a.pct}% to milestone`, badge: "Monitor", tone: "amber", severity: 1 }));
  onboardingAlerts.forEach((a) => items.push({ clientId: a.clientId, name: nameOf(a.clientId), text: "Onboarding needs your review", badge: "Monitor", tone: "amber", severity: 1 }));
  return items.sort((a, b) => b.severity - a.severity);
}

function AlertsAndMessages({ needs, onboardingAlerts, milestoneAlerts, phaseAlerts, messages, nameOf, openClient, clientIds }) {
  const queue = buildQueue({ needs, onboardingAlerts, milestoneAlerts, phaseAlerts, messages, nameOf });
  const colorOf = (id) => COLORS[Math.max(0, clientIds.indexOf(id)) % COLORS.length];
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Alerts &amp; Messages</SectionTitle>
      {queue.length === 0 ? (
        <div style={{ color: S.success, fontSize: 13, padding: "8px 0" }}>All clients are on track. Nice work.</div>
      ) : (
        queue.slice(0, 8).map((q, i) => (
          <div key={i} onClick={() => openClient(q.clientId)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: colorOf(q.clientId), color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
              {avatarFrom(q.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{q.name}</div>
              <div style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.text}</div>
            </div>
            <StatusBadge label={q.badge} tone={q.tone} />
          </div>
        ))
      )}
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: S.muted }}>
        <span>{messages.length} Unread Messages</span>
        <span>{needs.length} Flagged Clients</span>
      </div>
    </Card>
  );
}

// Small multi-segment donut built from the same top-N+"Other" `groups` data
// ProgramDistribution.jsx already computes — no fixed category taxonomy
// invented (none exists in the schema), just a ring instead of bars.
function ProgramDistributionDonut({ groups }) {
  const total = groups.reduce((s, g) => s + g.count, 0);
  const size = 120, stroke = 16, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let cursor = 0;
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Program Distribution</SectionTitle>
      {total === 0 ? (
        <div style={{ color: S.muted, fontSize: 13 }}>No clients yet.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={S.border} strokeWidth={stroke} />
              {groups.map((g, i) => {
                const frac = g.count / total;
                const dash = frac * c;
                const offset = c * (1 - cursor);
                cursor += frac;
                return <circle key={g.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={stroke} strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={offset} />;
              })}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26 }}>{total}</div>
              <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted }}>Clients</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {groups.map((g, i) => (
              <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span style={{ color: S.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                <span style={{ color: S.muted, flexShrink: 0 }}>{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function CoachHomeMobile({
  totalClients, activeClients, atRiskCount, offlineCount,
  rows, sparklineByClient,
  checkinSeries, checkinDeltaPct, progressSeries, progressDeltaPct,
  checkinCounts, totalCoached, totalCheckinsThisWeek,
  needs, onboardingAlerts, milestoneAlerts, phaseAlerts, messages,
  programGroups,
  nameOf, openClient, setPage, clientIds,
  programSubscriberRows, monthlyRevenue, revenueTrendPct,
}) {
  return (
    <div>
      <PageTitle title="Coaching Dashboard" sub="V12 System · Priority Overview" />
      <PerformanceSnapshot totalClients={totalClients} activeClients={activeClients} atRiskCount={atRiskCount} offlineCount={offlineCount} />
      <ClientOverviewRow rows={rows} sparklineByClient={sparklineByClient} openClient={openClient} setPage={setPage} />
      <PerformanceOverview checkinSeries={checkinSeries} checkinDeltaPct={checkinDeltaPct} progressSeries={progressSeries} progressDeltaPct={progressDeltaPct} />
      <CheckInOverviewCompact counts={checkinCounts} totalCheckinsThisWeek={totalCheckinsThisWeek} setPage={setPage} />
      <AlertsAndMessages needs={needs} onboardingAlerts={onboardingAlerts} milestoneAlerts={milestoneAlerts} phaseAlerts={phaseAlerts} messages={messages} nameOf={nameOf} openClient={openClient} clientIds={clientIds} />
      <ProgramDistributionDonut groups={programGroups} />
      <div style={{ marginBottom: 14 }}><RecentActivityFeed nameOf={nameOf} clientIds={clientIds} /></div>
      <div style={{ marginBottom: 14 }}><RecentNotes nameOf={nameOf} openClient={openClient} clientIds={clientIds} /></div>
      <ProgramSubscribersPanel rows={programSubscriberRows} openClient={openClient} monthlyRevenue={monthlyRevenue} revenueTrendPct={revenueTrendPct} />
    </div>
  );
}
