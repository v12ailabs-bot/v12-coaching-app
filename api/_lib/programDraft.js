import { validateTrainingPlan, reviewProgramQuality, summarizeIssues } from "../../src/lib/programming/validateProgram.js";
import { estimateProgram, normalizeSessionConfig } from "../../src/lib/programming/sessionDuration.js";
import { replaceDay } from "../../src/lib/programming/draftDiff.js";

export class ProgramValidationError extends Error {
  constructor(issues) {
    super(`The AI returned a program that failed validation, so nothing was saved. ${summarizeIssues(issues)}`);
    this.name = "ProgramValidationError";
    this.issues = issues;
  }
}

// Validate raw AI output and turn it into the normalised plan + advisory
// warnings. Throws ProgramValidationError on anything malformed — callers must
// not write to the database before this returns.
export function prepareDraftPlan(rawPlan, { days_available, template_days, weeks, session_config } = {}) {
  const input = rawPlan && typeof rawPlan === "object" && !Array.isArray(rawPlan) && weeks ? { ...rawPlan, weeks } : rawPlan;
  const v = validateTrainingPlan(input);
  if (!v.ok) throw new ProgramValidationError(v.errors);
  const warnings = [...v.warnings, ...reviewProgramQuality(v.program, { days_available, template_days })];
  const cfg = normalizeSessionConfig(session_config);
  const estimates = estimateProgram(v.program, cfg);
  estimates.filter((e) => e.fits && e.budget >= 45 && e.coached < e.budget * 0.6).forEach((e) => warnings.push({ path: e.day, message: `${e.day} is only about ${e.coached} min of coached work against a ${e.budget}-minute session — use "Revise day" to add work, or lower the session length.` }));
  estimates.filter((e) => !e.fits).forEach((e) => warnings.push({ path: e.day, message: `${e.day} is estimated at ${e.coached} min of coached work, over the ${e.budget}-minute budget.` }));
  return { plan: v.program, warnings, estimates, session_config: cfg };
}

// Save a validated plan as the client's single open draft. Any earlier open draft
// is marked superseded first (a unique index allows only one open draft); if the
// insert then fails, the earlier draft is restored. The client's ACTIVE program
// and exercises are never touched here.
export async function saveProgramDraft(db, { clientId, profileId, createdBy, template, plan, warnings, sessionConfig }) {
  const { data: open, error: openErr } = await db.from("program_drafts").select("id").eq("client_id", clientId).eq("status", "draft");
  if (openErr) throw openErr;
  const priorIds = (open || []).map((d) => d.id);
  if (priorIds.length) {
    const { error } = await db.from("program_drafts").update({ status: "superseded", updated_at: new Date().toISOString() }).in("id", priorIds);
    if (error) throw error;
  }
  const { data, error } = await db.from("program_drafts").insert({
    client_id: clientId, profile_id: profileId, created_by: createdBy || null,
    template_id: template?.id || null, template_name: template?.name || null,
    session_config: sessionConfig, payload: plan, original_payload: plan,
    warnings, revisions: [],
  }).select("id").single();
  if (error) {
    if (priorIds.length) await db.from("program_drafts").update({ status: "draft" }).in("id", priorIds);
    throw error;
  }
  return data.id;
}

// Apply a validated single-day revision to an open draft. Only that day changes;
// the write is guarded on updated_at so a concurrent edit is never clobbered.
export function applyDayRevision(draft, dayName, rawDay, instruction) {
  const check = validateTrainingPlan({ program_name: draft.payload.program_name, weeks: draft.payload.weeks, weekly_split: [{ day: dayName, focus: rawDay?.focus, exercises: rawDay?.exercises }] });
  if (!check.ok) throw new ProgramValidationError(check.errors);
  const newDay = check.program.weekly_split[0];
  const payload = replaceDay(draft.payload, dayName, newDay);
  const revisions = [...(draft.revisions || []), { at: new Date().toISOString(), kind: "ai_day_revision", day: dayName, instruction, summary: typeof rawDay?.summary === "string" ? rawDay.summary.slice(0, 300) : null }];
  return { payload, revisions, warnings: check.warnings };
}
