import { notion } from "./notion.js";

// Reads the "V12 Bible — AI Voice & Philosophy" Notion page (see
// NOTION_BIBLE_PAGE_ID) and flattens it to plain text for use as a tone
// reference in AI generation prompts — see api/_lib/anthropic.js. Excludes
// the "Sales Voice" section (pricing/closing language for prospects, not
// relevant to existing-client text). Cached in-memory per warm serverless
// instance; refetched after CACHE_TTL_MS or on first call.
const CACHE_TTL_MS = 30 * 60 * 1000;
let cache = { text: "", fetchedAt: 0 };

const SKIPPED_SECTIONS = new Set(["💬 SALES VOICE"]);

function blockText(block) {
  return (block[block.type]?.rich_text || []).map((t) => t.plain_text).join("");
}

export async function getBibleVoiceGuidance() {
  const pageId = process.env.NOTION_BIBLE_PAGE_ID;
  if (!process.env.NOTION_API_KEY || !pageId) return "";

  if (cache.text && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.text;

  try {
    const lines = [];
    let skipping = false;
    let cursor;
    do {
      const res = await notion.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 100,
      });
      for (const block of res.results) {
        if (block.type.startsWith("heading")) {
          skipping = SKIPPED_SECTIONS.has(blockText(block).trim());
        }
        if (skipping) continue;
        const text = blockText(block);
        if (text) lines.push(text);
      }
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);

    cache = { text: lines.join("\n"), fetchedAt: Date.now() };
  } catch {
    // Notion unreachable/misconfigured — keep serving the last-known-good
    // text (or "" on first failure) rather than breaking generation.
  }

  return cache.text;
}
