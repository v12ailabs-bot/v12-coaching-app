import { supabaseAdmin } from "./supabaseAdmin.js";
import { strengthTrendsFrom } from "./strengthTrends.js";
import { currentMilestoneValues } from "./milestones.js";
// @ts-ignore -- plain JS, no type declarations; see tsconfig allowJs.
import { nutritionAdherenceFrom } from "../../src/lib/scoring/nutritionAdherence.js";
// @ts-ignore
import { assessClientRisk } from "../../src/lib/scoring.js";

// HC-004 "Core State APIs" -- read-only accessor functions over EXISTING
// tables (no new schema, per the HC-002 decision to reuse client_goals etc.
// instead of new objectives/current_states tables). This is a data-access
// layer only: no assembly/synthesis logic (that's the Context Builder,
// HC-006), no rules (HC-007), no authority (HC-013). Every function here
// just answers "what does this one piece of Core State currently say,"
// reusing the exact same pure scoring/aggregation functions the rest of the
// app already uses for the same data, so this never becomes a second,
// silently-divergent read path for something GoalsSection/CoachHome/
// goal-insight.js already compute correctly.
//
// Not wired into anything yet -- no route imports this module. It exists so
// HC-005 (task creation) and HC-006 (Context Builder) have a stable,
// reusable layer to build on instead of each reinventing these queries.

const DEFAULT_WINDOW_DAYS = 30;
const cutoffDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
};

export interface ClientCore {
  id: string;
  name: string | null;
  email: string;
  role: string;
  clientType: string;
  goal: string | null;
  age: number | null;
  sex: string | null;
  assessment: {
    nervousSystemRecruitment: number | null;
    muscularDensityToSize: number | null;
    metabolicWorkCapacity: number | null;
  };
}

// Client + service tier in one read -- the spec's "client" and "service" are
// both just columns on the existing `profiles` row in this app (client_type
// doubles as tier), not separate tables.
export async function getClientCore(clientId: string): Promise<ClientCore | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,name,email,role,client_type,goal,age,sex,nervous_system_recruitment,muscular_density_to_size,metabolic_work_capacity")
    .eq("id", clientId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    clientType: data.client_type,
    goal: data.goal,
    age: data.age,
    sex: data.sex,
    assessment: {
      nervousSystemRecruitment: data.nervous_system_recruitment,
      muscularDensityToSize: data.muscular_density_to_size,
      metabolicWorkCapacity: data.metabolic_work_capacity,
    },
  };
}

export interface ObjectiveAndCurrentState {
  goal: Record<string, unknown>;
  currentValue: number | null;
  series: { date: string; value: number }[];
}

// The client's primary bodyweight objective + its live current value, same
// metric_key='bodyweight' convention and daily/weekly merge rule as
// GoalsSection.jsx and the single-goal path in api/goal-insight.js. Returns
// null if the client has no active weight goal set (common for programOnly/
// starter tiers, or a coaching client who hasn't set one yet) -- callers
// must treat that as "no objective," not an error.
export async function getObjectiveAndCurrentState(clientId: string): Promise<ObjectiveAndCurrentState | null> {
  const cut = cutoffDate(44);
  const [{ data: goals }, { data: daily }, { data: weekly }] = await Promise.all([
    supabaseAdmin.from("client_goals").select("*").eq("client_id", clientId).eq("status", "active").eq("metric_key", "bodyweight").order("created_at", { ascending: false }).limit(1),
    supabaseAdmin.from("daily_checkins").select("date,weight").eq("client_id", clientId).gte("date", cut).order("date"),
    supabaseAdmin.from("weekly_checkins").select("date,bodyweight").eq("client_id", clientId).gte("date", cut).order("date"),
  ]);
  const goal = goals?.[0];
  if (!goal) return null;

  const byDate: Record<string, number> = {};
  (daily || []).forEach((d: any) => { if (d.weight != null) byDate[d.date] = d.weight; });
  (weekly || []).forEach((w: any) => { if (w.bodyweight != null && byDate[w.date] == null) byDate[w.date] = w.bodyweight; });
  const series = Object.entries(byDate).map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));

  return { goal, currentValue: series.length ? series[series.length - 1].value : null, series };
}

