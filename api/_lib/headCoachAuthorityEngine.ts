import type { RuleOutcome } from "./headCoachRuleEngine.ts";

// HC-013 Authority Engine. Per the spec: "The backend is authoritative.
// Claude's declared authority is advisory only." HC-012 already checks the
// AI didn't CLAIM more than fired rules permit -- this module is the
// distinct, backend-owned computation of what the authority actually IS,
// independent of what the AI said. The AI's declared value is taken into
// account (a more cautious AI self-assessment is honored), but never
// trusted to grant MORE authority than the backend's own ceiling allows.
//
// L0 Observe / L1 Recommend / L2 Low-risk Execute / L3 Coach Approval /
// L4 Human/Professional. Authority is action-specific per the spec -- the
// per-task-type ceiling below is where that specificity lives.

export type AuthorityLevel = "L0" | "L1" | "L2" | "L3" | "L4";

const LEVELS: AuthorityLevel[] = ["L0", "L1", "L2", "L3", "L4"];
const RANK: Record<AuthorityLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const rankToLevel = (rank: number): AuthorityLevel => LEVELS[rank];

// Maximum authority ANY recommendation for a task type can ever be granted,
// independent of rules or the AI. Every task type is capped at L1 for
// MVP -- no action executor exists (HC-016 is explicitly deferred) and "do
// NOT begin with autonomous actions" has been a standing constraint since
// the start of this whole effort. This is the one place that ceiling
// should ever be relaxed, and only once a real executor exists to justify
// L2+.
const TASK_TYPE_CEILING: Record<string, AuthorityLevel> = {
  REVIEW_CHECK_IN: "L1",
};

export interface AuthorityDetermination {
  backendAuthority: AuthorityLevel;
  taskTypeCeiling: AuthorityLevel;
  ruleCeiling: AuthorityLevel;
  aiDeclaredAuthority: AuthorityLevel | null;
  overridden: boolean; // true whenever the final value differs from what the AI declared
  reason: string;
}

function isAuthorityLevel(v: unknown): v is AuthorityLevel {
  return typeof v === "string" && v in RANK;
}

export function determineAuthority(
  taskType: string,
  ruleOutcomes: RuleOutcome[],
  aiDeclaredAuthority: string | null,
): AuthorityDetermination {
  const taskTypeCeiling = TASK_TYPE_CEILING[taskType] ?? "L0"; // unknown task type -> most conservative default
  const fired = ruleOutcomes.filter((r) => r.status === "fired");
  // Minimum across fired rules -- the most restrictive one binds, same
  // correction just applied to HC-012's equivalent computation.
  const ruleCeiling = fired.length ? rankToLevel(Math.min(...fired.map((r) => RANK[r.authority] ?? 0))) : taskTypeCeiling;

  const backendCeilingRank = Math.min(RANK[taskTypeCeiling], RANK[ruleCeiling]);
  const aiRank = isAuthorityLevel(aiDeclaredAuthority) ? RANK[aiDeclaredAuthority] : null;
  const finalRank = aiRank !== null ? Math.min(backendCeilingRank, aiRank) : backendCeilingRank;
  const backendAuthority = rankToLevel(finalRank);

  return {
    backendAuthority,
    taskTypeCeiling,
    ruleCeiling,
    aiDeclaredAuthority: aiRank !== null ? (aiDeclaredAuthority as AuthorityLevel) : null,
    overridden: aiDeclaredAuthority !== backendAuthority,
    reason: `min(task-type ceiling ${taskTypeCeiling}, rule ceiling ${ruleCeiling}, AI-declared ${aiDeclaredAuthority ?? "none"}) = ${backendAuthority}`,
  };
}
