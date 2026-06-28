import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-opus-4-8";

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
  return `CLIENT PROFILE:
- Name: ${client.name || "Unknown"}
- Primary Goal: ${client.goal || "General fitness"}
- Training Days Per Week: ${client.days_available ?? "Not specified"}
- Experience Level: ${client.experience_level || "Beginner"}
- Injuries / Limitations: ${client.injuries || "None"}
- Available Equipment: ${client.equipment || "Not specified"}
- Session Length: ${client.session_length || "Not specified"}
- Dietary Preference: ${client.dietary_preference || "No restrictions"}
- Allergies: ${client.allergies || "None"}
- Calorie Target: ${client.calorie_target ?? "Coach to determine"}`;
}

// Generates a 12-week weekly training split tailored to the client.
export async function generateTrainingPlan(client) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are V12 Performance Systems, an elite fitness coaching AI.

Build a complete personalized weekly training program based on this client data.

${clientProfileBlock(client)}

${client.program_template ? `PROGRAM TEMPLATE TO FOLLOW:\n${client.program_template}\n` : ""}
Respect the client's available training days, equipment, and any injuries.

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
          "category": "string",
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

// Generates a daily nutrition plan with macro targets and a sample meal plan.
export async function generateNutritionPlan(client) {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are V12 Performance Systems, an elite sports-nutrition AI.

Build a personalized daily nutrition plan that supports this client's training goal.

${clientProfileBlock(client)}

Set realistic macro targets for the goal. Honor dietary preferences and allergies.
If a calorie target is provided, build the plan around it; otherwise estimate one.

OUTPUT FORMAT — respond with valid JSON only, no other text:
{
  "plan_name": "string",
  "daily_calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fats_g": number,
  "hydration": "string (e.g. daily water target)",
  "guidelines": "string (2-4 sentences of key nutrition guidance)",
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
