import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Maps the fields we need -> the property names in your Notion clients database.
// Adjust the right-hand side to match your database's exact column names.
export const PROP = {
  email: "Email",
  name: "Name",
  goal: "what's your #1 Primary Goal right now?",
  daysAvailable: "Days Available / Week",
  experienceLevel: "Training Experience",
  injuries: "any injuries ( past or present) and if so what triggers it?",
  // Structured hard-constraint flags — two multi_select columns you check "all
  // that apply". Option labels should match the keys in api/_lib/anthropic.js
  // (CONTRAINDICATIONS / HEALTH_GUIDANCE) to activate a specific AVOID rule.
  // Absent columns resolve to null and impose no constraint.
  injuryFlags: "Injuries / Limitations",
  healthFlags: "Health Conditions",
  equipment: "where will you primarily train?",
  // Home-gym detail — refines `equipment` when they train at home. Note the
  // trailing space in the column name (matches the Notion schema exactly).
  homeEquipment: "if you train at home which equipment do you have access to? ",
  sessionLength: "how much time can you realistically dedicate to each workout session?",
  // Intake context that improves programming + nutrition (previously unused).
  // Exact names/whitespace/typos below match the live Notion schema.
  age: "age",
  currentWeight: "current weight",
  targetChange: "Target Change (lbs)",
  activityLevel: "which best describes your daily activity level?",
  sleepHours: "how many hours of sleep do you average pernight ",
  trainingTenure: "how long have you been consistently training?",
  nutritionConsistency: "Nutrition Consistency",
  // Adherence / psychology — sets plan complexity, sustainability, and coaching
  // tone. Exact names below (note en-dash in Commitment, trailing space in
  // barriers) match the live Notion schema.
  coachingStyle: "Coaching Style Preference",
  commitmentLevel: "Commitment Level (1–10)",
  confidence: "How confident are you that can follow a structured program for the next 12 weeks? (1-10)",
  pastBarriers: "what has prevented you from reaching your goal in the past? ",
  pastStruggles: "Past Struggles",
  whyNow: "Why Now?",
  // Not collected in the current intake DB — left mapped for other databases;
  // resolve to null here and the AI prompt falls back gracefully.
  dietaryPreference: "Dietary Preference",
  allergies: "Allergies",
  calorieTarget: "Calorie Target",
  // Relation to the program library — the client's assigned program page.
  programTemplate: "program library (assigned program)",
  // V12 three-system assessment: coach-set on the profile, not in intake. Optional.
  nervousSystem: "Nervous System Recruitment",
  densityToSize: "Muscular Density-to-Size",
  workCapacity: "Metabolic Work Capacity",
  // CRM pipeline fields (app -> Notion, one-way; see syncLeadToNotion below).
  // These only exist in the app's `leads` table today — adjust the
  // right-hand side to whatever columns you add to the Notion database.
  status: "Stage",
  notes: "Coach Notes",
  followUpDate: "Follow-up Date",
  invoiceLink: "Invoice Link",
  paid: "Paid",
};

// Reads a single Notion property into a plain JS value, regardless of its type.
export function readProp(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
    case "rich_text":
      return (prop[prop.type] || []).map((t) => t.plain_text).join("").trim() || null;
    case "email":
      return prop.email || null;
    case "phone_number":
      return prop.phone_number || null;
    case "number":
      return prop.number;
    case "select":
      return prop.select?.name || null;
    case "status":
      return prop.status?.name || null;
    case "multi_select":
      return (prop.multi_select || []).map((s) => s.name).join(", ") || null;
    case "checkbox":
      return prop.checkbox;
    case "url":
      return prop.url || null;
    case "date":
      return prop.date?.start || null;
    case "relation":
      // Array of related page ids (empty relation -> null).
      return (prop.relation || []).map((r) => r.id).filter(Boolean).length
        ? prop.relation.map((r) => r.id)
        : null;
    case "formula":
      return readFormula(prop.formula);
    default:
      return null;
  }
}

function readFormula(f) {
  if (!f) return null;
  switch (f.type) {
    case "string":
      return f.string;
    case "number":
      return f.number;
    case "boolean":
      return f.boolean;
    case "date":
      return f.date?.start || null;
    default:
      return null;
  }
}

// Returns the email stored on a page, checking the configured property across
// the property types Notion commonly uses for emails.
function emailOf(page) {
  const prop = page.properties?.[PROP.email];
  return (readProp(prop) || "").toLowerCase();
}

// Finds the client's Notion page by email. Tries an indexed query first, then
// falls back to scanning the database (handles email stored as rich_text/title).
export async function findClientPage(databaseId, email) {
  const target = email.toLowerCase();

  try {
    const res = await notion.databases.query({
      database_id: databaseId,
      filter: { property: PROP.email, email: { equals: email } },
      page_size: 1,
    });
    if (res.results[0]) return res.results[0];
  } catch {
    // Property isn't an email type — fall through to the scan below.
  }

  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    const match = res.results.find((p) => emailOf(p) === target);
    if (match) return match;
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return null;
}

