import { supabase } from "../supabaseClient.js";
import { readJson } from "./apiJson.js";
import { mapGeneratedPhases } from "./roadmapMap.js";

// The two AI roadmap calls (both coach-only, both on /api/goal-insight). Purely
// advisory: they return editable rows; nothing is saved here.

async function post(body, fallback) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/goal-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(json.error || fallback);
  return json;
}

// Generate Roadmap: a proposed phase sequence from the client's real program/goal/milestone data.
export async function generateRoadmapRows(programId) {
  const json = await post({ program_id: programId }, "Could not generate a roadmap.");
  return { rows: mapGeneratedPhases(json.phases), confidence: json.confidence, dataUsed: json.data_used || [] };
}

// Generate plan details: rationale, planned exercise changes and checkpoints for the given named phases.
// Returns an array of detail objects in the same order as `phases`.
export async function generatePlanDetailsFor(programId, phases) {
  const json = await post({ plan_details_program_id: programId, phases }, "Could not generate plan details.");
  return json.details || [];
}
