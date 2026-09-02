import { supabaseAdmin } from "./supabaseAdmin.js";

// Builds a client object shaped exactly like getClientFromNotion()'s return
// value, sourced from the in-app leads table instead of Notion. Lets
// generate-program.js fall back seamlessly for clients who applied through
// the new intake form (IntakeForm in src/App.jsx) rather than the old Notion
// Applications Database.
export async function getClientFromLead(email) {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("*")
    .ilike("email", email)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lead || !lead.intake_data) return null;

  const d = lead.intake_data;
  const injuries = [
    ...(d.currentInjuries || []).map((v) => `Current: ${v}`),
    ...(d.previousInjuries || []).map((v) => `Previous: ${v}`),
    ...(d.painTriggers || []).map((v) => `Trigger: ${v}`),
  ].join("; ") || null;

  return {
    lead_id: lead.id,
    email: lead.email || email,
    name: lead.name || d.name || null,
    goal: d.goal || null,
    days_available: d.daysAvailable || null,
    experience_level: d.experienceLevel || null,
    injuries,
    injury_flags: d.injuryFlags || null,
    health_flags: d.healthFlags || null,
    equipment: d.equipment || null,
    home_equipment: d.homeEquipment || null,
    age: d.age ? Number(d.age) : null,
    current_weight: d.currentWeight ? Number(d.currentWeight) : null,
    target_change: d.targetChange ? Number(d.targetChange) : null,
    activity_level: d.activityLevel || null,
    sleep_hours: d.sleepHours ? Number(d.sleepHours) : null,
    training_tenure: d.trainingTenure || null,
    nutrition_consistency: d.nutritionConsistency || null,
    coaching_style: d.coachingStyle || null,
    commitment_level: d.commitmentLevel ? Number(d.commitmentLevel) : null,
    confidence: d.confidence ? Number(d.confidence) : null,
    past_barriers: d.pastBarriers || null,
    why_now: d.whyNow || null,
    session_length: d.sessionLength || null,
    dietary_preference: d.dietaryPreference || null,
    allergies: d.allergies || null,
    calorie_target: d.calorieTarget ? Number(d.calorieTarget) : null,
    program_template_id: null,
    nervous_system_recruitment: null,
    muscular_density_to_size: null,
    metabolic_work_capacity: null,
  };
}
