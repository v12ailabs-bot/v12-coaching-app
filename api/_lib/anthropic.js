import { performance } from "node:perf_hooks";
import Anthropic from "@anthropic-ai/sdk";

// TEMP: wraps the SDK's own fetch so every actual HTTP call to /v1/messages
// is logged, including retries the SDK issues internally (default
// maxRetries: 2, on 429/500/529/connection errors) that a single
// `await anthropic.messages.create()` hides from application code. Without
// this, "one call took 57s" is ambiguous between "one slow request" and
// "3 requests + backoff delay" — this makes it unambiguous.
let __httpSeq = 0;
async function loggingFetch(url, init) {
  const seq = ++__httpSeq;
  const bodyStr = typeof init?.body === "string" ? init.body : "";
  const kind = bodyStr.includes("design ONLY this week's high-level structure")
    ? "training-skeleton"
    : bodyStr.includes("filling in exercises for part of an already-structured")
      ? "training-detail"
      : bodyStr.includes("sports-nutrition AI")
        ? "nutrition"
        : bodyStr.includes("supportive but honest performance coach")
          ? "checkin/insight"
          : "other";
  const start = performance.now();
  console.log(`[anthropic http] #${seq} (${kind}) -> POST ${url}`);
  try {
    const res = await globalThis.fetch(url, init);
    console.log(`[anthropic http] #${seq} (${kind}) <- ${res.status} after ${(performance.now() - start).toFixed(0)}ms`);
    return res;
  } catch (err) {
    console.log(`[anthropic http] #${seq} (${kind}) <- FAILED after ${(performance.now() - start).toFixed(0)}ms: ${err.message}`);
    throw err;
  }
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: loggingFetch });

const MODEL = "claude-opus-4-8";
// A full 12-week, multi-day split (or a detailed meal plan) can exceed a few
// thousand tokens; 4000 truncated the JSON mid-string for larger clients.
const MAX_TOKENS = 16000;

// Program generation runs inside Vercel's 60s function timeout (unraisable
// on the Hobby plan). Abort the Anthropic call at 45s — well before Vercel
// kills the whole function — so the caller gets a clear timeout error
// instead of an opaque 504 with no response body. Passing our own signal
// (rather than the SDK's per-attempt `timeout` option) means this is a true
// wall-clock cutoff across any retries the SDK attempts internally, not a
// per-attempt timer that resets on each retry.
const ANTHROPIC_CALL_TIMEOUT_MS = 45000;

// Runs an Anthropic call with a hard wall-clock abort at ANTHROPIC_CALL_TIMEOUT_MS.
// On abort, throws a descriptive error instead of leaving the caller to hang
// until Vercel's own timeout kills the function.
async function withTimeout(label, fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_CALL_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${ANTHROPIC_CALL_TIMEOUT_MS / 1000}s (Anthropic API did not respond in time)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Parses model output as JSON, tolerating markdown code fences and any prose
// the model adds before/after the JSON object despite being told not to
// (e.g. "I need to design a program that..." preceding the actual object).
// On a genuine JSON syntax error (as opposed to a prose preamble), logs the
// actual malformed text around the reported position and includes it in the
// thrown error's message, so the failure is diagnosable from the error
// response alone instead of needing a follow-up round trip through logs.
function parseJson(text, label = "response") {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonSlice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(jsonSlice);
  } catch (err) {
    const posMatch = /position (\d+)/.exec(err.message);
    const pos = posMatch ? Number(posMatch[1]) : null;
    const snippet = pos != null ? jsonSlice.slice(Math.max(0, pos - 200), pos + 200) : jsonSlice.slice(0, 400);
    console.error(`[anthropic parse] ${label} FAILED to parse JSON: ${err.message}\n--- full response (${jsonSlice.length} chars) ---\n${jsonSlice}\n--- end ---`);
    throw new Error(`${label}: ${err.message} — near: ...${snippet}...`);
  }
}

export function clientProfileBlock(client) {
  return `CLIENT PROFILE (from their Notion application):
- Name: ${client.name || "Unknown"}
- Primary Goal: ${client.goal || "General fitness"}
- Age: ${client.age || "Not specified"}
- Current Bodyweight: ${client.current_weight || "Not specified"}
- Target Change: ${client.target_change != null ? `${client.target_change} lbs` : "Not specified"}
- Training Days Per Week: ${client.days_available ?? "Not specified"}
- Experience Level: ${client.experience_level || "Beginner"}
- Training Tenure (consistent): ${client.training_tenure || "Not specified"}
- Daily Activity Level (outside training): ${client.activity_level || "Not specified"}
- Average Sleep Per Night: ${client.sleep_hours || "Not specified"}
- Injuries / Limitations: ${client.injuries || "None"}
- Available Equipment: ${client.equipment || "Not specified"}
- Home-Gym Equipment (if training at home): ${client.home_equipment || "Not specified"}
- Session Length: ${client.session_length || "Not specified"}
- Nutrition Consistency: ${client.nutrition_consistency || "Not specified"}
- Dietary Preference: ${client.dietary_preference || "No restrictions"}
- Allergies: ${client.allergies || "None"}
- Calorie Target: ${client.calorie_target ?? "Coach to determine"}

V12 THREE-SYSTEM ASSESSMENT (1-10 where provided; otherwise infer from goal + experience):
- Nervous System Recruitment: ${client.nervous_system_recruitment ?? "infer"}
- Muscular Density-to-Size Ratio: ${client.muscular_density_to_size ?? "infer"}
- Metabolic Work Capacity: ${client.metabolic_work_capacity ?? "infer"}

ADHERENCE & COACHING CONTEXT (use to set plan complexity, sustainability, and tone):
- Coaching Style Preference: ${client.coaching_style || "Not specified"}
- Self-Rated Commitment (1-10): ${client.commitment_level ?? "Not specified"}
- Confidence to Follow a 12-Week Program (1-10): ${client.confidence || "Not specified"}
- Past Barriers to Progress: ${client.past_barriers || "Not specified"}
- Why Now / Motivation: ${client.why_now || "Not specified"}`;
}

