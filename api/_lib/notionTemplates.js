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
      // Keep heading structure ("## " / "### ") so whole sections can be
      // recognised (e.g. the per-template session-duration rules) and the AI
      // sees the template's real outline.
      const marker = b.type === "heading_2" ? "## " : b.type === "heading_3" ? "### " : b.type === "heading_1" ? "# " : "";
      if (text) lines.push(marker + text);
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
      out.push({ id: page.id, name: m.name || "Untitled template", goal: m.goal, difficulty: m.difficulty, duration: m.duration, equipment: m.equipment });
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
  const rawBody = (await pageContentLines(page.id)).join("\n");
  const body = stripDurationRules(rawBody);
  return {
    id: page.id, ...meta,
    weeks: durationToWeeks(meta.duration),
    days: parseTemplateFrequency(rawBody),
    frameworkText: buildFrameworkText(meta, body),
  };
}

// ── Template reading helpers (pure; unit-tested) ────────────────────────────

// The library's templates each carry their own hard "never above 75 minutes"
// session-duration rules. The coach now chooses the session length per client
// (45–180+ minutes, depending on the coaching arrangement), so those rules are
// dropped from the framework — the SESSION TIME BUDGET in the prompt replaces
// them. Everything else (split, slots, progression, safety rules) is kept.
const DURATION_H2 = /^(session time budget|v12 ai rule\s*[—–-]\s*hard session duration cap)\b/i;
const DURATION_H3 = /^hard session duration rule\b/i;
const DURATION_LINE = /^(default\s+)?session\s+(target|length|duration)\s*:/i;

export function stripDurationRules(body) {
  const out = [];
  let skipLevel = null;
  for (const line of String(body || "").split("\n")) {
    const m = /^(#{1,3}) (.*)$/.exec(line);
    if (m) {
      const level = m[1].length;
      if (skipLevel && level <= skipLevel) skipLevel = null;
      if (!skipLevel && ((level === 2 && DURATION_H2.test(m[2])) || (level === 3 && DURATION_H3.test(m[2])))) skipLevel = level;
      if (skipLevel) continue;
    } else if (skipLevel) continue;
    if (DURATION_LINE.test(line.replace(/^#+ /, ""))) continue;
    out.push(line);
  }
  return out.join("\n");
}

// "12 weeks" -> 12, "3 months" -> 13, "1 month" -> 4, "ongoing" -> null.
export function durationToWeeks(duration) {
  const m = /(\d+(?:\.\d+)?)\s*(week|wk|month|mo)/i.exec(String(duration || ""));
  if (!m) return null;
  const n = Number(m[1]);
  const weeks = /^(week|wk)/i.test(m[2]) ? n : Math.round(n * 4.345);
  return weeks >= 1 && weeks <= 52 ? weeks : null;
}

// Training days per week when the template states ONE number ("Frequency: 4
// days/week", "frequency: 3 days"). A range ("2–3 days/week", "4-6 days") or no
// stated frequency returns null — the client's own availability then decides.
export function parseTemplateFrequency(body) {
  const m = /(?:^|\n)[#\s·-]*(?:frequency)\s*:\s*(\d)(?:\s*([–-])\s*(\d))?/i.exec(String(body || ""));
  if (!m || m[2]) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 7 ? n : null;
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
  return `${head}\n\nThe template below defines the WEEKLY SPLIT / STRUCTURE (training days and ` +
    `each day's focus) and the session slots (e.g. primary lift, secondary lift, accessories, core, ` +
    `conditioning — with set×rep schemes), plus a progression rule and safety rules. Follow it as the ` +
    `framework. Rest/recovery days listed in the template are NOT training days: do not output them. ` +
    `If the template states a frequency range (e.g. 4-6 days), use the client's Training Days Per Week ` +
    `when it falls inside the range, otherwise the nearest bound. Any session-length wording that ` +
    `remains in the template is superseded by the SESSION TIME BUDGET given separately.\n\n${body}`;
}