// Writes a new page into the Notion Applications Database from an in-app
// intake-form submission (IntakeForm in src/App.jsx), so applicants who apply
// through the app also show up in the coach's existing Notion views.
// Best-effort per field: fetches the live schema and only writes values for
// columns Notion actually has (skips app-only fields like height/package
// rather than failing the whole write). Returns null (not an error) if Notion
// isn't configured or nothing ends up mappable.
function wrapNotionValue(type, value) {
  if (value == null || value === "") return null;
  switch (type) {
    case "title": return { title: [{ text: { content: String(value) } }] };
    case "rich_text": return { rich_text: [{ text: { content: String(value) } }] };
    case "email": return { email: String(value) };
    case "number": { const n = Number(value); return Number.isFinite(n) ? { number: n } : null; }
    case "select": return { select: { name: String(value) } };
    case "multi_select": {
      const names = Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim()).filter(Boolean);
      return names.length ? { multi_select: names.map((name) => ({ name })) } : null;
    }
    case "checkbox": return { checkbox: !!value };
    case "url": return { url: String(value) };
    case "date": return { date: { start: String(value) } };
    default: return null; // formula/relation/status etc. -- not writable this way, skip
  }
}

export async function createNotionApplication(fields) {
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!process.env.NOTION_API_KEY || !databaseId) return null;

  const db = await notion.databases.retrieve({ database_id: databaseId });
  const schemaProps = db.properties;

  const properties = {};
  for (const [key, columnName] of Object.entries(PROP)) {
    const def = schemaProps[columnName];
    if (!def || fields[key] == null) continue;
    const wrapped = wrapNotionValue(def.type, fields[key]);
    if (wrapped) properties[columnName] = wrapped;
  }
  if (!properties[PROP.email]) return null; // email is required to create a usable page

  const page = await notion.pages.create({ parent: { database_id: databaseId }, properties });
  return page.id;
}

// Pushes CRM pipeline changes (status/notes/follow-up date/invoice info) to
// the lead's existing Notion page — one-way, app stays the source of truth.
// Never creates a page (that's createNotionApplication's job at apply-time);
// returns null if no matching page exists yet, if Notion isn't configured,
// or if none of the patch keys map to a column that exists in the live
// Notion schema (so this never throws over a schema mismatch).
//
// `patch` uses the app's leads-table field names: status (pass the
// human-readable label, not the internal key), notes, follow_up_date,
// invoice_link, paid. follow_up_date lands in a real Notion Date property so
// the coach can use Notion's own native reminder-subscription feature —
// there's no generic "push notification" API to build against here.
const LEAD_PATCH_TO_PROP = { status: "status", notes: "notes", follow_up_date: "followUpDate", invoice_link: "invoiceLink", paid: "paid" };

export async function syncLeadToNotion(email, patch) {
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!process.env.NOTION_API_KEY || !databaseId) return null;

  const page = await findClientPage(databaseId, email);
  if (!page) return null;

  const db = await notion.databases.retrieve({ database_id: databaseId });
  const schemaProps = db.properties;

  const properties = {};
  for (const [patchKey, propKey] of Object.entries(LEAD_PATCH_TO_PROP)) {
    if (!(patchKey in patch)) continue;
    const columnName = PROP[propKey];
    const def = schemaProps[columnName];
    if (!def) continue;
    const value = patch[patchKey];
    const wrapped = wrapNotionValue(def.type, value);
    if (wrapped) { properties[columnName] = wrapped; continue; }
    // wrapNotionValue returns null for empty values, which would silently skip
    // a real "clear this field" intent (e.g. clearing the follow-up date).
    // Notion requires an explicit empty payload per type to actually clear it.
    if (value == null || value === "") {
      if (def.type === "date") properties[columnName] = { date: null };
      else if (def.type === "rich_text") properties[columnName] = { rich_text: [] };
      else if (def.type === "url") properties[columnName] = { url: null };
      else if (def.type === "checkbox") properties[columnName] = { checkbox: false };
    }
  }
  if (!Object.keys(properties).length) return null;

  await notion.pages.update({ page_id: page.id, properties });
  return page.id;
}

// Fetches a client's intake data from Notion, normalized to a flat object.
// Returns null if no matching page exists.
export async function getClientFromNotion(email) {
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!process.env.NOTION_API_KEY) throw new Error("NOTION_API_KEY is not configured");
  if (!databaseId) throw new Error("NOTION_DATABASE_ID is not configured");

  const page = await findClientPage(databaseId, email);
  if (!page) return null;

  const p = page.properties;
  const get = (key) => readProp(p[PROP[key]]);

  return {
    notion_page_id: page.id,
    email: get("email") || email,
    name: get("name"),
    goal: get("goal"),
    days_available: get("daysAvailable"),
    experience_level: get("experienceLevel"),
    injuries: get("injuries"),
    injury_flags: get("injuryFlags"),
    health_flags: get("healthFlags"),
    equipment: get("equipment"),
    home_equipment: get("homeEquipment"),
    age: get("age"),
    current_weight: get("currentWeight"),
    target_change: get("targetChange"),
    activity_level: get("activityLevel"),
    sleep_hours: get("sleepHours"),
    training_tenure: get("trainingTenure"),
    nutrition_consistency: get("nutritionConsistency"),
    coaching_style: get("coachingStyle"),
    commitment_level: get("commitmentLevel"),
    confidence: get("confidence"),
    past_barriers: get("pastBarriers"),
    past_struggles: get("pastStruggles"),
    why_now: get("whyNow"),
    session_length: get("sessionLength"),
    dietary_preference: get("dietaryPreference"),
    allergies: get("allergies"),
    calorie_target: get("calorieTarget"),
    // First related program-library page id, if the intake assigns one.
    program_template_id: (get("programTemplate") || [])[0] || null,
    nervous_system_recruitment: get("nervousSystem"),
    muscular_density_to_size: get("densityToSize"),
    metabolic_work_capacity: get("workCapacity"),
  };
}
