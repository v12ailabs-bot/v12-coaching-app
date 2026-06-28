import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Maps the fields we need -> the property names in your Notion clients database.
// Adjust the right-hand side to match your database's exact column names.
const PROP = {
  email: "Email",
  name: "Name",
  goal: "Goal",
  daysAvailable: "Training Days",
  experienceLevel: "Experience Level",
  injuries: "Injuries",
  equipment: "Equipment",
  sessionLength: "Session Length",
  dietaryPreference: "Dietary Preference",
  allergies: "Allergies",
  calorieTarget: "Calorie Target",
  programTemplate: "Program Template",
};

// Reads a single Notion property into a plain JS value, regardless of its type.
function readProp(prop) {
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
async function findClientPage(databaseId, email) {
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
    equipment: get("equipment"),
    session_length: get("sessionLength"),
    dietary_preference: get("dietaryPreference"),
    allergies: get("allergies"),
    calorie_target: get("calorieTarget"),
    program_template: get("programTemplate"),
  };
}