// The V12 method: a hybrid of powerlifting, bodybuilding, and athletic/CrossFit
// conditioning. Every week must develop all three pillars. This shared block is
// the methodology the training generator must always follow.
const V12_METHOD = `THE V12 METHOD — every training week MUST develop all three pillars:

1. POWERLIFTING — heavy compound strength (squat / bench / deadlift / overhead
   press variants; low reps 1-5; high intensity 80-95% 1RM or RPE 8-9).
   Trains NERVOUS-SYSTEM RECRUITMENT and MYOFIBRILLAR DENSITY.

2. BODYBUILDING — moderate-to-high volume hypertrophy (8-15 reps, controlled
   tempo, isolation + accessory work, shorter rest, targeted muscle focus).
   Trains SARCOPLASMIC FULLNESS and muscular size.

3. ATHLETIC / CROSSFIT CONDITIONING — explosive power (jumps, throws, sprints,
   Olympic-lift variants) and metabolic conditioning (intervals, circuits, EMOM,
   work/rest pieces). Trains MITOCHONDRIAL DENSITY and EXPLOSIVE POWER.

BIAS the weekly emphasis using the client's three-system assessment:
- Higher Nervous System Recruitment -> they tolerate and benefit from MORE heavy
  powerlifting intensity/volume; lower -> build it gradually with submaximal work.
- Lower Muscular Density-to-Size -> add bodybuilding hypertrophy volume to build
  size; higher -> bias denser, heavier strength work to keep building density.
- Lower Metabolic Work Capacity -> add more conditioning to develop it; higher ->
  sharpen with explosive/power-focused pieces.

The three pillars may be combined within a session or split across days, but the
WEEK AS A WHOLE must train all three. Honor available days, equipment (including any
home-gym equipment listed when they train at home — only program movements the
listed equipment supports), and session length. Scale weekly volume and recovery to
the client's sleep and daily activity level: low sleep (under ~6h) or a physically
demanding job warrants more conservative volume and greater recovery emphasis.

INJURY / LIMITATION SAFETY (non-negotiable, overrides everything above): if the
client profile lists any injury or limitation, do NOT program exercises that load,
stress, or aggravate the affected area or movement pattern. Substitute pain-free
alternatives that train the SAME V12 pillar and target the same muscles/energy
system (e.g. for a knee injury, replace deep squats/lunges with box squats to a
pain-free depth, hip-hinge and posterior-chain work, or low-impact conditioning
instead of running/jumping). When you make such a substitution, say why in that
exercise's "notes". When in doubt, choose the more conservative option. If the
profile lists no injuries, train without restriction.`;

