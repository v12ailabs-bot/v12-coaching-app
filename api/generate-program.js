import { performance } from "node:perf_hooks";
import { getClientFromNotion } from "./_lib/notion.js";
import { getClientFromLead } from "./_lib/leads.js";
import { getProgramTemplate } from "./_lib/notionTemplates.js";
import { generateTrainingPlan, generateNutritionPlan, reviseTrainingDay } from "./_lib/anthropic.js";
import { loadPreviousProgramBriefing } from "./_lib/previousProgram.js";
import { prepareDraftPlan, saveProgramDraft, applyDayRevision, ProgramValidationError } from "./_lib/programDraft.js";
import { normalizeSessionConfig } from "../src/lib/programming/sessionDuration.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireCoach } from "./_lib/auth.js";
import { toScore } from "./_lib/scores.js";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Loads everything the generators need about a client: Notion/lead intake, the
// app profile, the coach's own assessment, and the resolved three-system scores.
async function loadClientContext(client_email) {
  // 1. Read client data from Notion, falling back to the in-app leads
  //    table for clients who applied through the new intake form instead.
  let client = await getClientFromNotion(client_email);
  if (!client) client = await getClientFromLead(client_email);
  if (!client) {
    throw new HttpError(404, `No intake found for ${client_email} (checked Notion and in-app leads)`);
  }

  // 2. Make sure the client has an app profile to attach the program to.
  //    Pull any stored assessment scores so coach overrides take priority.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, nervous_system_recruitment, muscular_density_to_size, metabolic_work_capacity, shared_program_owner_id, goal, is_local"
    )
    .eq("email", client_email)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile) {
    throw new HttpError(404, "Client has not signed up in the app yet");
  }

  // TRAINING is shared between linked partners: a client with a
  // shared_program_owner_id writes its program + exercises against the
  // owner's id, so both partners see the same training. NUTRITION and logged
  // history stay keyed to this client's OWN id (profile.id) — always separate.
  const trainingOwnerId = profile.shared_program_owner_id || profile.id;

  // Coach's in-app onboarding assessment (keyed by email), if one exists. This
  // is the coach's own evaluation and takes priority over inference.
  const { data: coachAssessment } = await supabaseAdmin
    .from("client_assessments")
    .select("*")
    .eq("email", client_email.toLowerCase())
    .maybeSingle();

  // Resolve the V12 assessment: a coach-set profile score wins, then the
  // in-app coach assessment, then Notion.
  const assessment = {
    nervous_system_recruitment:
      profile.nervous_system_recruitment ?? coachAssessment?.nervous_system_recruitment ?? client.nervous_system_recruitment,
    muscular_density_to_size:
      profile.muscular_density_to_size ?? coachAssessment?.muscular_density_to_size ?? client.muscular_density_to_size,
    metabolic_work_capacity:
      profile.metabolic_work_capacity ?? coachAssessment?.metabolic_work_capacity ?? client.metabolic_work_capacity,
  };

  // Free-text coach assessment, condensed into a prompt block the generator
  // treats as authoritative (see clientProfileBlock/generateTrainingPlan).
  const coachAssessmentText = coachAssessment
    ? [
        ["Strengths", coachAssessment.strengths],
        ["Weaknesses/limitations", coachAssessment.weaknesses],
        ["Injuries/health", coachAssessment.injuries],
        ["Training history", coachAssessment.training_history],
        ["Recovery/lifestyle", coachAssessment.recovery_lifestyle],
        ["Goal/focus", coachAssessment.goal_focus],
        ["Coach notes", coachAssessment.notes],
      ]
        .filter(([, v]) => (v || "").trim())
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : null;

  const assessed = { ...client, ...assessment, coach_assessment: coachAssessmentText || null, is_local: !!profile.is_local };
  return { client, profile, trainingOwnerId, assessment, assessed };
}

