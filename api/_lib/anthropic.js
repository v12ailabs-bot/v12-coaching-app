import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-opus-4-8";
// A full 12-week, multi-day split (or a detailed meal plan) can exceed a few
// thousand tokens; 4000 truncated the JSON mid-string for larger clients.
const MAX_TOKENS = 16000;

// Parses model output as JSON, tolerating markdown code fences.
function parseJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function clientProfileBlock(client) {
  return `CLIENT PROFILE (from their Notion application):
- Name: ${client.name || "Unknown"}
- Primary Goal: ${client.goal || "General fitness"}
- Training Days Per Week: ${client.days_available ?? "Not specified"}
- Experience Level: ${client.experience_level || "Beginner"}
- Injuries / Limitations: ${client.injuries || "None"}
- Available Equipment: ${client.equipment || "Not specified"}
- Session Length: ${client.session_length || "Not specified"}
- Dietary Preference: ${client.dietary_preference || "No restrictions"}
- Allergies: ${client.allergies || "None"}
- Calorie Target: ${client.calorie_target ?? "Coach to determine"}

V12 THREE-SYSTEM ASSESSMENT (1-10 where provided; otherwise infer from goal + experience):
- Nervous System Recruitment: ${client.nervous_system_recruitment ?? "infer"}
- Muscular Density-to-Size Ratio: ${client.muscular_density_to_size ?? "infer"}
- Metabolic Work Capacity: ${client.metabolic_work_capacity ?? "infer"}`;
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
WEEK AS A WHOLE must train all three. Honor available days, equipment, injuries,
and session length.`;

// Generates a 12-week V12 weekly training split tailored to the client and the
// coach-selected template.
export async function generateTrainingPlan(client) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: `You are V12 Performance Systems, an elite hybrid-performance coaching AI.

${V12_METHOD}

${clientProfileBlock(client)}

${
  client.program_template
    ? `${client.program_template}\n\n` +
      `Use this template as the framework. Replicate its WEEKLY SPLIT exactly — the ` +
      `same training days and each day's focus — and within every session follow the ` +
      `SESSION TEMPLATE slot order, filling each slot with the actual exercises that ` +
      `best fit this client's assessment, goal, equipment, and injuries, using the ` +
      `template's set×rep schemes. Apply the progression rule. Set each exercise's ` +
      `"section" to its session slot (e.g. "Primary", "Secondary", "Accessory", ` +
      `"Core", "Conditioning"). Map slots to V12 pillars: primary/secondary lifts -> ` +
      `Powerlifting; accessories/hypertrophy -> Bodybuilding; conditioning/finishers ` +
      `-> Conditioning; add explosive/power work where the template calls for it. ` +
      `Bias volume by the client's three-system assessment.\n`
    : "No template provided — design the week from the V12 method and the assessment, and still label each exercise with a sensible \"section\".\n"
}
Requirements for the output:
- Each day's "focus" must name its primary V12 pillar(s), e.g. "Powerlifting — Lower" or "Hypertrophy + Conditioning".
- Each exercise "category" must be one of: "Powerlifting", "Bodybuilding", "Power", or "Conditioning".
- Each exercise "section" must name its session slot (e.g. "Primary", "Secondary", "Accessory", "Core", "Conditioning").
- Within a day, order exercises by the template's session-slot order.
- Each exercise "notes" must include loading guidance (e.g. "@80% 1RM", "RPE 8", tempo, or work/rest).
- Across the week, ALL THREE pillars must appear.

OUTPUT FORMAT — respond with valid JSON only, no other text:
{
  "program_name": "string",
  "goal": "string",
  "days_per_week": number,
  "weeks": 12,
  "weekly_split": [
    {
      "day": "Monday",
      "focus": "string",
      "exercises": [
        {
          "name": "string",
          "category": "Powerlifting | Bodybuilding | Power | Conditioning",
          "section": "string (session slot, e.g. Primary, Accessory, Conditioning)",
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
  });

  return parseJson(message.content[0].text);
}

// Generates a daily nutrition plan personalized to the client's goal (from their
// Notion application) and aligned with the V12 method's energy-system demands.
export async function generateNutritionPlan(client) {
  const message = await anthropic.messages.create({
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
- If a Calorie Target is provided, build around it; otherwise estimate one from the
  goal, experience, and training volume, and state your assumption in "guidelines".
- Strictly honor dietary preference and allergies.
- Set realistic macro targets and a sample day of meals.

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
  ]
}`,
      },
    ],
  });

  return parseJson(message.content[0].text);
}