// ── Structured injury/health constraints ────────────────────────────────────
// Fed by two Notion multi_select columns (see api/_lib/notion.js): the coach/
// client checks all that apply and each checked option becomes a HARD AVOID rule
// below. To ACTIVATE a rule, the Notion option label must match a key here
// (case-insensitive; a key also matches if it appears within the label, so
// "Knee" matches an option like "Knee (patellar)"). Draft rules — review before
// relying on them clinically.
const CONTRAINDICATIONS = {
  knee: 'AVOID high-impact and deep-knee-loading: jump squats, box jumps, depth jumps, plyometric lunges, deep barbell back squats, heavy leg extensions, running/sprint intervals. SUBSTITUTE: box squats to a pain-free depth, leg press through a pain-free range, hip thrusts and RDLs, sled pushes, cycling or rowing for conditioning.',
  "lower back": 'AVOID axial spinal loading and loaded lumbar flexion: conventional/heavy deadlifts, barbell back squats, barbell good mornings, bent-over barbell rows, weighted sit-ups and Russian twists. SUBSTITUTE: trap-bar or hip-hinge variations to tolerance, chest-supported rows, front-foot-elevated split squats, dead bugs, bird dogs, Pallof press.',
  shoulder: 'AVOID overhead and end-range shoulder loading: barbell overhead press, behind-the-neck press, upright rows, heavy dips, wide-grip bench press. SUBSTITUTE: neutral-grip landmine press, floor press, cable work in a pain-free arc, scapular stability work.',
  neck: 'AVOID cervical loading and impact: heavy shrugs, behind-the-neck movements, bridging on the head, high-impact plyometrics. SUBSTITUTE: machine-supported work, neutral-spine training, controlled tempo.',
  hip: 'AVOID deep hip flexion under load and ballistic hip work: deep squats, heavy sumo pulls, explosive kettlebell swings if painful. SUBSTITUTE: partial-ROM to pain-free depth, glute bridges, controlled hinge patterns.',
  "ankle/foot": 'AVOID high-impact and heavy loaded dorsiflexion: running, jump/plyometric work, deep loaded lunges. SUBSTITUTE: low-impact conditioning (bike, row, sled), seated/machine lower-body work.',
  "wrist/elbow": 'AVOID heavy direct-grip and end-range wrist loading: heavy barbell curls, straight-bar pressing that aggravates, heavy grip work. SUBSTITUTE: neutral-grip/EZ-bar variants, straps, machine and cable alternatives.',
};
const HEALTH_GUIDANCE = {
  "high blood pressure": 'AVOID heavy isometrics, Valsalva-heavy maximal (1-3RM) lifting, and fully inverted positions; keep intensity at or below RPE 8, keep rest adequate, and avoid breath-holding.',
  asthma: 'Ramp conditioning gradually with longer warm-ups; avoid maximal all-out continuous intervals early in the program and build work capacity progressively.',
  diabetes: 'Favor steady, predictable session structure; avoid extreme fasted maximal efforts and note the importance of consistent intra-session fueling.',
  "heart condition": 'Keep intensity conservative (cap ~RPE 7-8), avoid maximal lifts and all-out anaerobic intervals, prioritize steady-state conditioning; defer to medical clearance.',
  "pregnancy/postpartum": 'AVOID supine work after the first trimester, Valsalva/maximal straining, deep core flexion, and high-impact/high-fall-risk movements. SUBSTITUTE: upright and supported variations, controlled breathing, pelvic-floor-safe loading.',
};

// Normalizes a multi_select label for lookup against the tables above.
const normFlag = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// Builds the HARD-CONSTRAINT block from the client's checked injury/health flags.
// Returns "" when nothing is flagged, so the prompt is unchanged for clients with
// no structured flags (the generic INJURY / LIMITATION SAFETY clause still applies
// to any free-text injuries).
export function constraintBlock(client) {
  const parse = (v) => String(v || "").split(",").map(normFlag).filter(Boolean);
  const lines = [];

  for (const flag of parse(client.injury_flags)) {
    const key = Object.keys(CONTRAINDICATIONS).find((k) => flag === k || flag.includes(k));
    lines.push(`- Injury "${flag}": ${key ? CONTRAINDICATIONS[key] : "avoid any exercise that loads or aggravates this area; substitute a pain-free alternative that trains the same V12 pillar."}`);
  }
  for (const flag of parse(client.health_flags)) {
    const key = Object.keys(HEALTH_GUIDANCE).find((k) => flag === k || flag.includes(k));
    lines.push(`- Health flag "${flag}": ${key ? HEALTH_GUIDANCE[key] : "program conservatively around this condition and avoid contraindicated intensity or movements."}`);
  }

  if (!lines.length) return "";
  return `NON-NEGOTIABLE INJURY & HEALTH CONSTRAINTS — the client has flagged the items below.
You MUST NOT program any contraindicated exercise listed here. This OVERRIDES the
template, the stated goal, and the V12 three-pillar requirement. Where a pillar's
default movement is contraindicated, train that pillar with the substitute instead;
never simply drop the pillar. Note the substitution reason in that exercise's "notes".
${lines.join("\n")}\n`;
}

// Named-progression-model toolkit (see progression_models table, edited by
// the coach via the Progression Models panel — src/lib/progressionModels.js)
// — a small set of candidate methodologies tagged to the client's current
// top-level phase (Foundation/Accumulation/Performance). The AI picks
// exactly one candidate per client (based on assessment scores/experience/
// equipment/coaching context) in the skeleton stage; the detail stage then
// applies that SAME choice, passed in as `chosenKey`, so both stages stay
// consistent instead of picking independently.
function buildProgressionCandidatesBlock(candidates) {
  if (!candidates || !candidates.length) return "";
  const list = candidates.map((m) => `- "${m.key}" (${m.label}): ${m.methodology}`).join("\n");
  return `PROGRESSION MODEL — choose exactly ONE of the following named models that best fits THIS client, based on their V12 assessment scores, experience level, equipment, and coaching context. Apply its methodology throughout the week's structure and set/rep/loading guidance. State which one you chose in "progression_model_used" (the exact key string, e.g. "conjugate").
${list}\n\n`;
}

function buildChosenModelBlock(candidates, chosenKey) {
  const chosen = (candidates || []).find((m) => m.key === chosenKey);
  if (!chosen) return "";
  return `PROGRESSION MODEL FOR THIS WEEK (already chosen in the planning step — apply it throughout): "${chosen.key}" (${chosen.label}): ${chosen.methodology}\n\n`;
}

