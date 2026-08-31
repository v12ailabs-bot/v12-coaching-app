import { supabase } from "../supabaseClient.js";

// Two-level nested phase model, replacing the old flat program.phase picker
// (Onboarding/Accumulation/Intensification/Peak/Deload/Maintenance — see
// PHASES in constants.js, left in place but no longer used by the picker).
// Top-level cycle: Foundation -> Accumulation -> Performance. Each top-level
// block contains its own internal foundation -> accumulation ->
// intensification -> performance -> deload sub-cycle. Performance is
// intended to be the shortest block at both levels — a coach judgment call,
// not something enforced here.
export const TOP_PHASES = ["foundation", "accumulation", "performance"];
export const SUB_PHASES = ["foundation", "accumulation", "intensification", "performance", "deload"];
export const TOP_PHASE_LABELS = { foundation: "Foundation", accumulation: "Accumulation", performance: "Performance" };
export const SUB_PHASE_LABELS = { foundation: "Foundation", accumulation: "Accumulation", intensification: "Intensification", performance: "Performance", deload: "Deload" };

// Every existing reader of programs.phase (PhaseAlertsPanel, CoachHome,
// AIRecommendationCard's roadmap matching, ClientHero, ProgramRoadmapCard,
// ProgramRoadmap, api/summary.js, generatePhaseRecommendation) expects a
// plain display string there. Rather than rewrite each of them, the new
// picker keeps writing this synthesized string into that same column.
export function synthesizePhaseLabel(topPhase, subPhase) {
  return `${TOP_PHASE_LABELS[topPhase] || topPhase} — ${SUB_PHASE_LABELS[subPhase] || subPhase}`;
}

export async function fetchProgressionModels() {
  const { data } = await supabase.from("progression_models").select("*").order("top_phase").order("created_at");
  return data || [];
}

export async function fetchActiveModelsForPhase(topPhase) {
  const { data } = await supabase.from("progression_models").select("*").eq("top_phase", topPhase).eq("is_active", true).order("created_at");
  return data || [];
}

export async function createProgressionModel(row) {
  return supabase.from("progression_models").insert(row).select().single();
}

export async function updateProgressionModel(id, patch) {
  return supabase.from("progression_models").update(patch).eq("id", id);
}
