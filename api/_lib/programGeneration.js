import { getClientFromNotion } from "./notion.js";
import { getClientFromLead } from "./leads.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { DAY_ORDER } from "../../src/lib/constants.js";

// Maps the AI's returned day label onto one of the 7 canonical DAY_ORDER
// values (case-insensitive exact match) so generation never introduces a
// stray day label that doesn't match the client's existing day folders.
export function normalizeDay(day) {
  const match = DAY_ORDER.find((d) => d.toLowerCase() === String(day || "").trim().toLowerCase());
  if (!match) console.warn(`programGeneration: unrecognized day "${day}", falling back to Unscheduled`);
  return match || null;
}

// Reads the client's intake (Notion, falling back to in-app leads), their app
// profile, and any coach assessment, and resolves them into the flat "assessed"
// object generateTrainingPlan/generateNutritionPlan expect. Shared by
// generate-program.js (initial generation) and advance-phase.js (phase
// transitions) so this resolution logic only lives in one place.
// Returns { error: { status, message } } on failure instead of throwing, so
// callers can map it straight onto the HTTP response the way generate-program.js
// always has.
export async function resolveClientForGeneration(client_email) {
  let client = await getClientFromNotion(client_email);
  if (!client) client = await getClientFromLead(client_email);
  if (!client) {
    return { error: { status: 404, message: `No intake found for ${client_email} (checked Notion and in-app leads)` } };
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, nervous_system_recruitment, muscular_density_to_size, metabolic_work_capacity, shared_program_owner_id, goal, is_local"
    )
    .eq("email", client_email)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile) {
    return { error: { status: 404, message: "Client has not signed up in the app yet" } };
  }

  // TRAINING is shared between linked partners: a client with a
  // shared_program_owner_id writes its program + exercises against the
  // owner's id, so both partners see the same training. NUTRITION and logged
  // history stay keyed to this client's OWN id (profile.id) — always separate.
  const trainingOwnerId = profile.shared_program_owner_id || profile.id;

  const { data: coachAssessment } = await supabaseAdmin
    .from("client_assessments")
    .select("*")
    .eq("email", client_email.toLowerCase())
    .maybeSingle();

  const assessment = {
    nervous_system_recruitment:
      profile.nervous_system_recruitment ?? coachAssessment?.nervous_system_recruitment ?? client.nervous_system_recruitment,
    muscular_density_to_size:
      profile.muscular_density_to_size ?? coachAssessment?.muscular_density_to_size ?? client.muscular_density_to_size,
    metabolic_work_capacity:
      profile.metabolic_work_capacity ?? coachAssessment?.metabolic_work_capacity ?? client.metabolic_work_capacity,
  };

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

// Finds which of the client's current AI-generated exercises already have
// logged history — these must be preserved (never deleted) across a
// regeneration, since deleting them would cascade-delete workout_logs.
// Preserve an exercise if ANY partner has logged sets against it (logs are
// per-client but the exercise rows are shared).
export async function resolveLockedExercises(trainingOwnerId) {
  const { data: aiExercises } = await supabaseAdmin
    .from("exercises")
    .select("id, name, day_of_week, sets, reps")
    .eq("client_id", trainingOwnerId)
    .eq("source", "ai");
  const aiIds = (aiExercises || []).map((e) => e.id);
  let lockedExercises = [];
  if (aiIds.length) {
    const { data: logged } = await supabaseAdmin.from("workout_logs").select("exercise_id").in("exercise_id", aiIds);
    const loggedIds = new Set((logged || []).map((l) => l.exercise_id));
    lockedExercises = (aiExercises || []).filter((e) => loggedIds.has(e.id));
  }
  const lockedExercisesText = lockedExercises.length
    ? lockedExercises.map((e) => `- ${e.name} (${e.day_of_week || "unscheduled"}${e.sets ? `, ${e.sets}x${e.reps || "?"}` : ""})`).join("\n")
    : null;
  return { aiIds, lockedExercises, lockedExercisesText };
}

// Replaces the client's AI-generated exercises with a freshly generated
// weekly_split, preserving any exercise with logged history (re-pointed at
// the new program row) instead of deleting it. Returns the inserted rows +
// which ids were preserved, for the endpoint's response payload.
export async function replaceAiExercises({ trainingOwnerId, programId, aiIds, lockedExercises, weeklySplit }) {
  const preservedIds = lockedExercises.map((e) => e.id);
  const deletableIds = aiIds.filter((id) => !preservedIds.includes(id));
  if (deletableIds.length) {
    const { error } = await supabaseAdmin.from("exercises").delete().in("id", deletableIds);
    if (error) throw error;
  }
  if (preservedIds.length) {
    await supabaseAdmin.from("exercises").update({ program_id: programId }).in("id", preservedIds);
  }

  const exercises = [];
  for (const day of weeklySplit || []) {
    (day.exercises || []).forEach((ex, i) => {
      exercises.push({
        client_id: trainingOwnerId,
        program_id: programId,
        name: ex.name,
        category: ex.category || day.focus || null,
        section: ex.section || null,
        exercise_type: ex.exercise_type || null,
        day_of_week: normalizeDay(day.day),
        sets: ex.sets ?? null,
        reps: ex.reps != null ? String(ex.reps) : null,
        is_bodyweight: !!ex.is_bodyweight,
        notes: ex.notes || null,
        order_index: i,
        block_type: ex.block_type || "straight_set",
        group_id: ex.group_id != null ? String(ex.group_id) : null,
        source: "ai",
      });
    });
  }
  if (exercises.length) {
    const { error } = await supabaseAdmin.from("exercises").insert(exercises);
    if (error) throw error;
  }
  return { exercises, preservedIds };
}
