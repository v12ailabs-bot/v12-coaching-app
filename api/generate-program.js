import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    client_email,
    client_name,
    goal,
    days_available,
    experience_level,
    injuries,
    equipment,
    session_length,
    program_template,
  } = req.body;

  try {
    // Build the program using Claude
    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are V12 Performance Systems, an elite fitness coaching AI.

Build a complete personalized weekly training program based on this client data and program template.

CLIENT PROFILE:
- Name: ${client_name}
- Primary Goal: ${goal}
- Training Days Per Week: ${days_available}
- Experience Level: ${experience_level}
- Injuries: ${injuries || "None"}
- Equipment: ${equipment}
- Session Length: ${session_length}

PROGRAM TEMPLATE TO FOLLOW:
${program_template}

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

    const programData = JSON.parse(message.content[0].text);

    // Find or create the client profile in Supabase
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", client_email)
      .maybeSingle();

    if (!profile) {
      return res.status(404).json({ error: "Client profile not found in app" });
    }

    // Delete old program if exists
    const { data: oldProgram } = await supabase
      .from("client_programs")
      .select("id")
      .eq("client_id", profile.id)
      .eq("active", true)
      .maybeSingle();

    if (oldProgram) {
      await supabase
        .from("client_programs")
        .update({ active: false })
        .eq("id", oldProgram.id);
    }

    // Create the program in Supabase
    const { data: newProgram } = await supabase
      .from("programs")
      .insert({
        name: programData.program_name,
        goal: programData.goal,
        experience_level: experience_level,
        description: `Custom V12 program built for ${client_name}`,
        weeks: 12,
      })
      .select()
      .single();

    // Insert all exercises
    const exercises = [];
    for (const day of programData.weekly_split) {
      for (let i = 0; i < day.exercises.length; i++) {
        const ex = day.exercises[i];
        exercises.push({
          program_id: newProgram.id,
          name: ex.name,
          category: ex.category,
          day_of_week: day.day,
          sets: ex.sets,
          reps: ex.reps,
          is_bodyweight: ex.is_bodyweight,
          notes: ex.notes || null,
          order_index: i,
        });
      }
    }

    await supabase.from("program_exercises").insert(exercises);

    // Assign program to client
    await supabase.from("client_programs").insert({
      client_id: profile.id,
      program_id: newProgram.id,
      start_date: new Date().toISOString().split("T")[0],
      active: true,
    });

    // Update profile with goal and onboarding complete
    await supabase
      .from("profiles")
      .update({
        goal: goal,
        onboarding_complete: true,
      })
      .eq("id", profile.id);

    return res.status(200).json({
      success: true,
      program: programData.program_name,
      exercises_created: exercises.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
