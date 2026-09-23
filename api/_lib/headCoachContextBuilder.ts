import { supabaseAdmin } from "./supabaseAdmin.js";
// .ts extension is deliberate, not a typo: Node's actual runtime module
// resolution (unlike tsc's NodeNext type-checking) does not fall back from a
// .js specifier to a sibling .ts file -- confirmed by testing both ways.
import {
  getClientCore, getObjectiveAndCurrentState, getActiveMilestones, getActiveProgram,
  getActivePhase, getRecentPerformance, getNutritionContext, getRecentCheckins,
  getAtRiskStatus, getRecentInterventions,
} from "./headCoachCoreState.ts";

// HC-006 Context Builder -- assembles the HC-004 core-state reads into one
// structured object for a task, and persists it as an immutable snapshot
// (head_coach_context_snapshots, HC-002 -- the DB already enforces
// insert-only on that table). This is the ONLY place a REVIEW_CHECK_IN
// context gets assembled; nothing else should hand-roll a second version.
//
// Two spec fields are intentionally placeholders, not fabricated content:
// `applicableRules` (HC-007, not built) and `authority` (HC-013, not built).
// A caller reading `applicableRules: []` should read that as "rules don't
// exist yet," never as "no rules apply."
//
// Two other spec fields ("constraints", "relevant history") have no
// dedicated schema in this app -- there is no structured constraints table,
// no separate history log distinct from what already exists. Mapped here
// to the closest real data: program description/goal/experience_level (free
// text coaches already write physical-limitation notes into, confirmed
// during HC-004 testing -- e.g. "with knee-safe programming") plus recent
// coach_notes. Left as narrative text for the eventual AI reasoning step
// (HC-011) to read, not force-fit into a structure that doesn't exist yet.

export interface HeadCoachContext {
  builtAt: string;
  methodologyVersion: string | null;
  client: Awaited<ReturnType<typeof getClientCore>>;
  objective: Awaited<ReturnType<typeof getObjectiveAndCurrentState>>;
  milestones: Awaited<ReturnType<typeof getActiveMilestones>>;
  activeProgram: Awaited<ReturnType<typeof getActiveProgram>>;
  activePhase: Awaited<ReturnType<typeof getActivePhase>>;
  recentPerformance: Awaited<ReturnType<typeof getRecentPerformance>>;
  nutrition: Awaited<ReturnType<typeof getNutritionContext>>;
  recentCheckins: Awaited<ReturnType<typeof getRecentCheckins>>;
  constraints: {
    programDescription: string | null;
    programGoal: string | null;
    experienceLevel: string | null;
    recentCoachNotes: { body: string; pinned: boolean; createdAt: string }[];
  };
  openAlerts: unknown[];
  atRiskLevel: string | null;
  recentInterventions: Awaited<ReturnType<typeof getRecentInterventions>>;
  applicableRules: unknown[];
  authority: null;
}

async function getConstraints(clientId: string, program: Awaited<ReturnType<typeof getActiveProgram>>) {
  const { data: notes } = await supabaseAdmin
    .from("coach_notes")
    .select("body,pinned,created_at")
    .eq("client_id", clientId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);
  return {
    programDescription: program?.name ? `${program.name}` : null,
    programGoal: program?.goal ?? null,
    experienceLevel: program?.experienceLevel ?? null,
    recentCoachNotes: (notes || []).map((n: any) => ({ body: n.body, pinned: n.pinned, createdAt: n.created_at })),
  };
}

export async function buildReviewCheckInContext(clientId: string): Promise<HeadCoachContext> {
  const [client, objective, milestones, activeProgram, recentPerformance, nutrition, recentCheckins, risk, recentInterventions] = await Promise.all([
    getClientCore(clientId),
    getObjectiveAndCurrentState(clientId),
    getActiveMilestones(clientId),
    getActiveProgram(clientId),
    getRecentPerformance(clientId),
    getNutritionContext(clientId),
    getRecentCheckins(clientId),
    getAtRiskStatus(clientId),
    getRecentInterventions(clientId),
  ]);

  // Depends on activeProgram's result (needs its id/phase name), so it can't
  // join the Promise.all above.
  const activePhase = activeProgram ? await getActivePhase(activeProgram.id, activeProgram.phase) : null;
  const constraints = await getConstraints(clientId, activeProgram);

  return {
    builtAt: new Date().toISOString(),
    methodologyVersion: null, // no versioned methodology doc exists yet
    client,
    objective,
    milestones,
    activeProgram,
    activePhase,
    recentPerformance,
    nutrition,
    recentCheckins,
    constraints,
    openAlerts: risk.flags,
    atRiskLevel: risk.riskLevel,
    recentInterventions,
    applicableRules: [], // HC-007 not built yet
    authority: null, // HC-013 not built yet
  };
}

export async function persistContextSnapshot(taskId: string, context: HeadCoachContext): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("head_coach_context_snapshots")
    .insert({
      task_id: taskId,
      snapshot: context as unknown as Record<string, unknown>,
      rule_versions: [],
      methodology_version: context.methodologyVersion,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("persistContextSnapshot: insert returned no row.");
  return { id: data.id };
}
