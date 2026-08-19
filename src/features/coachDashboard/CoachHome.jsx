import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr, localDateStr, avatarFrom } from "../../theme.jsx";
import { PageTitle, Card, Btn, CollapsibleSection } from "../../components/ui/index.js";
import { COACH_EMAIL } from "../../lib/constants.js";
import { assessClientRisk } from "../../lib/scoring.js";
import { computeGoalScore } from "../../lib/scoring/goalScoring.js";
import { CoachStatCards } from "./CoachStatCards.jsx";
import { ClientOverviewTable } from "./ClientOverviewTable.jsx";
import { AlertsPanel } from "./AlertsPanel.jsx";
import { ClientMessagesPanel } from "./ClientMessagesPanel.jsx";
import { QuickAnalytics } from "./QuickAnalytics.jsx";
import { CheckInOverview } from "./CheckInOverview.jsx";
import { ProgramDistribution } from "./ProgramDistribution.jsx";
import { RecentActivityFeed } from "./RecentActivityFeed.jsx";
import { RecentNotes } from "./RecentNotes.jsx";
import { ProgramSubscribersPanel } from "./ProgramSubscribersPanel.jsx";

const monthStart = () => todayStr().slice(0, 7) + "-01";
const weekStartStr = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]; };
// First of last calendar month, and "the same day-of-month last month" — used
// to compare this-month-so-far figures (revenue, leads, total clients) to an
// equivalent partial window last month instead of a lopsided full-month one.
const monthsAgoStart = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1); return localDateStr(d); };
const monthsAgoSameDay = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return localDateStr(d); };

const WEEKLY_BUCKETS = 6;
const ACTIVITY_WINDOW_DAYS = 7 * WEEKLY_BUCKETS + 6;

