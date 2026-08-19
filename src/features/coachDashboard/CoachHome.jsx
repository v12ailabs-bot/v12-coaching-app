import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr, avatarFrom } from "../../theme.jsx";
import { PageTitle, Card, CardTitle, Btn, StatusBadge, CollapsibleSection } from "../../components/ui/index.js";
import { COACH_EMAIL } from "../../lib/constants.js";
import { assessClientRisk } from "../../lib/scoring.js";
import { CoachStatCards } from "./CoachStatCards.jsx";
import { ClientOverviewTable } from "./ClientOverviewTable.jsx";
import { AlertsPanel } from "./AlertsPanel.jsx";
import { CheckInOverview } from "./CheckInOverview.jsx";
import { ProgramDistribution } from "./ProgramDistribution.jsx";
import { RecentActivityFeed } from "./RecentActivityFeed.jsx";
import { RecentNotes } from "./RecentNotes.jsx";

const monthStart = () => todayStr().slice(0, 7) + "-01";
const weekStartStr = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]; };

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
  const [lastWorkoutByClient, setLastWorkoutByClient] = useState({});
  const [upgrades, setUpgrades] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [newLeads, setNewLeads] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: cl } = await supabase.from("profiles").select("*").neq("email", COACH_EMAIL).neq("archived", true);
      const list = cl || [];
      const allIds = list.map((c) => c.id);
      const coachedIds = list.filter((c) => c.client_type !== "program_only").map((c) => c.id);

      const { data: ur } = await supabase.from("upgrade_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
      setUpgrades(ur || []);

      const grouped = {};
      let weeklies = [];
      if (allIds.length) {
        // 30 days of daily check-ins for EVERY client (not just coached) — this
        // is the activity signal behind "Active/Inactive" and Recent Activity;
        // progress-based risk flags below still only apply to coached clients.
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29);
        const cut = cutoff.toISOString().split("T")[0];
        const { data: ch } = await supabase.from("daily_checkins")
          .select("client_id,date,weight,workout,diet").in("client_id", allIds).gte("date", cut).order("date");
        (ch || []).forEach((r) => { (grouped[r.client_id] = grouped[r.client_id] || []).push(r); });
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

      // Program-only clients have no check-in feature at all — their only
      // activity signals are habit/weight upserts into daily_checkins (via
      // ProgramHabits) and logged workouts. Fetched separately here so their
      // "last activity" isn't blind to workout logging.
      const programOnlyIds = list.filter((c) => c.client_type === "program_only").map((c) => c.id);
      const lastWorkout = {};
      if (programOnlyIds.length) {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29);
        const cut = cutoff.toISOString().split("T")[0];
        const { data: wl } = await supabase.from("workout_logs").select("client_id,date").in("client_id", programOnlyIds).gte("date", cut).order("date");
        (wl || []).forEach((r) => { if (!lastWorkout[r.client_id] || r.date > lastWorkout[r.client_id]) lastWorkout[r.client_id] = r.date; });
      }

      const { data: leads } = await supabase.from("leads").select("id").gte("created_at", monthStart());
      setNewLeads((leads || []).length);
      const { data: metrics } = await supabase.from("daily_metrics").select("revenue_today").gte("date", monthStart());
      setMonthlyRevenue((metrics || []).reduce((s, m) => s + (Number(m.revenue_today) || 0), 0));

      setClients(list); setByClient(grouped); setWeeklyRecent(weeklies); setGoalsByClient(goalsMap); setProgramByClient(programMap); setLastWorkoutByClient(lastWorkout); setLoading(false);
    })();
  }, []);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const daysSinceDate = (d) => Math.round((new Date(todayStr()) - new Date(d)) / 86400000);

  const assessed = clients.map((c) => {
    const ch = byClient[c.id] || [];
    if (c.client_type === "program_only") {
      // Program-only clients have no check-in feature and no coach
      // relationship, so check-in adherence and progress-based risk flags
      // don't apply at all — computing either would be a fabricated number
      // under a misleading label. "Last activity" instead is a plain date:
      // the more recent of a daily_checkins upsert (habit toggle or
      // weight/waist save, via ProgramHabits) or a logged workout.
      const lastCheckin = ch.length ? ch[ch.length - 1].date : null;
      const lastWorkoutDate = lastWorkoutByClient[c.id] || null;
      const last = [lastCheckin, lastWorkoutDate].filter(Boolean).sort().pop() || null;
      const since = last ? Math.round((new Date(todayStr()) - new Date(last)) / 86400000) : null;
      return { client: c, adh: null, last, since, flags: [], loggingFlags: [], loggingStatus: null, severity: 0, riskLevel: "On Track", goalScore: null, programOnly: true };
    }
    const wk = weeklyRecent.filter((w) => w.client_id === c.id);
    const goal = goalsByClient[c.id] || null;
    // Same assessClientRisk the client's own Home page uses — one source of
    // truth for risk flags shared between the coach and client views.
    return assessClientRisk(c, ch, wk, goal);
  });

  // "Inactive" means no real activity in over a week — for coached clients
  // that's loggingStatus (adherence-aware); for program-only clients (who
  // have no adherence concept) it's a plain day-count against `since`.
  const isInactive = (a) => a.programOnly ? (a.since == null || a.since > 7) : a.loggingStatus?.level === "poor";

  const needs = assessed.filter((a) => a.flags.length > 0).sort((a, b) => b.severity - a.severity);
  const coached = assessed.filter((a) => !a.programOnly);
  const avgAdh = coached.length ? Math.round(coached.reduce((s, a) => s + a.adh.score, 0) / coached.length) : 0;
  const withGoalScore = coached.filter((a) => a.goalScore?.overallScore != null);
  const avgGoalProgress = withGoalScore.length ? Math.round(withGoalScore.reduce((s, a) => s + a.goalScore.overallScore, 0) / withGoalScore.length) : null;
  const inactiveCount = assessed.filter(isInactive).length;

  const nameOf = (id) => { const c = clients.find((x) => x.id === id); return c ? (c.name || c.email) : "Client"; };
  const markHandled = async (id) => {
    setUpgrades((prev) => prev.filter((u) => u.id !== id));
    await supabase.from("upgrade_requests").update({ status: "handled" }).eq("id", id);
  };
  const messages = weeklyRecent.filter((w) => daysSinceDate(w.date) <= 13).map((w) => {
    const items = [];
    if ((w.coach_questions || "").trim()) items.push({ label: "Question", tone: "red", text: w.coach_questions });
    if ((w.adjustments || "").trim()) items.push({ label: "Wants adjusted", tone: "amber", text: w.adjustments });
    if (w.confidence_level != null && w.confidence_level <= 4) items.push({ label: `Low confidence ${w.confidence_level}/10`, tone: "amber", text: w.biggest_challenge || w.mental_blocks || "" });
    if ((w.felt_weaker || "").trim()) items.push({ label: "Felt weaker", tone: "amber", text: w.felt_weaker });
    return items.length ? { id: w.client_id, date: w.date, items } : null;
  }).filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : -1));

  // Rows for the Client Overview table: `bucket` (active/at_risk/inactive) is
  // a mutually-exclusive grouping for the filter tabs (inactive takes
  // precedence — a client who isn't logging in is the more urgent signal
  // than a stale risk flag); `status` is the finer-grained per-row badge.
  const rows = assessed.map((a) => ({
    id: a.client.id,
    name: a.client.name || a.client.email,
    programName: programByClient[a.client.id]?.name || a.client.goal || "—",
    phaseLabel: programByClient[a.client.id]?.phase || null,
    // Program-only clients have no coach-set goal and no check-in feature —
    // null (rendered as "—"), not 0, so the table doesn't imply either exists.
    progress: a.programOnly ? null : (a.goalScore?.overallScore ?? a.adh.score ?? 0),
    checkin: a.programOnly ? null : (a.adh.score ?? 0),
    status: a.riskLevel === "On Track" ? "On Track" : a.riskLevel === "High" ? "At Risk" : "Needs Attention",
    bucket: isInactive(a) ? "inactive" : a.riskLevel === "High" ? "at_risk" : "active",
    lastActivity: a.since == null ? "Never" : a.since === 0 ? "Today" : a.since + "d ago",
  }));

  // This week's daily check-in completion, per coached client: 6-7/7 days
  // logged = completed, 1-5 = partial, 0 = missed.
  const ws = weekStartStr();
  const checkinCounts = { completed: 0, partial: 0, missed: 0 };
  coached.forEach((a) => {
    const daysLogged = new Set((byClient[a.client.id] || []).filter((r) => r.date >= ws).map((r) => r.date)).size;
    if (daysLogged >= 6) checkinCounts.completed++;
    else if (daysLogged >= 1) checkinCounts.partial++;
    else checkinCounts.missed++;
  });

  const programGroups = groupByLabel(clients.map((c) => programByClient[c.id]?.name || c.goal));

  return (
    <div>
      <PageTitle title="Coach Dashboard" sub="V12 System · Priority overview" />

      <CoachStatCards
        totalClients={clients.length}
        activeClients={clients.length - inactiveCount}
        checkInCompletion={avgAdh}
        avgProgress={avgGoalProgress}
        monthlyRevenue={monthlyRevenue}
        newLeads={newLeads}
      />

      <div className="g2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20, alignItems: "start" }}>
        <ClientOverviewTable rows={rows} openClient={openClient} />
        <AlertsPanel needs={needs} openClient={openClient} setPage={setPage} />
      </div>

      <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 20, alignItems: "start" }}>
        <CheckInOverview counts={checkinCounts} total={coached.length} />
        <ProgramDistribution groups={programGroups} />
        <RecentActivityFeed nameOf={nameOf} />
        <RecentNotes nameOf={nameOf} openClient={openClient} />
      </div>

      {messages.length > 0 && (
        <CollapsibleSection title="💬 Client Messages & Flags" summary={`${messages.length} this period`}>
          <Card>
            <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>From weekly check-ins in the last 14 days — questions, requested adjustments, and red flags worth a reply.</div>
            {messages.map((m, i) => (
              <div key={i} onClick={() => openClient(m.id)}
                style={{ background: S.surface, border: "1px solid " + S.border, borderLeft: "3px solid " + (m.items.some((x) => x.tone === "red") ? S.danger : S.warning), padding: "14px 18px", cursor: "pointer", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{nameOf(m.id)}</div>
                  <div style={{ fontSize: 11, color: S.muted }}>Week of {m.date}</div>
                </div>
                {m.items.map((it, j) => (
                  <div key={j} style={{ marginBottom: 6 }}>
                    <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, marginRight: 8, background: it.tone === "red" ? "rgba(239,68,68,.16)" : "rgba(250,204,21,.14)", color: it.tone === "red" ? S.danger : S.warning }}>{it.label}</span>
                    {it.text && <span style={{ fontSize: 13, color: S.text }}>{it.text.length > 160 ? it.text.slice(0, 160) + "…" : it.text}</span>}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </CollapsibleSection>
      )}

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
