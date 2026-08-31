import { useState } from "react";
import { S, RADIUS, avatarFrom, COLORS } from "../../theme.jsx";
import { PageTitle, Card, StatusBadge, ProgressRing } from "../../components/ui/index.js";
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

// `trendPct` (month-over-month change) and `pctOfTotal` (share of the
// roster) are mutually exclusive per tile — Total Clients gets a real trend
// to compare against, since there's history to diff against; Active/At
// Risk/Offline get a share-of-roster percentage instead, since "60% active"
// is the meaningful comparison for those, not a trend with no baseline.
function SnapshotTile({ label, value, trendPct, pctOfTotal }) {
  return (
    <div style={{ background: S.surface2, border: "1px solid " + S.border, borderRadius: RADIUS.sm, padding: 14 }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, lineHeight: 1 }}>{value}</div>
        {trendPct != null && <TrendPill deltaPct={trendPct} />}
        {pctOfTotal != null && <span style={{ fontSize: 12, color: S.muted, fontWeight: 600 }}>{pctOfTotal}%</span>}
      </div>
    </div>
  );
}

function PerformanceSnapshot({ totalClients, totalClientsTrendPct, activeClients, atRiskCount, offlineCount, monthlyRevenue, revenueTrendPct }) {
  const pctOf = (n) => (totalClients ? Math.round((n / totalClients) * 100) : 0);
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Performance Snapshot</SectionTitle>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid " + S.border }}>
        <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>Monthly Revenue</span>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24 }}>${(monthlyRevenue || 0).toLocaleString()}</span>
        <TrendPill deltaPct={revenueTrendPct} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <SnapshotTile label="Total Clients" value={totalClients} trendPct={totalClientsTrendPct} />
        <SnapshotTile label="Active" value={activeClients} pctOfTotal={pctOf(activeClients)} />
        <SnapshotTile label="At Risk" value={atRiskCount} pctOfTotal={pctOf(atRiskCount)} />
        <SnapshotTile label="Offline" value={offlineCount} pctOfTotal={pctOf(offlineCount)} />
      </div>
    </Card>
  );
}

// Circular progress rings (same primitive/visual language as the V12
// Assessment 3-ring summary) instead of an avatar-and-sparkline row — a
// coach scanning this wants "who's at what %", which a ring reads at a
// glance better than a tiny axis-less line chart under a small initial.
function ClientOverviewRow({ rows, openClient, setPage }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle action={<button onClick={() => setPage("clients")} style={{ background: "none", border: "none", color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>See all →</button>}>Client Overview</SectionTitle>
      <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 4 }}>
        {rows.map((r, i) => (
          <div key={r.id} onClick={() => openClient(r.id)} style={{ flexShrink: 0, width: 76, cursor: "pointer", textAlign: "center" }}>
            <ProgressRing value={r.progress} size={64} strokeWidth={6} color={COLORS[i % COLORS.length]} />
            <div style={{ fontSize: 11, fontWeight: 600, color: S.text, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name.split(" ")[0]}</div>
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

function CheckInOverviewCompact({ counts, totalCheckinsThisWeek }) {
  const totalClients = counts.completed + counts.partial + counts.missed;
  const completionRate = totalClients ? Math.round((counts.completed / totalClients) * 100) : 0;
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Check-In Overview <span style={{ fontSize: 10, color: S.muted, fontWeight: 400, marginLeft: 6 }}>This Week</span></SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24 }}>{totalCheckinsThisWeek}</div><div style={{ fontSize: 10, color: S.muted }}>Total Check-ins</div></div>
        <div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.accent2 }}>{completionRate}%</div><div style={{ fontSize: 10, color: S.muted }}>Completion Rate</div></div>
        <div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.danger }}>{counts.missed}</div><div style={{ fontSize: 10, color: S.muted }}>Missed</div></div>
      </div>
    </Card>
  );
}

// Merges the 5 desktop alert panels (at-risk, onboarding, milestone, phase,
// messages) into one severity-sorted list, GROUPED BY CLIENT (one row per
// client, not per issue — a client with 3 open issues showed up 3 times
// before, which read as a bug). Each reason keeps its own coaching-cue
// detail/action (same fields the desktop AlertsPanel already had — `detail`/
// `action` on risk flags, `text` on message flags) instead of collapsing to
// just a bare label, so expanding a row answers "why is this client here."
function buildAlertGroups({ needs, onboardingAlerts, milestoneAlerts, phaseAlerts, messages, nameOf }) {
  const byClient = {};
  const ensure = (id, name) => (byClient[id] = byClient[id] || { clientId: id, name, reasons: [], severity: 0 });

  needs.forEach((n) => {
    const g = ensure(n.client.id, n.client.name || n.client.email);
    n.flags.forEach((f) => g.reasons.push({ source: "Risk", label: f.label, detail: f.detail, action: f.action, tone: f.tone === "red" ? "red" : "amber" }));
    g.severity = Math.max(g.severity, n.riskLevel === "High" ? 3 : 2);
  });
  phaseAlerts.forEach((a) => {
    const g = ensure(a.clientId, nameOf(a.clientId));
    g.reasons.push({
      source: "Program Phase", label: a.phase,
      detail: a.daysUntilEnd < 0 ? `Ended ${Math.abs(a.daysUntilEnd)} day${Math.abs(a.daysUntilEnd) === 1 ? "" : "s"} ago` : a.daysUntilEnd === 0 ? "Ends today" : `Ends in ${a.daysUntilEnd} day${a.daysUntilEnd === 1 ? "" : "s"}`,
      action: a.nextPhase ? `Next phase: ${a.nextPhase}` : null, tone: "amber",
    });
    g.severity = Math.max(g.severity, 2);
  });
  messages.forEach((m) => {
    const g = ensure(m.id, nameOf(m.id));
    m.items.forEach((it) => g.reasons.push({ source: "Weekly Check-In", label: it.label, detail: it.text || null, tone: it.tone === "red" ? "red" : "amber" }));
    g.severity = Math.max(g.severity, m.items.some((x) => x.tone === "red") ? 3 : 1);
  });
  milestoneAlerts.filter((a) => a.kind === "approaching").forEach((a) => {
    const g = ensure(a.clientId, nameOf(a.clientId));
    g.reasons.push({ source: "Milestone", label: a.exercise, detail: `${a.pct}% of the way to target`, tone: "amber" });
    g.severity = Math.max(g.severity, 1);
  });
  onboardingAlerts.forEach((a) => {
    const g = ensure(a.clientId, nameOf(a.clientId));
    g.reasons.push({ source: "Onboarding", label: "Needs your review", detail: null, tone: "amber" });
    g.severity = Math.max(g.severity, 1);
  });

  return Object.values(byClient).sort((a, b) => b.severity - a.severity);
}

