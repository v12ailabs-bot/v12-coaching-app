import { notion, readProp } from "./notion.js";

// The Notion "program library" database. Each page is a program template whose
// body defines a WEEKLY SPLIT and a SESSION TEMPLATE (primary / secondary lift,
// accessories, core, conditioning, with set×rep schemes) plus a progression
// rule. That body is read as the framework for AI generation — the AI replicates
// the split and fills each session slot with real exercises from the client's
// assessment.
export const PROGRAM_LIBRARY_DB_ID =
  process.env.NOTION_PROGRAM_LIBRARY_DB_ID || "322930f968978089a0bac68ad019bb4c";

const normalize = (s) => String(s || "").trim().toLowerCase().replace(/[\s_/-]+/g, " ").trim();

// Read the template meta from page properties (title + the select fields).
function readMeta(props) {
  let name = null, goal = null, duration = null, difficulty = null, equipment = null;
  for (const [k, v] of Object.entries(props || {})) {
    const nk = normalize(k);
    if (v?.type === "title") name = readProp(v) || name;
    else if (nk === "program name") name = name || readProp(v);
    else if (nk === "goal") goal = readProp(v);
    else if (nk === "duration") duration = readProp(v);
    else if (nk === "difficulty") difficulty = readProp(v);
    else if (nk === "equipment") equipment = readProp(v);
  }
  return { name, goal, duration, difficulty, equipment };
}

// The full page body as text lines (overview, weekly split, session template,
// progression). Follows one level of nesting.
async function pageContentLines(pageId, depth = 0) {
  if (depth > 2) return [];
  const lines = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const b of res.results) {
      const text = (b[b.type]?.rich_text || []).map((t) => t.plain_text).join("").trim();
      if (text) lines.push(text);
      if (b.has_children) lines.push(...(await pageContentLines(b.id, depth + 1)));
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return lines;
}

// Lightweight list for the coach's template picker — meta only, no body fetch.
export async function listProgramTemplates() {
  const out = [];
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: PROGRAM_LIBRARY_DB_ID, start_cursor: cursor, page_size: 100 });
    for (const page of res.results) {
      const m = readMeta(page.properties);
      out.push({ id: page.id, name: m.name || "Untitled template", goal: m.goal, difficulty: m.difficulty, duration: m.duration });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

// Full template: meta + the body, rendered into a frameworkText for the prompt.
export async function getProgramTemplate(idOrName) {
  let page = null;
  const looksLikeId = /^[0-9a-f-]{30,}$/i.test(String(idOrName || ""));
  if (looksLikeId) page = await notion.pages.retrieve({ page_id: idOrName }).catch(() => null);
  if (!page) {
    const target = normalize(idOrName);
    let cursor;
    do {
      const res = await notion.databases.query({ database_id: PROGRAM_LIBRARY_DB_ID, start_cursor: cursor, page_size: 100 });
      page = res.results.find((p) => normalize(readMeta(p.properties).name) === target) || null;
      cursor = !page && res.has_more ? res.next_cursor : undefined;
    } while (cursor && !page);
  }
  if (!page) return null;

  const meta = readMeta(page.properties);
  const body = (await pageContentLines(page.id)).join("\n");
  return { id: page.id, ...meta, frameworkText: buildFrameworkText(meta, body) };
}

// Render the template into the framework block the AI follows. Returns null if
// the page has no body (caller falls back to the default V12 structure).
export function buildFrameworkText(meta, body) {
  if (!body || !body.trim()) return null;
  const head = [
    `PROGRAM TEMPLATE — "${meta.name || "Template"}"`,
    meta.goal && `Goal: ${meta.goal}`,
    meta.difficulty && `Difficulty: ${meta.difficulty}`,
    meta.duration && `Duration: ${meta.duration}`,
    meta.equipment && `Equipment: ${meta.equipment}`,
  ].filter(Boolean).join("\n");
  return `${head}\n\nThe template below defines the WEEKLY SPLIT (training days and ` +
    `each day's focus) and a SESSION TEMPLATE (the ordered session slots — e.g. ` +
    `primary lift, secondary lift, accessories, core, conditioning — with set×rep ` +
    `schemes), plus a progression rule. Follow it as the framework:\n\n${body}`;
}