// Exercise-based milestones (category not null) -- the OTHER half of
// client_goals, separate from the single bodyweight objective above. Reuses
// the same current-value extraction as api/goal-insight.js's AI actions, via
// the shared api/_lib/milestones.js helper (not reimplemented here).
export async function getActiveMilestones(clientId: string): Promise<Record<string, unknown>[]> {
  const { data: milestones } = await supabaseAdmin.from("client_goals").select("*").eq("client_id", clientId).eq("status", "active").not("category", "is", null);
  return currentMilestoneValues(clientId, milestones || []);
}

export interface ActiveProgram {
  id: string;
  name: string | null;
  goal: string | null;
  experienceLevel: string | null;
  weeks: number | null;
  startDate: string | null;
  phase: string | null;
  phaseWeekStart: number | null;
  phaseWeekEnd: number | null;
}

// Most recently created program for this client. "Active" here follows the
// existing app-wide convention (ProgramSection, ProgramRoadmapCard): the
// latest program row, not a status flag -- this app has no concept of
// multiple concurrently-active programs per client today.
export async function getActiveProgram(clientId: string): Promise<ActiveProgram | null> {
  const { data } = await supabaseAdmin
    .from("programs")
    .select("id,name,goal,experience_level,weeks,start_date,phase,phase_week_start,phase_week_end")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    goal: data.goal,
    experienceLevel: data.experience_level,
    weeks: data.weeks,
    startDate: data.start_date,
    phase: data.phase,
    phaseWeekStart: data.phase_week_start,
    phaseWeekEnd: data.phase_week_end,
  };
}

export interface ActivePhase {
  id: string;
  phase: string;
  weekStart: number | null;
  weekEnd: number | null;
  objective: string | null;
  trainingFocus: string | null;
  movementFocus: string | null;
  progressionStrategy: string | null;
  exitCriteria: unknown[];
}

// The program_phases row matching the program's current `phase` name -- the
// same lookup handlePhaseRecommendation (api/goal-insight.js) does when a
// coach requests a recommendation for "the current phase." programs.phase is
// the coach-set source of truth for which phase is active; program_phases is
// the forward-looking planned roadmap (per HANDOFF.md §4), not itself a
// pointer to "now."
export async function getActivePhase(programId: string, phaseName: string | null): Promise<ActivePhase | null> {
  if (!phaseName) return null;
  const { data } = await supabaseAdmin
    .from("program_phases")
    .select("id,phase,week_start,week_end,objective,training_focus,movement_focus,progression_strategy,exit_criteria")
    .eq("program_id", programId)
    .eq("phase", phaseName)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    phase: data.phase,
    weekStart: data.week_start,
    weekEnd: data.week_end,
    objective: data.objective,
    trainingFocus: data.training_focus,
    movementFocus: data.movement_focus,
    progressionStrategy: data.progression_strategy,
    exitCriteria: data.exit_criteria || [],
  };
}

export interface RecentPerformance {
  windowDays: number;
  strengthTrends: ReturnType<typeof strengthTrendsFrom>;
  trainingConsistencyPct: number | null;
}

// Per-exercise top-set movement (strengthTrendsFrom -- the exact same pure
// function generateGoalInsight/generatePhaseRecommendation/generateRoadmap
// already use) plus % of days in the window with a completed workout, same
// "workout === 'completed'" convention as api/goal-insight.js's single-goal
// path.
export async function getRecentPerformance(clientId: string, windowDays = DEFAULT_WINDOW_DAYS): Promise<RecentPerformance> {
  const cut = cutoffDate(windowDays);
  const [{ data: workoutLogs }, { data: daily }] = await Promise.all([
    supabaseAdmin.from("workout_logs").select("date,exercise_id,weight,reps").eq("client_id", clientId).gte("date", cut),
    supabaseAdmin.from("daily_checkins").select("date,workout").eq("client_id", clientId).gte("date", cut),
  ]);

  const exerciseIds = [...new Set((workoutLogs || []).map((l: any) => l.exercise_id).filter(Boolean))];
  const { data: exRows } = exerciseIds.length
    ? await supabaseAdmin.from("exercises").select("id,name,is_bodyweight").in("id", exerciseIds)
    : { data: [] as any[] };
  const exerciseById: Record<string, any> = {};
  (exRows || []).forEach((e: any) => { exerciseById[e.id] = e; });

  const rows = daily || [];
  const trainingConsistencyPct = rows.length
    ? Math.round((rows.filter((d: any) => d.workout === "completed").length / rows.length) * 100)
    : null;

  return {
    windowDays,
    strengthTrends: strengthTrendsFrom(workoutLogs || [], exerciseById),
    trainingConsistencyPct,
  };
}

