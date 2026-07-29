import { generateTrainingPlan } from "./_lib/anthropic.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireCoach } from "./_lib/auth.js";
import { resolveClientForGeneration, resolveLockedExercises, replaceAiExercises } from "./_lib/programGeneration.js";
import { PHASES } from "../src/lib/constants.js";

// Builds the prior-phase-performance summary fed into generateTrainingPlan's
// phaseContext, from data that's already collected today — no extra AI call,
// so this endpoint stays on the same latency budget as generate-program.js.
async function buildPriorPhaseSummary({ profileId, trainingOwnerId, phaseUpdatedAt }) {
  const parts = [];

  const { data: checkins } = await supabaseAdmin
    .from("weekly_checkins")
    .select("workout_feel, lifts_improved, felt_weaker, cardio_performance, training_days")
    .eq("client_id", profileId)
    .order("date", { ascending: false })
    .limit(2);
  if (checkins?.length) {
    parts.push(
      "Recent weekly check-ins: " +
        checkins
          .map((c) => [c.workout_feel, c.lifts_improved && `lifts improved: ${c.lifts_improved}`, c.felt_weaker && `felt weaker: ${c.felt_weaker}`, c.cardio_performance].filter(Boolean).join("; "))
          .filter(Boolean)
          .join(" | ")
    );
  }

  if (phaseUpdatedAt) {
    const { data: logs } = await supabaseAdmin
      .from("workout_logs")
      .select("date")
      .eq("client_id", profileId)
      .gte("date", phaseUpdatedAt.slice(0, 10));
    const trainedDays = new Set((logs || []).map((l) => l.date)).size;
    parts.push(`Logged ${trainedDays} distinct training day(s) since this phase began.`);
  }

  const { data: recap } = await supabaseAdmin
    .from("client_summaries")
    .select("content, created_at")
    .eq("client_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Only use it if generated after the current phase started — an older recap
  // describes a different phase and would misinform this transition.
  if (recap?.content && (!phaseUpdatedAt || recap.created_at > phaseUpdatedAt)) {
    parts.push(`Most recent recap: ${recap.content}`);
  }

  return parts.length ? parts.join("\n") : null;
}

// Finds the client's AI-sourced exercises that should be swapped to a paired
// "upgrade" now that they're entering `phase` (see exercise_upgrades table).
// Matching is by exercise name, case-insensitive/trimmed — same convention
// the locked-exercise block already uses.
async function buildUpgradeInstructions(trainingOwnerId, phase) {
  const { data: current } = await supabaseAdmin.from("exercises").select("name").eq("client_id", trainingOwnerId).eq("source", "ai");
  const { data: upgrades } = await supabaseAdmin.from("exercise_upgrades").select("*").ilike("activates_at_phase", phase);
  if (!current?.length || !upgrades?.length) return { text: null, count: 0 };

  const norm = (s) => String(s || "").trim().toLowerCase();
  const currentNames = new Set(current.map((e) => norm(e.name)));
  const matches = upgrades.filter((u) => currentNames.has(norm(u.base_exercise)));
  if (!matches.length) return { text: null, count: 0 };

  const text = matches
    .map((u) => `- ${u.base_exercise} -> ${u.upgrade_exercise}${u.movement_pattern ? ` (movement pattern: ${u.movement_pattern})` : ""}${u.notes ? ` — ${u.notes}` : ""}`)
    .join("\n");
  return { text, count: matches.length };
}

// POST /api/advance-phase  { client_email, phase, phase_note?, week_start?, week_end? }
// Regenerates ONLY the training plan for the client's next phase — nutrition
// is untouched (use /api/generate-program with scope:"nutrition" separately
// if it needs updating too).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireCoach(req, res);
  if (!user) return;

  const { client_email, phase, phase_note, week_start, week_end } = req.body || {};
  if (!client_email) return res.status(400).json({ error: "client_email is required" });
  if (!phase || !PHASES.includes(phase)) return res.status(400).json({ error: `phase must be one of: ${PHASES.join(", ")}` });

  try {
    const resolved = await resolveClientForGeneration(client_email);
    if (resolved.error) return res.status(resolved.error.status).json({ error: resolved.error.message });
    const { profile, trainingOwnerId, assessed } = resolved;

    const { data: program, error: progErr } = await supabaseAdmin
      .from("programs")
      .select("id, phase_updated_at")
      .eq("client_id", trainingOwnerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (progErr) throw progErr;
    if (!program) return res.status(404).json({ error: "No program to advance — generate one first." });

    const [priorPhaseSummary, { aiIds, lockedExercises, lockedExercisesText }, { text: upgradeInstructionsText, count: upgradesApplied }] =
      await Promise.all([
        buildPriorPhaseSummary({ profileId: profile.id, trainingOwnerId, phaseUpdatedAt: program.phase_updated_at }),
        resolveLockedExercises(trainingOwnerId),
        buildUpgradeInstructions(trainingOwnerId, phase),
      ]);

    const training = await generateTrainingPlan(
      { ...assessed, locked_exercises_text: lockedExercisesText, upgrade_instructions_text: upgradeInstructionsText },
      { phase, weekStart: week_start, weekEnd: week_end, priorPhaseSummary }
    );

    const { exercises, preservedIds } = await replaceAiExercises({
      trainingOwnerId,
      programId: program.id,
      aiIds,
      lockedExercises,
      weeklySplit: training.weekly_split,
    });

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("programs")
      .update({
        phase,
        phase_note: phase_note?.trim() || null,
        phase_week_start: week_start ?? null,
        phase_week_end: week_end ?? null,
        phase_updated_at: nowIso,
      })
      .eq("id", program.id);

    await supabaseAdmin.from("program_phase_history").insert({
      program_id: program.id,
      client_id: trainingOwnerId,
      phase,
      phase_note: phase_note?.trim() || null,
      week_start: week_start ?? null,
      week_end: week_end ?? null,
      changed_by: user.email,
    });

    return res.status(200).json({
      success: true,
      phase,
      week_start: week_start ?? null,
      week_end: week_end ?? null,
      exercises_created: exercises.length,
      exercises_preserved: preservedIds.length,
      upgrades_applied: upgradesApplied,
    });
  } catch (err) {
    console.error("advance-phase error:", err, "client_email:", client_email);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