// POST /api/generate-program  { client_email, template_id?, scope?, session_config? }
// 1. Reads the client's intake from Notion
// 2. Loads the coach-selected program template (optional)
// 3. Generates a training plan + nutrition plan with Claude (in parallel)
// 4. VALIDATES the training plan, then saves it as a coach-review DRAFT
//    (program_drafts). The client's active program/exercises are NOT touched —
//    only a coach approving the draft (approve_program_draft RPC) swaps it in.
//    The nutrition plan is saved as before.
//
// POST /api/generate-program  { action: "revise_day", draft_id, day, instruction }
//    Targeted AI revision of ONE day of an open draft; other days are untouched.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // TEMP: step-by-step timing to find where the 60s Vercel budget is going on
  // 504s. Logs incrementally (not just at the end) so the data survives even
  // if the function is killed mid-request. Remove once the bottleneck is found.
  const t0 = performance.now();
  let lastMark = t0;
  const mark = (label) => {
    const t = performance.now();
    console.log(`[generate-program timing] ${label}: ${(t - lastMark).toFixed(0)}ms (total: ${(t - t0).toFixed(0)}ms)`);
    lastMark = t;
  };

  const user = await requireCoach(req, res);
  if (!user) return;
  mark("Authentication");

  const { client_email, template_id, scope, action, draft_id, day, instruction, session_config } = req.body || {};
  if (action === "revise_day") return reviseDay(req, res, user, { draft_id, day, instruction });
  if (!client_email) return res.status(400).json({ error: "client_email is required" });
  // scope "nutrition" regenerates ONLY the nutrition plan, leaving the training
  // program and exercises (and their logged history) untouched. Default: "full".
  const nutritionOnly = scope === "nutrition";

  try {
    const { client, profile, trainingOwnerId, assessment, assessed } = await loadClientContext(client_email);
    mark("Fetch client data + profile + assessment");

    // 3. Load the coach-selected template from the Notion program library and
    //    read its session structure as the AI framework. Falls back to the
    //    client's own Notion `Program Template` property if none was chosen.
    let template = null;
    const templateWarnings = [];
    if (!nutritionOnly) {
      const chosenTemplate = template_id || client.program_template_id;
      if (chosenTemplate) {
        try {
          template = await getProgramTemplate(chosenTemplate);
        } catch (e) {
          console.warn("Program library fetch failed:", e.message);
          // A template the coach explicitly picked must not be silently dropped.
          if (template_id) throw new HttpError(502, `Couldn't load the selected template from Notion (${e.message}). Nothing was generated — try again.`);
        }
        if (!template && template_id) throw new HttpError(404, "The selected template no longer exists in the Notion library. Nothing was generated.");
        if (template && !template.frameworkText) templateWarnings.push({ path: "template", message: `Template "${template.name}" has no body content, so it was used only for its name — the AI designed the structure itself.` });
      }
    }
    const templateText = template?.frameworkText || null;
    const sessionConfig = normalizeSessionConfig(session_config);
    mark("Fetch program template");

    // 4. Full-scope only: the client's current phase decides which progression
    //    models are candidates for this generation (progression_models table,
    //    coach-editable via the Progression Models panel). Logged exercises are
    //    NOT designed around any more — the AI plans freely, and when the coach
    //    approves the draft they choose which logged exercises to keep or retire.
    let progressionCandidates = [];
    if (!nutritionOnly) {
      const { data: previousProgram } = await supabaseAdmin.from("programs").select("top_phase")
        .eq("client_id", trainingOwnerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: models } = await supabaseAdmin.from("progression_models").select("key, label, methodology")
        .eq("top_phase", previousProgram?.top_phase || "foundation").eq("is_active", true);
      progressionCandidates = models || [];
    }
    mark("Phase/progression-model lookup");

    // What the client did on their last program, so the new block is a real
    // continuation (loads, progressed/stalled lifts, consistency, feedback).
    const briefing = nutritionOnly ? null : await loadPreviousProgramBriefing(supabaseAdmin, { trainingOwnerId, profileId: profile.id });
    mark("Previous-program briefing");

    // 5. Generate the plan(s). Nutrition-only skips the training generation;
    //    full mode runs both concurrently.
    const [training, nutrition] = nutritionOnly
      ? [null, await generateNutritionPlan(assessed)]
      : await Promise.all([
          generateTrainingPlan({ ...assessed, program_template: templateText, template_weeks: template?.weeks || null, session_config: sessionConfig, previous_program_text: briefing?.text || null, progression_candidates: progressionCandidates }),
          generateNutritionPlan(assessed),
        ]);
    mark("Generate training + nutrition plans (Anthropic, combined)");
    mark("Before database writes");

    // 6. Validate the AI's training plan BEFORE anything is written. A malformed
    //    plan throws ProgramValidationError (handled below as a 422) and the
    //    client's existing program, exercises and nutrition plan are left as-is.
    let program = null;
    let draftId = null;
    let prepared = null;
    if (nutritionOnly) {
      const { data: latest } = await supabaseAdmin
        .from("programs")
        .select("id")
        .eq("client_id", trainingOwnerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      program = latest || null;
      mark("Nutrition-only: latest program lookup");
    } else {
      prepared = prepareDraftPlan(training, {
        days_available: Number(client.days_available) || null,
        template_days: template?.days || null,
        weeks: template?.weeks || null,
        session_config: sessionConfig,
      });
      mark("Validate AI training plan");

      // 7. Save it as a coach-review DRAFT. The active program and its
      //    exercises (including any with logged history) are untouched until a
      //    coach approves the draft.
      if (briefing?.hasHistory) {
        templateWarnings.push({ path: "transition", message: `Built as a continuation of their last program: ${briefing.stats.exercisesWithHistory} lifts with logged history${briefing.stats.feedback ? `, ${briefing.stats.feedback} recent check-in notes` : ""} were passed to the AI.` });
      } else {
        templateWarnings.push({ path: "transition", message: "No logged history from a previous program was found, so this was planned from the intake and assessment only." });
      }
      prepared.warnings.unshift(...templateWarnings);
      draftId = await saveProgramDraft(supabaseAdmin, {
        clientId: trainingOwnerId, profileId: profile.id, createdBy: user.id,
        template, plan: prepared.plan, warnings: prepared.warnings, sessionConfig: prepared.session_config,
      });
      const { data: latest } = await supabaseAdmin.from("programs").select("id").eq("client_id", trainingOwnerId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      program = latest || null;
      mark("Save program draft");
    }

    // 8. Replace the active nutrition plan. The new plan is inserted (active)
    //    BEFORE the old ones are deactivated, so a failure part-way can never
    //    leave the client with no active plan.
    const { data: newPlan, error: nutErr } = await supabaseAdmin.from("nutrition_plans").insert({
      client_id: profile.id,
      program_id: program?.id ?? null,
      name: nutrition.plan_name || "Nutrition Plan",
      calories: nutrition.daily_calories ?? client.calorie_target ?? null,
      protein_g: nutrition.protein_g ?? null,
      carbs_g: nutrition.carbs_g ?? null,
      fats_g: nutrition.fats_g ?? null,
      hydration: nutrition.hydration || null,
      guidelines: nutrition.guidelines || null,
      meals: nutrition.meals || [],
      supplements: nutrition.supplements || [],
      supplements_disclaimer: Array.isArray(nutrition.supplements) && nutrition.supplements.length
        ? "General information, not individualized medical or dietetic advice. Check with a doctor before starting any supplement, especially if pregnant, on medication, or managing a health condition."
        : null,
      active: true,
    }).select("id").single();
    if (nutErr) throw nutErr;
    const { error: deactErr } = await supabaseAdmin
      .from("nutrition_plans")
      .update({ active: false })
      .eq("client_id", profile.id)
      .eq("active", true)
      .neq("id", newPlan.id);
    if (deactErr) throw deactErr;
    mark("Save nutrition plan");

    // 9. Sync the goal and persist the resolved
    //    assessment (coerced to 1-10 ints; non-numeric Notion values -> null).
    if (!nutritionOnly) {
      await supabaseAdmin
        .from("profiles")
        .update({
          // Preserve a coach-set (or previously stored) goal; only fall back to
          // the Notion intake goal when the profile has none yet.
          goal: profile.goal || client.goal || null,
          nervous_system_recruitment: toScore(assessment.nervous_system_recruitment),
          muscular_density_to_size: toScore(assessment.muscular_density_to_size),
          metabolic_work_capacity: toScore(assessment.metabolic_work_capacity),
        })
        .eq("id", profile.id);
    }
    mark("Update profile/onboarding");
    mark("After database writes");
    mark("Before response");
    console.log(`[generate-program timing] TOTAL: ${(performance.now() - t0).toFixed(0)}ms for ${client_email}`);

    return res.status(200).json({
      success: true,
      scope: nutritionOnly ? "nutrition" : "full",
      draft_id: draftId,
      program: prepared?.plan.program_name ?? null,
      template: template?.name ?? null,
      exercises_created: prepared ? prepared.plan.weekly_split.reduce((n, d) => n + d.exercises.length, 0) : 0,
      warnings: prepared?.warnings ?? [],
      progression_model_used: prepared?.plan.progression_model_used ?? null,
      meals_created: (nutrition.meals || []).length,
      calories: nutrition.daily_calories ?? null,
    });
  } catch (err) {
    console.error(
      `[generate-program timing] FAILED after ${(performance.now() - t0).toFixed(0)}ms —`,
      "generate-program error:", err, "client_email:", client_email
    );
    if (err instanceof ProgramValidationError) return res.status(422).json({ error: err.message, issues: err.issues, existing_program_unchanged: true });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

// Targeted revision of one day of an open draft.
async function reviseDay(req, res, user, { draft_id, day, instruction }) {
  if (!draft_id || !day || !String(instruction || "").trim()) return res.status(400).json({ error: "draft_id, day and instruction are required" });
  if (String(instruction).length > 1500) return res.status(400).json({ error: "instruction is too long (max 1500 characters)" });
  try {
    const { data: draft, error } = await supabaseAdmin.from("program_drafts").select("*").eq("id", draft_id).maybeSingle();
    if (error) throw error;
    if (!draft) throw new HttpError(404, "Draft not found");
    if (draft.status !== "draft") throw new HttpError(409, `This draft is already ${draft.status} — start a new one.`);
    const current = (draft.payload?.weekly_split || []).find((d) => d.day === day);
    if (!current) throw new HttpError(400, `${day} is not a training day in this draft`);
    if (!draft.profile_id) throw new HttpError(409, "Draft has no client profile attached");
    const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("id", draft.profile_id).maybeSingle();
    if (!prof?.email) throw new HttpError(404, "Client profile not found");

    const { assessed } = await loadClientContext(prof.email);
    const revised = await reviseTrainingDay({ ...assessed, session_config: draft.session_config }, {
      dayName: day, focus: current.focus, currentExercises: current.exercises,
      otherDays: draft.payload.weekly_split.filter((d) => d.day !== day), instruction: String(instruction).trim(),
    });
    const next = applyDayRevision(draft, day, revised, String(instruction).trim());

    // Guard on updated_at: if the coach saved an edit while the AI was working,
    // refuse rather than overwrite it.
    const { data: saved, error: upErr } = await supabaseAdmin.from("program_drafts")
      .update({ payload: next.payload, revisions: next.revisions, updated_at: new Date().toISOString() })
      .eq("id", draft.id).eq("status", "draft").eq("updated_at", draft.updated_at).select("id");
    if (upErr) throw upErr;
    if (!saved?.length) throw new HttpError(409, "The draft changed while the AI was revising it. Your edits were kept — run the revision again.");
    return res.status(200).json({ success: true, day, summary: next.revisions[next.revisions.length - 1].summary, warnings: next.warnings });
  } catch (err) {
    console.error("revise_day error:", err);
    if (err instanceof ProgramValidationError) return res.status(422).json({ error: err.message, issues: err.issues, draft_unchanged: true });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