function AlertsAndMessages({ needs, onboardingAlerts, milestoneAlerts, phaseAlerts, messages, nameOf, openClient, clientIds }) {
  const [openId, setOpenId] = useState(null);
  const groups = buildAlertGroups({ needs, onboardingAlerts, milestoneAlerts, phaseAlerts, messages, nameOf });
  const colorOf = (id) => COLORS[Math.max(0, clientIds.indexOf(id)) % COLORS.length];
  const flaggedClients = new Set(needs.map((n) => n.client.id)).size;
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionTitle>Alerts &amp; Messages</SectionTitle>
      {groups.length === 0 ? (
        <div style={{ color: S.success, fontSize: 13, padding: "8px 0" }}>All clients are on track. Nice work.</div>
      ) : (
        groups.slice(0, 8).map((g) => {
          const open = openId === g.clientId;
          const badge = g.severity >= 3 ? "At Risk" : "Monitor";
          const tone = g.severity >= 3 ? "red" : "amber";
          return (
            <div key={g.clientId} style={{ borderBottom: "1px solid " + S.border }}>
              <div onClick={() => setOpenId(open ? null : g.clientId)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: colorOf(g.clientId), color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  {avatarFrom(g.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {g.reasons.length > 1 ? `${g.reasons.length} things need attention` : g.reasons[0]?.label}
                  </div>
                </div>
                <StatusBadge label={badge} tone={tone} />
                <span style={{ color: S.muted, fontSize: 11, transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", flexShrink: 0 }}>▶</span>
              </div>
              {open && (
                <div style={{ padding: "0 0 14px 44px" }}>
                  {g.reasons.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: S.text, padding: "8px 0", borderTop: i === 0 ? "1px solid " + S.border : "none", paddingTop: i === 0 ? 10 : 8 }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 3 }}>{r.source}</div>
                      <div><span style={{ fontWeight: 600, color: r.tone === "red" ? S.danger : S.warning }}>{r.label}.</span> {r.detail}</div>
                      {r.action && <div style={{ color: S.muted, marginTop: 2 }}>→ {r.action}</div>}
                    </div>
                  ))}
                  <button onClick={() => openClient(g.clientId)} style={{ marginTop: 10, background: "none", border: "none", color: S.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>Open Client →</button>
                </div>
              )}
            </div>
          );
        })
      )}
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: S.muted }}>
        <span>{messages.length} Unread Messages</span>
        <span>{flaggedClients} Flagged Clients</span>
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
  totalClients, totalClientsTrendPct, activeClients, atRiskCount, offlineCount,
  rows,
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
      <PerformanceSnapshot totalClients={totalClients} totalClientsTrendPct={totalClientsTrendPct} activeClients={activeClients} atRiskCount={atRiskCount} offlineCount={offlineCount} monthlyRevenue={monthlyRevenue} revenueTrendPct={revenueTrendPct} />
      <ClientOverviewRow rows={rows} openClient={openClient} setPage={setPage} />
      <PerformanceOverview checkinSeries={checkinSeries} checkinDeltaPct={checkinDeltaPct} progressSeries={progressSeries} progressDeltaPct={progressDeltaPct} />
      <CheckInOverviewCompact counts={checkinCounts} totalCheckinsThisWeek={totalCheckinsThisWeek} />
      <AlertsAndMessages needs={needs} onboardingAlerts={onboardingAlerts} milestoneAlerts={milestoneAlerts} phaseAlerts={phaseAlerts} messages={messages} nameOf={nameOf} openClient={openClient} clientIds={clientIds} />
      <ProgramDistributionDonut groups={programGroups} />
      <div style={{ marginBottom: 14 }}><RecentActivityFeed nameOf={nameOf} clientIds={clientIds} /></div>
      <div style={{ marginBottom: 14 }}><RecentNotes nameOf={nameOf} openClient={openClient} clientIds={clientIds} /></div>
      <ProgramSubscribersPanel rows={programSubscriberRows} openClient={openClient} monthlyRevenue={monthlyRevenue} revenueTrendPct={revenueTrendPct} />
    </div>
  );
}