export interface NutritionContext {
  windowDays: number;
  plan: { calories: number | null; proteinG: number | null; carbsG: number | null; fatsG: number | null } | null;
  adherencePct: number | null;
}

export async function getNutritionContext(clientId: string, windowDays = DEFAULT_WINDOW_DAYS): Promise<NutritionContext> {
  const cut = cutoffDate(windowDays);
  const [{ data: nutPlan }, { data: daily }] = await Promise.all([
    supabaseAdmin.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id", clientId).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("daily_checkins").select("date,calories,protein_g,carbs_g,fats_g,workout").eq("client_id", clientId).gte("date", cut),
  ]);
  return {
    windowDays,
    plan: nutPlan ? { calories: nutPlan.calories, proteinG: nutPlan.protein_g, carbsG: nutPlan.carbs_g, fatsG: nutPlan.fats_g } : null,
    adherencePct: nutritionAdherenceFrom(daily || [], nutPlan || null, windowDays).score,
  };
}

export interface RecentCheckins {
  windowDays: number;
  daily: Record<string, unknown>[];
  weekly: Record<string, unknown>[];
}

// Raw check-in rows, not a computed score -- callers (Context Builder,
// Safety Gate) need the actual logged values (mood/energy/sleep/hydration/
// coach_questions text), not just an aggregate.
export async function getRecentCheckins(clientId: string, windowDays = DEFAULT_WINDOW_DAYS): Promise<RecentCheckins> {
  const cut = cutoffDate(windowDays);
  const [{ data: daily }, { data: weekly }] = await Promise.all([
    supabaseAdmin.from("daily_checkins").select("*").eq("client_id", clientId).gte("date", cut).order("date"),
    supabaseAdmin.from("weekly_checkins").select("*").eq("client_id", clientId).gte("date", cut).order("date"),
  ]);
  return { windowDays, daily: daily || [], weekly: weekly || [] };
}

// Reuses assessClientRisk (src/lib/scoring.js) unchanged -- the exact same
// function CoachHome's at-risk panel and the client's own summary already
// share, so Head Coach's notion of "is this client currently flagged"
// can never silently diverge from what the coach dashboard shows.
export async function getAtRiskStatus(clientId: string): Promise<ReturnType<typeof assessClientRisk>> {
  const cut = cutoffDate(44);
  const [client, { data: daily }, { data: weekly }, objective] = await Promise.all([
    getClientCore(clientId),
    supabaseAdmin.from("daily_checkins").select("date,weight,calories,protein_g,carbs_g,fats_g,workout").eq("client_id", clientId).gte("date", cut).order("date"),
    supabaseAdmin.from("weekly_checkins").select("date,bodyweight,sleep_quality,hydration_quality").eq("client_id", clientId).gte("date", cut).order("date"),
    getObjectiveAndCurrentState(clientId),
  ]);
  return assessClientRisk(client, daily || [], weekly || [], objective?.goal || null);
}

export interface RecentIntervention {
  id: string;
  taskId: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

// Prior Head Coach recommendations for this client -- reads the HC-002
// tables directly (coach-only RLS is irrelevant here since this runs through
// supabaseAdmin, same as every other api/_lib module). Used so a new
// REVIEW_CHECK_IN task can see what was already recommended/decided before,
// not just the client's raw data.
export async function getRecentInterventions(clientId: string, limit = 5): Promise<RecentIntervention[]> {
  const { data } = await supabaseAdmin
    .from("head_coach_recommendations")
    .select("id,task_id,status,created_at,decided_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []).map((r: any) => ({ id: r.id, taskId: r.task_id, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at }));
}