// Local-gym equipment allowlist + banned-equipment substitutions, enforced via
// the prompt only (this codebase has no exercise catalog to hard-validate
// against). Returns "" for clients who aren't flagged is_local, so the prompt
// is unchanged for remote/other-gym clients (who keep using their free-text
// equipment/home_equipment answers as-is).
export function equipmentBlock(client) {
  if (!client.is_local) return "";
  return `LOCAL GYM EQUIPMENT (this client trains at the coach's own gym — this OVERRIDES their free-text equipment answer above):
Available: barbells, dumbbells, kettlebells, squat racks, benches, cable machines, pull-up bars, resistance bands, air bikes, SkiErgs, RowErgs, and standard cardio equipment (treadmills, bikes).
NOT available — never program these, and substitute an equivalent movement that preserves the same training stimulus: medicine balls (substitute a dumbbell/kettlebell slam or throw variant), battle ropes (substitute an air bike or kettlebell/dumbbell conditioning interval), sled pushes/pulls (substitute loaded carries, air bike sprints, or a heavy trap-bar/hex-bar drag if a hex bar is available, or resisted band walks), BikeErg/calorie bikes (substitute an air bike or RowErg/SkiErg for that conditioning piece).\n`;
}

// Generates a 12-week V12 weekly training split tailored to the client and the
// coach-selected template.
// Stage 1 of training generation: decide the week's shape (day names + each
// day's V12-pillar focus) with NO exercises yet. Small output, so this
// finishes in a few seconds and lets stage 2 run its detail calls in
// parallel against a shared, already-agreed structure.
async function generateTrainingSkeleton(client) {
  const __t0 = performance.now();
  console.log(`[anthropic timing] generateTrainingSkeleton: before Anthropic request (elapsed: 0ms)`);
  const message = await withTimeout("generateTrainingSkeleton", (signal) =>
    anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `You are V12 Performance Systems, an elite hybrid-performance coaching AI.

${V12_METHOD}

${clientProfileBlock(client)}

${equipmentBlock(client)}${constraintBlock(client)}${buildProgressionCandidatesBlock(client.progression_candidates)}${
  client.coach_assessment
    ? `COACH'S ONBOARDING ASSESSMENT (authoritative — the coach evaluated this client directly; prioritize it over inference when shaping the plan):\n${client.coach_assessment}\n\n`
    : ""
}${
  client.program_template
    ? `${client.program_template}\n\nUse this template as the framework. Replicate its WEEKLY SPLIT exactly — the same training days and each day's focus.\n`
    : "No template provided — design the week's days and each day's focus from the V12 method and the assessment.\n"
}
TASK: design ONLY this week's high-level structure — do NOT generate individual exercises yet, that happens in a later step. Across the week, all three V12 pillars (Powerlifting, Bodybuilding, Athletic/Conditioning) must appear across the days' focuses. days_per_week must match the client's "Training Days Per Week" above (or the template's day count, if a template is provided).

OUTPUT FORMAT — respond with valid JSON only, no other text:
{
  "program_name": "string",
  "goal": "string",
  "days_per_week": number,
  "weeks": 12,
  "progression_model_used": ${client.progression_candidates?.length ? '"the exact key of the model you chose from PROGRESSION MODEL above"' : "null"},
  "weekly_split": [
    {
      "day": "Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday (must be exactly one of these 7)",
      "focus": "string naming the day's primary V12 pillar(s), e.g. \\"Powerlifting — Lower\\" or \\"Hypertrophy + Conditioning\\""
    }
  ]
}`,
          },
        ],
      },
      { signal }
    )
  );
  const __t1 = performance.now();
  console.log(`[anthropic timing] generateTrainingSkeleton: after Anthropic request (${(__t1 - __t0).toFixed(0)}ms)`);
  const result = parseJson(message.content[0].text, "generateTrainingSkeleton");
  console.log(`[anthropic timing] generateTrainingSkeleton: after JSON parsing (${(performance.now() - __t1).toFixed(0)}ms)`);
  return result;
}

// Stage 2 of training generation: fill in the actual exercises for a subset
// of the week's days (dayGroup), given the full skeleton as context so this
// group's days stay consistent with the days other parallel calls are
// covering. Multiple day groups run concurrently via Promise.all in
// generateTrainingPlan, so wall-clock time is bounded by the slowest single
// group instead of the whole week in one call.
async function generateTrainingDayDetails(client, skeleton, dayGroup, groupIndex) {
  const label = `generateTrainingDayDetails[${groupIndex}]`;
  const dayNames = dayGroup.map((d) => d.day);
  const __t0 = performance.now();
  console.log(`[anthropic timing] ${label}: before Anthropic request for [${dayNames.join(", ")}] (elapsed: 0ms)`);
  const message = await withTimeout(label, (signal) =>
    anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: `You are V12 Performance Systems, an elite hybrid-performance coaching AI, filling in exercises for part of an already-structured training week.

${V12_METHOD}

${clientProfileBlock(client)}

