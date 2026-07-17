// Client for the "V12 Lead Pipeline — CRM" Notion database specifically —
// separate from api/_lib/notion.js (which targets the unrelated Applications
// Database via NOTION_DATABASE_ID). This database has been migrated to
// Notion's newer multi-source-database format, which the installed
// @notionhq/client SDK version (2.2.15) can't parse ("Databases with
// multiple data sources are not supported in this API version") — so this
// file talks to the REST API directly with a newer Notion-Version header
// instead of bumping the SDK version and risking every other call site that
// depends on its current behavior.
//
// Set NOTION_CRM_DATA_SOURCE_ID to the data source id (not the database id —
// note-worthy in the new model, a "database" is a container that holds one
// or more "data sources"; properties/pages live on the data source). As of
// 2026-07-17 the live id is 22241e03-5f95-48c4-8f97-856abb1faf7b.
const NOTION_VERSION = "2025-09-03";
const DATA_SOURCE_ID = process.env.NOTION_CRM_DATA_SOURCE_ID;

async function notionFetch(path, options = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Notion API error (${res.status})`);
  return data;
}

// Keys are snake_case matching the app's `leads` table columns directly
// (not the Notion column names) so callers — the CRM panel's patch objects —
// never need a translation layer. Confirmed against the live data source via
// the API on 2026-07-17 — these are the real Notion column names, not guesses.
const PROP = {
  name: "Lead Name",
  email: "Email",
  goal: "Goal",
  stage: "Stage",
  channel: "Source",
  response_rate: "Response Rate",
  deal_value: "Deal Value",
  follow_up_date: "Follow Up Date",
  last_contact_date: "Last Contact Date",
  notes: "Notes",
  dm_opener_sent: "DM Opener Sent",
  application_submitted: "Application Submitted",
  call_booked: "Call Booked",
  moved_to_whatsapp: "Moved to WhatsApp",
};
const FIELD_TYPE = {
  name: "title", email: "email", goal: "select", stage: "select", channel: "select",
  response_rate: "select", deal_value: "number", follow_up_date: "date", last_contact_date: "date",
  notes: "rich_text", dm_opener_sent: "checkbox", application_submitted: "checkbox",
  call_booked: "checkbox", moved_to_whatsapp: "checkbox",
};

function wrapValue(type, value) {
  if (value == null || value === "") {
    // Explicit empty payload per type — omitting the key entirely leaves the
    // Notion property unchanged, which would silently skip a real
    // "clear this field" intent (e.g. clearing the follow-up date).
    switch (type) {
      case "date": return { date: null };
      case "rich_text": return { rich_text: [] };
      case "select": return { select: null };
      case "number": return { number: null };
      case "checkbox": return { checkbox: false };
      default: return null;
    }
  }
  switch (type) {
    case "title": return { title: [{ text: { content: String(value) } }] };
    case "rich_text": return { rich_text: [{ text: { content: String(value) } }] };
    case "email": return { email: String(value) };
    case "select": return { select: { name: String(value) } };
    case "number": { const n = Number(value); return Number.isFinite(n) ? { number: n } : null; }
    case "date": return { date: { start: String(value) } };
    case "checkbox": return { checkbox: !!value };
    default: return null;
  }
}

function buildProperties(fields) {
  const properties = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (!(key in PROP)) continue;
    const wrapped = wrapValue(FIELD_TYPE[key], value);
    if (wrapped) properties[PROP[key]] = wrapped;
  }
  return properties;
}

export async function findCrmLeadPage(email) {
  if (!process.env.NOTION_API_KEY || !DATA_SOURCE_ID || !email) return null;
  const data = await notionFetch(`/data_sources/${DATA_SOURCE_ID}/query`, {
    method: "POST",
    body: JSON.stringify({ filter: { property: PROP.email, email: { equals: email } }, page_size: 1 }),
  });
  return data.results?.[0] || null;
}

async function createCrmLeadPage(fields) {
  const properties = buildProperties(fields);
  if (!properties[PROP.name]) return null; // title is required to create a usable page
  const page = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID }, properties }),
  });
  return page.id;
}

async function updateCrmLeadPage(pageId, fields) {
  const properties = buildProperties(fields);
  if (!Object.keys(properties).length) return null;
  const page = await notionFetch(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  return page.id;
}

// Find-or-create by email, then apply fields either way. Used both when a
// lead is manually created (fields = the full form) and when an existing
// lead is edited later (fields = just the changed keys). Returns null
// (never throws over a missing config) when Notion isn't set up.
export async function upsertCrmLead(email, fields) {
  if (!process.env.NOTION_API_KEY || !DATA_SOURCE_ID || !email) return null;
  const existing = await findCrmLeadPage(email);
  if (existing) return updateCrmLeadPage(existing.id, fields);
  return createCrmLeadPage({ email, ...fields });
}
