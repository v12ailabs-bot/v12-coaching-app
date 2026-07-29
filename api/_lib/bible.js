import { notion } from "./notion.js";

// Reads the "V12 Bible — AI Voice & Philosophy" Notion page (see
// NOTION_BIBLE_PAGE_ID) and flattens it to plain text for use as a tone
// reference in AI generation prompts — see api/_lib/anthropic.js. Excludes
// the "Sales Voice" section (pricing/closing language for prospects, not
// relevant to existing-client text). Cached in-memory per warm serverless
// instance; refetched after CACHE_TTL_MS.
//
// generate-program.js calls this from two concurrent Anthropic requests
// (training + nutrition) that already run close to Vercel's function
// timeout, so a slow/hanging Notion call must never block that budget:
// concurrent callers share one in-flight fetch, and FETCH_TIMEOUT_MS bounds
// the worst case — on timeout we return whatever's cached (possibly "")
// immediately while the fetch keeps running in the background to warm the
// cache for the next call. A failed fetch backs off before retrying so a
// Notion outage costs one timeout, not one per request.
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;
const FAILURE_BACKOFF_MS = 2 * 60 * 1000;

const SKIPPED_SECTIONS = new Set(["💬 SALES VOICE"]);

let cache = { text: "", fetchedAt: 0 };
let inFlight = null;
let lastFailureAt = 0;

function blockText(block) {
  return (block[block.type]?.rich_text || []).map((t) => t.plain_text).join("");
}

async function fetchFromNotion(pageId) {
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
  return lines.join("\n");
}

export async function getBibleVoiceGuidance() {
  const pageId = process.env.NOTION_BIBLE_PAGE_ID;
  if (!process.env.NOTION_API_KEY || !pageId) return "";

  if (cache.text && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.text;
  if (!cache.text && Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) return "";

  if (!inFlight) {
    inFlight = fetchFromNotion(pageId)
      .then((text) => {
        cache = { text, fetchedAt: Date.now() };
        lastFailureAt = 0;
        return text;
      })
      .catch(() => {
        lastFailureAt = Date.now();
        return cache.text;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  const timeout = new Promise((resolve) => setTimeout(() => resolve(cache.text), FETCH_TIMEOUT_MS));
  return Promise.race([inFlight, timeout]);
}