${equipmentBlock(client)}${constraintBlock(client)}${buildChosenModelBlock(client.progression_candidates, skeleton.progression_model_used)}${
  client.coach_assessment
    ? `COACH'S ONBOARDING ASSESSMENT (authoritative — the coach evaluated this client directly; prioritize it over inference when shaping the plan):\n${client.coach_assessment}\n\n`
    : ""
}${
  client.locked_exercises_text
    ? `LOCKED-IN EXERCISES — these already exist in this client's program exactly as listed below and will remain unchanged (they have logged history that can't be discarded). Do NOT include them in your output, and do NOT invent a different exercise that duplicates the same movement pattern on the same day — design the rest of that day's work around them, accounting for the volume/phase they already cover:\n${client.locked_exercises_text}\n\n`
    : ""
}${
  client.program_template
    ? `${client.program_template}\n\n` +
      `Use this template's SESSION TEMPLATE slot order for every day below, filling each ` +
      `slot with the actual exercises that best fit this client's assessment, goal, ` +
      `equipment, and injuries, using the template's set×rep schemes. Apply the ` +
      `progression rule. Set each exercise's "section" to its canonical workout phase ` +
      `(see PHASE ORDER below), mapped from the template's session slot: ` +
      `primary/secondary lifts -> "Main Compound Lift"/"Secondary Compound Lift"; ` +
      `accessories/hypertrophy -> "Accessories" or "Isolation"; conditioning/finishers ` +
      `-> "Conditioning" or "Finisher"; add explosive/power work as "Power/Plyometrics" ` +
      `where the template calls for it. Bias volume by the client's three-system assessment.\n`
    : "No template provided — design each day's exercises from the V12 method and the assessment, and label each exercise with a sensible \"section\" from the PHASE ORDER below.\n"
}
THIS WEEK'S FULL STRUCTURE (already decided in an earlier planning step — every day is listed for context so your days stay consistent in tone/volume with the rest of the week; do NOT change any day's name or focus):
${skeleton.weekly_split.map((d) => `- ${d.day}: ${d.focus}`).join("\n")}

YOUR TASK — generate the full list of exercises for ONLY these ${dayNames.length} day(s): ${dayNames.join(", ")}. Do not output any other day.

PHASE ORDER — every day's exercises must be assignable to exactly one of these, in this order: "Warm-Up", "Activation", "Power/Plyometrics", "Main Compound Lift", "Secondary Compound Lift", "Accessories", "Isolation", "Conditioning", "Finisher", "Cooldown". A day doesn't need every phase, but whichever phases it uses must appear in this order.

Requirements for the output:
- Each exercise "category" must be one of: "Powerlifting", "Bodybuilding", "Power", or "Conditioning".
- Each exercise "section" must be exactly one of the PHASE ORDER values above — this is the exercise's workout-ordering phase, e.g. a heavy back squat is "Main Compound Lift", a dynamic warm-up drill is "Warm-Up", core/single-joint work is "Isolation".
- Each exercise "exercise_type" must be one of: "Compound", "Accessory", "Circuit", or "Warmup" — the movement's role for strength-progress tracking (heavy multi-joint lift = Compound; isolation/support = Accessory; conditioning/metcon/timed = Circuit; warm-up/mobility = Warmup). This is independent of "section" — e.g. a "Secondary Compound Lift" is still exercise_type "Compound".
- Within a day, order exercises by PHASE ORDER (Warm-Up first, Cooldown last).
- Each exercise "notes" must include loading guidance (e.g. "@80% 1RM", "RPE 8", tempo, or work/rest).
- RIR STANDARD: every exercise defaults to 2-3 RIR (Reps in Reserve) — across ALL phases and progression models — EXCEPT exercises in the "Finisher" section, which are programmed to failure (0 RIR) instead. State the RIR explicitly in that exercise's "notes" (e.g. "3x8 @ 2 RIR", or "to failure" for a Finisher).
- Every programmed exercise must be safe given the client's listed injuries/limitations (see INJURY / LIMITATION SAFETY above); if none are listed, this imposes no restriction.
- Match design complexity to the ADHERENCE & COACHING CONTEXT: low commitment/confidence -> a simpler, high-adherence split (fewer exercises, clear progression) over a maximally optimal one; high commitment/confidence -> more ambitious volume and variety. Where past barriers are listed, design around them (e.g. "time constraints" -> tighter sessions and supersets; "consistency" -> fewer, repeatable sessions; "motivation" -> visible weekly progression). Reflect the coaching-style preference (Direct / Supportive / Mixed) in the tone of exercise "notes".
- Tag block grouping on every exercise: "block_type" is one of "straight_set" (default, logged individually — weight+reps per set, rest between sets), "superset" (2+ exercises performed back-to-back as a group, rest logged once after the whole group), "circuit_for_time" (a for-time circuit — time only, no rest between exercises), "timed_circuit" (fixed time per exercise, e.g. 40 sec each, rest once per round), or "weighted_circuit" (same as timed_circuit but weight is also tracked per exercise). Exercises that are executed together as one group (a superset/circuit) share the same "group_id" (e.g. "A1"); straight-set exercises get a unique "group_id" equal to their own order in the day.