// Folds a list of free-text program/goal labels into up to 5 groups + "Other"
// — no fixed taxonomy invented, just a count of what's actually there.
function groupByLabel(labels) {
  const counts = {};
  labels.forEach((l) => { const k = (l || "Unspecified").trim() || "Unspecified"; counts[k] = (counts[k] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const groups = entries.slice(0, 5).map(([label, count]) => ({ label, count }));
  const restCount = entries.slice(5).reduce((s, [, c]) => s + c, 0);
  if (restCount > 0) groups.push({ label: "Other", count: restCount });
  return groups;
}

export function CoachHome({ setPage, openClient }) {
  const [clients, setClients] = useState([]);
  const [byClient, setByClient] = useState({});
  const [weeklyRecent, setWeeklyRecent] = useState([]);
  const [goalsByClient, setGoalsByClient] = useState({});
  const [programByClient, setProgramByClient] = useState({});
  // Last real activity per client, from whichever of the four data sources a
  // client actually writes to (daily check-in, weekly check-in, workout log,
  // progress photo) — not just daily_checkins. A client who only logs
  // workouts, or only does weekly check-ins, still shows a real "last
  // activity" instead of "Never"/a stale date.
  const [lastActivityByClient, setLastActivityByClient] = useState({});
  const [upgrades, setUpgrades] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [lastMonthRevenue, setLastMonthRevenue] = useState(0);
  const [newLeads, setNewLeads] = useState(0);
  const [lastMonthLeads, setLastMonthLeads] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: cl } = await supabase.from("profiles").select("*").neq("email", COACH_EMAIL).neq("archived", true);
      const list = cl || [];
      const allIds = list.map((c) => c.id);
      const coachedIds = list.filter((c) => c.client_type !== "program_only").map((c) => c.id);

      const { data: ur } = await supabase.from("upgrade_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
      setUpgrades(ur || []);

      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - ACTIVITY_WINDOW_DAYS);
      const cut = localDateStr(cutoff);

      const grouped = {};
      let weeklies = [];
      let workoutLogs = [];
      let photos = [];
      if (allIds.length) {
        // ~8 weeks of daily check-ins for EVERY client (not just coached) —
        // this is one of the activity signals behind "Active/Inactive" and
        // Recent Activity, AND (for coached clients) the raw history the
        // Quick Analytics weekly trend buckets are computed from.
        const { data: ch } = await supabase.from("daily_checkins")
          .select("client_id,date,weight,workout,diet").in("client_id", allIds).gte("date", cut).order("date");
        (ch || []).forEach((r) => { (grouped[r.client_id] = grouped[r.client_id] || []).push(r); });

        // Workout logs and progress photos, for EVERY client — previously
        // only fetched for program-only clients, which is why a coached
        // client who trains and logs workouts/photos but skips the formal
        // daily check-in showed "Never"/a stale "Last Activity" despite
        // being clearly active.
        const [{ data: wl }, { data: pp }] = await Promise.all([
          supabase.from("workout_logs").select("client_id,date").in("client_id", allIds).gte("date", cut),
          supabase.from("progress_photos").select("client_id,created_at").in("client_id", allIds).gte("created_at", cutoff.toISOString()),
        ]);
        workoutLogs = wl || [];
        photos = pp || [];
      }
      if (coachedIds.length) {
        const wcutoff = new Date(); wcutoff.setDate(wcutoff.getDate() - 27);
        const wcut = wcutoff.toISOString().split("T")[0];
        const { data: wc } = await supabase.from("weekly_checkins")
          .select("client_id,date,coach_questions,adjustments,confidence_level,felt_weaker,biggest_challenge,mental_blocks,sleep_quality,hydration_quality")
          .in("client_id", coachedIds).gte("date", wcut).order("date");
        weeklies = wc || [];
      }
      const { data: cg } = coachedIds.length ? await supabase.from("client_goals").select("*").in("client_id", coachedIds).eq("status", "active").eq("metric_key", "bodyweight") : { data: [] };
      const goalsMap = {}; (cg || []).forEach((g) => { goalsMap[g.client_id] = g; });

      const programMap = {};
      if (allIds.length) {
        const { data: progs } = await supabase.from("programs").select("client_id,name,phase").in("client_id", allIds).order("created_at", { ascending: false });
        (progs || []).forEach((p) => { if (!programMap[p.client_id]) programMap[p.client_id] = p; });
      }

      // Merge the four "did something" signals into one last-activity date
      // per client — whichever is most recent wins.
      const lastActivity = {};
      const bump = (id, date) => { if (date && (!lastActivity[id] || date > lastActivity[id])) lastActivity[id] = date; };
      Object.values(grouped).flat().forEach((r) => bump(r.client_id, r.date));
      weeklies.forEach((r) => bump(r.client_id, r.date));
      workoutLogs.forEach((r) => bump(r.client_id, r.date));
      photos.forEach((r) => bump(r.client_id, (r.created_at || "").slice(0, 10)));

      // Leads and revenue: fetch back to the start of last month so this
      // month's figure can be compared against the same partial window last
      // month (1st through today's day-of-month), not a lopsided full month.
      const { data: leads } = await supabase.from("leads").select("id,created_at").gte("created_at", monthsAgoStart(1));
      const leadDateOf = (l) => (l.created_at || "").slice(0, 10);
      setNewLeads((leads || []).filter((l) => leadDateOf(l) >= monthStart()).length);
      setLastMonthLeads((leads || []).filter((l) => leadDateOf(l) >= monthsAgoStart(1) && leadDateOf(l) <= monthsAgoSameDay(1)).length);

      const { data: metrics } = await supabase.from("daily_metrics").select("revenue_today,date").gte("date", monthsAgoStart(1));
      const sumRevenue = (rows) => rows.reduce((s, m) => s + (Number(m.revenue_today) || 0), 0);
      setMonthlyRevenue(sumRevenue((metrics || []).filter((m) => m.date >= monthStart())));
      setLastMonthRevenue(sumRevenue((metrics || []).filter((m) => m.date >= monthsAgoStart(1) && m.date <= monthsAgoSameDay(1))));

      setClients(list); setByClient(grouped); setWeeklyRecent(weeklies); setGoalsByClient(goalsMap); setProgramByClient(programMap); setLastActivityByClient(lastActivity); setLoading(false);
    })();
  }, []);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const sinceOf = (id) => {
    const last = lastActivityByClient[id] || null;
    return last ? Math.round((new Date(todayStr()) - new Date(last)) / 86400000) : null;
  };
  const lastActivityLabel = (since) => (since == null ? "Never" : since === 0 ? "Today" : since + "d ago");

  const coachedList = clients.filter((c) => c.client_type !== "program_only");
  const programOnlyList = clients.filter((c) => c.client_type === "program_only");

  // One coached client's full assessment — same assessClientRisk the
  // client's own Home page uses (one source of truth for risk flags), with
  // `last`/`since` overridden by the broader lastActivityByClient signal
  // above (assessClientRisk's own daily-checkin-only last/since still drives
  // `adh`/`loggingStatus`, which is specifically about check-in adherence,
  // not "did they use the app at all").
  const assessedCoached = coachedList.map((c) => {
    const ch = byClient[c.id] || [];
    const wk = weeklyRecent.filter((w) => w.client_id === c.id);
    const goal = goalsByClient[c.id] || null;
    const risk = assessClientRisk(c, ch, wk, goal);
    const since = sinceOf(c.id);
    return { ...risk, client: c, last: lastActivityByClient[c.id] || null, since };
  });

  // "Inactive" = poor check-in adherence (loggingStatus, not just a plain day
  // count) — coaching clients only, per the structural split below. "At
  // Risk" = has a real progress/nutrition/recovery flag AND isn't already
  // flagged inactive — inactive is the more urgent, mutually-exclusive
  // signal, so a client never double-counts into both, and the Alerts panel
  // (built from the same `isAtRisk`) and the table's "At Risk" filter always
  // show the same clients.
  const isInactive = (a) => a.loggingStatus?.level === "poor";
  const isAtRisk = (a) => !isInactive(a) && a.flags.length > 0;

  const needs = assessedCoached.filter(isAtRisk).sort((a, b) => b.severity - a.severity);
  const inactiveCount = assessedCoached.filter(isInactive).length;
  const withGoalScore = assessedCoached.filter((a) => a.goalScore?.overallScore != null);
  const avgGoalProgress = withGoalScore.length ? Math.round(withGoalScore.reduce((s, a) => s + a.goalScore.overallScore, 0) / withGoalScore.length) : null;

  const nameOf = (id) => { const c = clients.find((x) => x.id === id); return c ? (c.name || c.email) : "Client"; };
  const markHandled = async (id) => {
    setUpgrades((prev) => prev.filter((u) => u.id !== id));
    await supabase.from("upgrade_requests").update({ status: "handled" }).eq("id", id);
  };
  const daysSinceDate = (d) => Math.round((new Date(todayStr()) - new Date(d)) / 86400000);
  const messages = weeklyRecent.filter((w) => daysSinceDate(w.date) <= 13).map((w) => {
    const items = [];
    if ((w.coach_questions || "").trim()) items.push({ label: "Question", tone: "red", text: w.coach_questions });
    if ((w.adjustments || "").trim()) items.push({ label: "Wants adjusted", tone: "amber", text: w.adjustments });
    if (w.confidence_level != null && w.confidence_level <= 4) items.push({ label: `Low confidence ${w.confidence_level}/10`, tone: "amber", text: w.biggest_challenge || w.mental_blocks || "" });
    if ((w.felt_weaker || "").trim()) items.push({ label: "Felt weaker", tone: "amber", text: w.felt_weaker });
    return items.length ? { id: w.client_id, date: w.date, items } : null;
  }).filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : -1));

  // Rows for the Client Overview table — coaching clients only. `bucket`
  // (active/at_risk/inactive) is a mutually-exclusive grouping for the filter
  // tabs; `status` is the per-row badge, and now reflects inactivity too (an
  // inactive client never shows a misleadingly-green "On Track").
  const rows = assessedCoached.map((a) => ({
    id: a.client.id,
    name: a.client.name || a.client.email,
    programName: programByClient[a.client.id]?.name || a.client.goal || "—",
    phaseLabel: programByClient[a.client.id]?.phase || null,
    progress: a.goalScore?.overallScore ?? a.adh.score ?? 0,
    checkin: a.adh.score ?? 0,
    status: isInactive(a) ? "Inactive" : isAtRisk(a) ? (a.riskLevel === "High" ? "At Risk" : "Needs Attention") : "On Track",
    bucket: isInactive(a) ? "inactive" : isAtRisk(a) ? "at_risk" : "active",
    lastActivity: lastActivityLabel(a.since),
  }));

  const programSubscriberRows = programOnlyList.map((c) => {
    const since = sinceOf(c.id);
    return {
      id: c.id,
      name: c.name || c.email,
      programName: programByClient[c.id]?.name || c.goal || "—",
      lastActivity: lastActivityLabel(since),
    };
  });

  // This week's daily check-in completion, per coached client: 6-7/7 days
  // logged = completed, 1-5 = partial, 0 = missed.
  const ws = weekStartStr();
  const checkinCounts = { completed: 0, partial: 0, missed: 0 };
  coachedList.forEach((c) => {
    const daysLogged = new Set((byClient[c.id] || []).filter((r) => r.date >= ws).map((r) => r.date)).size;
    if (daysLogged >= 6) checkinCounts.completed++;
    else if (daysLogged >= 1) checkinCounts.partial++;
    else checkinCounts.missed++;
  });

  const programGroups = groupByLabel(clients.map((c) => programByClient[c.id]?.name || c.goal));

  // Quick Analytics' two weekly trend series, computed from data every other
  // panel on this page already reads — no new tracking table. Each of the
  // last WEEKLY_BUCKETS weeks gets its own trailing-7-day snapshot:
  //   - checkin completion: days logged / 7, averaged across coached clients.
  //   - client progress: computeGoalScore's primary-metric score (the same
  //     scorer assessClientRisk uses), averaged across clients with an active
  //     bodyweight goal, evaluated as-of that week's end date instead of
  //     today. This is a primary-metric-only approximation of the richer,
  //     nutrition/training-blended goalScore shown elsewhere on a client's
  //     own page — a fair trend signal, even though the absolute value can
  //     differ slightly from that blended score.
  const trailingCompletionPct = (clientId, end) => {
    const start = new Date(end); start.setDate(start.getDate() - 6);
    const startStr = localDateStr(start), endStr = localDateStr(end);
    const days = new Set((byClient[clientId] || []).filter((r) => r.date >= startStr && r.date <= endStr).map((r) => r.date)).size;
    return (days / 7) * 100;
  };
  const clientsWithGoal = coachedList.filter((c) => goalsByClient[c.id]);
  const checkinSeries = [], progressSeries = [];
  for (let i = WEEKLY_BUCKETS - 1; i >= 0; i--) {
    const end = new Date(); end.setDate(end.getDate() - i * 7);
    const label = localDateStr(end);

    const completionVals = coachedList.map((c) => trailingCompletionPct(c.id, end));
    checkinSeries.push({ label, value: completionVals.length ? Math.round(completionVals.reduce((s, v) => s + v, 0) / completionVals.length) : null });

    const progressVals = clientsWithGoal.map((c) => {
      const goal = goalsByClient[c.id];
      const series = (byClient[c.id] || []).filter((r) => r.weight != null).map((r) => ({ date: r.date, value: r.weight }));
      return computeGoalScore(goal, series, {}, end).overallScore;
    }).filter((v) => v != null);
    progressSeries.push({ label, value: progressVals.length ? Math.round(progressVals.reduce((s, v) => s + v, 0) / progressVals.length) : null });
  }
  const deltaOf = (series) => {
    const cur = series[series.length - 1].value, prev = series[series.length - 2]?.value;
    return cur == null || prev == null ? null : Math.round(cur - prev);
  };
  const checkinNow = checkinSeries[checkinSeries.length - 1].value;
  const progressNow = progressSeries[progressSeries.length - 1].value;

  // Real, derivable month-over-month trends only, scoped to coaching clients
  // (consistent with Total/Active Clients below) — Active Clients has no
  // historical snapshot to diff against, so it gets no trend rather than a
  // fabricated one.
  const cutoffLastMonth = monthsAgoSameDay(1);
  const coachedAsOfLastMonth = coachedList.filter((c) => c.created_at && c.created_at.slice(0, 10) <= cutoffLastMonth).length;
  const totalClientsTrendPct = coachedAsOfLastMonth > 0 ? Math.round(((coachedList.length - coachedAsOfLastMonth) / coachedAsOfLastMonth) * 100) : null;
  const revenueTrendPct = lastMonthRevenue > 0 ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : null;
  const leadsTrendPct = lastMonthLeads > 0 ? Math.round(((newLeads - lastMonthLeads) / lastMonthLeads) * 100) : null;

  return (
    <div>
      <PageTitle title="Coach Dashboard" sub="V12 System · Priority overview" />

      <CoachStatCards
        totalClients={coachedList.length}
        totalClientsTrendPct={totalClientsTrendPct}
        activeClients={coachedList.length - inactiveCount}
        checkInCompletion={checkinNow ?? 0}
        checkInTrendPct={deltaOf(checkinSeries)}
        avgProgress={avgGoalProgress}
        avgProgressTrendPct={deltaOf(progressSeries)}
        monthlyRevenue={monthlyRevenue}
        revenueTrendPct={revenueTrendPct}
        newLeads={newLeads}
        leadsTrendPct={leadsTrendPct}
      />

      <div className="coach-grid-main" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <ClientOverviewTable rows={rows} openClient={openClient} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <AlertsPanel needs={needs} openClient={openClient} setPage={setPage} />
          <ClientMessagesPanel messages={messages} nameOf={nameOf} openClient={openClient} />
        </div>
      </div>

      <div className="coach-tile-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginBottom: 20, alignItems: "start" }}>
        <QuickAnalytics
          checkin={{ current: checkinNow, deltaPct: deltaOf(checkinSeries), series: checkinSeries }}
          progress={{ current: progressNow, deltaPct: deltaOf(progressSeries), series: progressSeries }}
        />
        <CheckInOverview counts={checkinCounts} total={coachedList.length} />
        <ProgramDistribution groups={programGroups} />
        <RecentActivityFeed nameOf={nameOf} clientIds={coachedList.map((c) => c.id)} />
        <RecentNotes nameOf={nameOf} openClient={openClient} />
      </div>

      <ProgramSubscribersPanel rows={programSubscriberRows} openClient={openClient} />

      {upgrades.length > 0 && (
        <CollapsibleSection title="💎 Upgrade Requests" summary={`${upgrades.length} pending`}>
          <Card style={{ borderLeft: "3px solid " + S.neon }}>
            <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>Program-only clients who want to move to full coaching. Reach out, then mark handled.</div>
            {upgrades.map((u) => (
              <div key={u.id} style={{ background: S.surface, border: "1px solid " + S.border, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: S.neon, color: "#0B0B0D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {avatarFrom(nameOf(u.client_id))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{nameOf(u.client_id)}</div>
                  <div style={{ fontSize: 12, color: S.muted }}>Wants to upgrade to coaching · {(u.created_at || "").slice(0, 10)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Btn sm teal onClick={() => openClient(u.client_id)}>Open Client</Btn>
                  <Btn sm onClick={() => markHandled(u.id)}>Mark handled</Btn>
                </div>
              </div>
            ))}
          </Card>
        </CollapsibleSection>
      )}
    </div>
  );
}