OUTPUT FORMAT — respond with valid JSON only, no other text:
{
  "weekly_split": [
    {
      "day": "one of: ${dayNames.join(" | ")}",
      "focus": "string (must match this day's focus given in THIS WEEK'S FULL STRUCTURE above)",
      "exercises": [
        {
          "name": "string",
          "category": "Powerlifting | Bodybuilding | Power | Conditioning",
          "section": "Warm-Up | Activation | Power/Plyometrics | Main Compound Lift | Secondary Compound Lift | Accessories | Isolation | Conditioning | Finisher | Cooldown",
          "exercise_type": "Compound | Accessory | Circuit | Warmup",
          "block_type": "straight_set | superset | circuit_for_time | timed_circuit | weighted_circuit",
          "group_id": "string (exercises performed together as one block share this value)",
          "sets": number,
          "reps": "string",
          "is_bodyweight": boolean,
          "notes": "string"
        }
      ]
    }
  ]
}`,
          },
        ],
      },
      { signal }
    )
  );
  const __t1 = performance.now();
  console.log(`[anthropic timing] ${label}: after Anthropic request (${(__t1 - __t0).toFixed(0)}ms)`);
  const result = parseJson(message.content[0].text, label);
  console.log(`[anthropic timing] ${label}: after JSON parsing (${(performance.now() - __t1).toFixed(0)}ms)`);
  return result;
}

// Each detail call's wall-clock time scales with how many days it covers.
// Measured: 2 days/call ~31-42s (uncomfortably close to the 45s abort on a
// 7-day week); 1 day/call ~20-29s (comfortable margin, ~35s total including
// the skeleton, even for a 7-day week run as 7 fully parallel calls with no
// rate-limit errors observed). Chunking at a fixed size — rather than always
// splitting into exactly 2 groups — keeps each call's workload flat
// regardless of days_per_week, instead of the largest group growing with it.
const DETAIL_CHUNK_SIZE = 1;

// Generates a 12-week V12 weekly training split tailored to the client and
// the coach-selected template. Split into a fast structure-only "skeleton"
// call followed by N parallel "detail" calls (one per chunk of days) so
// wall-clock time is bounded by the slowest chunk instead of the whole week
// generated in a single request — a single-request week was measured at
// ~57s, right against Vercel's 60s function timeout.
export async function generateTrainingPlan(client) {
  const __t0 = performance.now();
  const skeleton = await generateTrainingSkeleton(client);
  const __tSkeleton = performance.now();
  console.log(`[anthropic timing] generateTrainingPlan: skeleton done (${(__tSkeleton - __t0).toFixed(0)}ms), days_per_week=${skeleton.days_per_week}`);

  const days = skeleton.weekly_split || [];
  const groups = [];
  for (let i = 0; i < days.length; i += DETAIL_CHUNK_SIZE) {
    groups.push(days.slice(i, i + DETAIL_CHUNK_SIZE));
  }

  const detailResults = await Promise.all(
    groups.map((group, i) => generateTrainingDayDetails(client, skeleton, group, i))
  );
  console.log(`[anthropic timing] generateTrainingPlan: all detail groups done (${(performance.now() - __tSkeleton).toFixed(0)}ms)`);

  const exercisesByDay = new Map();
  for (const result of detailResults) {
    for (const day of result.weekly_split || []) {
      exercisesByDay.set(day.day, day.exercises || []);
    }
  }

  const weekly_split = days.map((d) => ({
    day: d.day,
    focus: d.focus,
    exercises: exercisesByDay.get(d.day) || [],
  }));

  console.log(`[anthropic timing] generateTrainingPlan: TOTAL (${(performance.now() - __t0).toFixed(0)}ms)`);
  return {
    program_name: skeleton.program_name,
    goal: skeleton.goal,
    days_per_week: skeleton.days_per_week,
    weeks: skeleton.weeks || 12,
    progression_model_used: skeleton.progression_model_used || null,
    weekly_split,
  };
}

// Generates a daily nutrition plan personalized to the client's goal (from their
// Notion application) and aligned with the V12 method's energy-system demands.
export async function generateNutritionPlan(client) {
  const __t0 = performance.now();
  console.log(`[anthropic timing] generateNutritionPlan: before Anthropic request (elapsed: 0ms)`);
  const message = await withTimeout("generateNutritionPlan", (signal) =>
    anthropic.messages.create(
      {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: `You are V12 Performance Systems, an elite sports-nutrition AI.

Build a daily nutrition plan PERSONALIZED to this client's goal from their Notion
application. The plan must directly serve their stated goal and fuel the V12
method's three energy systems (heavy strength work, hypertrophy volume, and
metabolic conditioning).

${clientProfileBlock(client)}

Guidance:
- Anchor everything to the PRIMARY GOAL above. Examples: strength/powerlifting ->
  higher protein and carbohydrate, carbs concentrated around training; muscle gain
  -> a modest surplus with high protein; fat loss -> a controlled deficit that
  protects lean mass and training quality; performance -> ample carbs for work
  capacity and recovery.
- If a Calorie Target is provided, build around it; otherwise estimate maintenance
  from the client's CURRENT BODYWEIGHT, AGE, and DAILY ACTIVITY LEVEL (plus training
  volume), then apply the goal's surplus/deficit — sized to reach any stated TARGET
  CHANGE at a sustainable rate. State the bodyweight/activity assumptions you used in
  "guidelines". If bodyweight is missing, say so and give a conservative estimate.
- Factor NUTRITION CONSISTENCY into how the plan is framed: "Inconsistent" -> simpler,
  more forgiving structure and habit guidance; "Structured" -> more precise targets.
- Use the ADHERENCE & COACHING CONTEXT to set how demanding the plan is and how it
  reads: low commitment/confidence or past barriers (e.g. consistency, time, stress)
  -> fewer, simpler, more sustainable meals and habit-first "guidelines"; high
  commitment -> more precise targets. Address the client's stated past struggles in
  "guidelines", and reflect their coaching-style preference (Direct / Supportive /
  Mixed) in the tone.
- Strictly honor dietary preference and allergies.
- Set realistic macro targets and a sample day of meals.
- Include a GENERIC supplement/vitamin stack — general-population staples only
  (e.g. whey/plant protein, creatine monohydrate, vitamin D3, omega-3/fish oil,
  magnesium), each at standard label dosing. Pick only the ones that plausibly
  serve the stated goal; do not include a supplement you would not give to any
  healthy adult with that goal. Do NOT personalize dosing to age, sex, bodyweight,
  medications, or health conditions, and do NOT recommend anything if the client
  profile mentions pregnancy, a medical condition, or medication use — in that
  case return an empty "supplements" array. This is general information, not
  individualized medical or dietetic advice.

OUTPUT FORMAT — respond with valid JSON only, no other text:
{
  "plan_name": "string",
  "daily_calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fats_g": number,
  "hydration": "string (e.g. daily water target)",
  "guidelines": "string (2-4 sentences tying the plan to the client's goal)",
  "meals": [
    {
      "meal": "Breakfast",
      "time": "8:00 AM",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fats_g": number,
      "items": ["1 cup oats", "2 whole eggs"]
    }
  ],
  "supplements": [
    {
      "name": "Creatine Monohydrate",
      "dose": "5g",
      "timing": "Daily, any time",
      "note": "Supports strength and training volume."
    }
  ]
}`,
      },
    ],
      },
      { signal }
    )
  );
  const __t1 = performance.now();
  console.log(`[anthropic timing] generateNutritionPlan: after Anthropic request (${(__t1 - __t0).toFixed(0)}ms)`);

  console.log(`[anthropic timing] generateNutritionPlan: before JSON parsing (elapsed: ${(performance.now() - __t0).toFixed(0)}ms)`);
  const result = parseJson(message.content[0].text, "generateNutritionPlan");
  console.log(`[anthropic timing] generateNutritionPlan: after JSON parsing (${(performance.now() - __t1).toFixed(0)}ms)`);
  return result;
}

// A short, encouraging plain-text recap of the client's last ~30 days, built from
// their daily log, body metrics, and logged workouts. Returns prose (not JSON).
export async function generateCheckinSummary({ profile = {}, daily = [], logs = [], phaseHistory = [], goal = null, strength = [] }) {
  const weights = daily.filter((d) => d.weight != null);
  // Workouts = distinct days with a logged session OR a daily check-in marked
  // "completed" (the client's "Training Today" self-report).
  const workoutDates = new Set(logs.map((l) => l.date));
  daily.forEach((d) => { if (d.workout === "completed") workoutDates.add(d.date); });
  const workoutDays = workoutDates.size;
  const habitDays = daily.filter((d) => d.habit_flags).length;
  const data = {
    goal: profile.goal || "general fitness",
    days_logged: daily.length,
    workouts_completed: workoutDays,
    weight_start: weights[0]?.weight ?? null,
    weight_latest: weights[weights.length - 1]?.weight ?? null,
    habit_days_tracked: habitDays,
    sets_logged: logs.length,
    phase_changes: phaseHistory.map((h) => ({ phase: h.phase, date: h.changed_at?.slice(0, 10), note: h.phase_note })),
    structured_goal: goal,
    // Per-exercise top-set weight/rep movement over the same 30 days (see
    // api/_lib/strengthTrends.js) — real strength progress, not just
    // bodyweight/nutrition/habits.
    strength_progress: strength,
  };
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `You are a supportive but honest performance coach. Write a concise 30-day progress recap for ${profile.name || "the client"} (goal: ${data.goal}).
Use ONLY the data below — never invent numbers. If data is sparse, acknowledge it and encourage more consistent logging. If "phase_changes" is non-empty, you may mention the program phase change(s) as context for the recap. If "structured_goal" is non-null, its "classification"/"overall_score" are the real, computed goal progress — cite them directly rather than eyeballing the weight numbers yourself. If "strength_progress" is non-empty, each entry is one exercise's top-set movement (weight in lb, or reps for bodyweight moves) from "first_value" on "first_date" to "latest_value" on "latest_date" — weave in the clearest one or two as concrete strength wins (or, if a delta is negative, an honest note), not just body weight.

DATA (last 30 days): ${JSON.stringify(data)}

Write 3 short paragraphs, ~120-160 words total, second person ("you"):
1. What the data shows (weight trend, workouts completed, consistency, and any notable strength movement from strength_progress).
2. One clear win to celebrate — prefer a concrete strength_progress entry when one exists, otherwise the best of the other data.
3. One specific focus for the next 30 days.
Plain text only — no markdown headers, no bullet lists.`,
      },
    ],
  });
  return message.content[0].text.trim();
}

// A short coaching insight for a single goal, built from its computed score
// (src/lib/scoring/goalScoring.js) rather than raw check-in rows. Returns
// prose. Kept on the same small token budget as generateCheckinSummary —
// this is a much smaller prompt than program generation and shouldn't
// inherit that 16000-token budget.
export async function generateGoalInsight({ profile = {}, goal = {}, scoreData = {}, rawStats = {} }) {
  const data = {
    goal_type: goal.goal_type,
    direction: goal.direction,
    unit: goal.unit,
    baseline_value: goal.baseline_value,
    baseline_date: goal.baseline_date,
    target_value: goal.target_value,
    target_date: goal.target_date,
    overall_score: scoreData.overallScore,
    classification: scoreData.classification,
    progress_ratio: scoreData.progressRatio,
    velocity_per_day: scoreData.velocity,
    eta_date: scoreData.etaDate ? scoreData.etaDate.toISOString().slice(0, 10) : null,
    components: scoreData.components || {},
  };
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: `You are a supportive but honest performance coach. Write a short coaching insight for ${profile.name || "the client"}'s progress toward this goal: ${data.direction} ${data.goal_type} from ${data.baseline_value}${data.unit} to ${data.target_value}${data.unit} by ${data.target_date}.
Use ONLY the data below — never invent numbers. If a component score or raw stat is missing (null), don't mention it.

SCORES (0-100, already-computed component scores): ${JSON.stringify(data)}

RAW 30-DAY NUMBERS BEHIND THOSE SCORES (last 30 days) — when a component score is low, this is WHY; cite the specific number instead of just restating the score: ${JSON.stringify(rawStats)}
"strength_trends" inside those raw numbers is per-exercise top-set movement (weight in lb, or reps for bodyweight moves) from "first_value"/"first_date" to "latest_value"/"latest_date" — real strength progress, separate from the bodyweight-based goal score above. When it's non-empty, factor the clearest entry into your assessment even if the goal itself is a weight target.

Write 2 short paragraphs, ~80-120 words total, second person ("you"):
1. Where they stand right now (on pace / ahead / behind) and the CONCRETE reason driving that — e.g. "you averaged X calories against a Y target", "you logged Z of ${rawStats.window_days ?? 30} workouts", or "your top-set on [exercise] moved from X to Y", not just "nutrition is at 62%". Pick whichever raw number(s) — including a strength_trends entry when it's the most notable signal — explain the lowest component score(s) or best support the overall picture.
2. One concrete, specific recommendation for the next 1-2 weeks, tied directly to that same number (e.g. what to change about calorie intake, macros, training frequency, or load progression on a specific lift).
Plain text only — no markdown headers, no bullet lists.`,
      },
    ],
  });
  return message.content[0].text.trim();
}

// Advisory-only phase progression recommendation (Part 25/26 of the roadmap
// spec) — mirrors generateGoalInsight's shape (single small call, real data
// only, no invented numbers) but returns structured JSON instead of prose so
// the coach UI can render recommendation/reasoning/suggested action as
// separate fields with Approve/Modify/Hold/Reject actions. The AI never
// writes to the program itself — this only ever produces a row the coach
// reviews.
export async function generatePhaseRecommendation({ profile = {}, phase = {}, exitCriteria = [], milestones = [] }) {
  const data = {
    phase_name: phase.phase,
    objective: phase.objective,
    training_focus: phase.training_focus,
    movement_focus: phase.movement_focus,
    progression_strategy: phase.progression_strategy,
    exit_criteria: exitCriteria.map((c) => ({ label: c.label, status: c.status })),
    milestones: milestones.map((m) => ({
      exercise: m.exercise_name, category: m.category, baseline: m.baseline_value,
      target: m.target_value, unit: m.unit, current: m.current_value,
    })),
  };
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are an experienced strength coach reviewing a client's current training phase for ${profile.name || "the client"}. Use ONLY the data below — never invent numbers or claim progress that isn't shown.

PHASE DATA: ${JSON.stringify(data)}

Respond with ONLY valid JSON (no markdown fences), matching exactly this shape:
{"recommendation": "one sentence, what to do next (e.g. continue current phase, adjust loading, consider transitioning)", "reasoning": "1-2 sentences citing the specific exit criteria / milestone numbers above that justify it", "suggested_action": "one short concrete next step for the coach"}
If exit_criteria or milestones are empty, say so plainly rather than guessing readiness. This is a recommendation only — the coach decides, so don't phrase it as already decided.`,
      },
    ],
  });
  const raw = message.content[0].text.trim().replace(/^```json?\s*/i, "").replace(/```$/, "");
  try { return JSON.parse(raw); }
  catch { return { recommendation: raw, reasoning: null, suggested_action: null }; }
}
