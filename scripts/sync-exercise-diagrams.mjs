// ---------------------------------------------------------------------------
// Syncs the "Muscle Group Diagrams" Notion database into Supabase:
// downloads each muscle group's "Diagram Image" file and re-uploads it to
// the exercise-diagrams storage bucket, then upserts a row in
// exercise_diagrams (muscle_group -> permanent public URL).
//
// Notion's own file URLs are temporary S3 links (~1hr expiry) whether they
// sit in a file property or are pasted into the page body -- this script is
// the only thing that ever calls Notion for this data; the live app reads
// exercise_diagrams instead.
//
// USAGE
//   1. Apply db/add_exercise_diagrams.sql to Supabase first.
//   2. .env needs NOTION_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY.
//   3. node --env-file=.env scripts/sync-exercise-diagrams.mjs
//   Re-run any time the Notion images change -- upserts by muscle_group, so
//   it's safe to run repeatedly.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

// Rendered at up to 96px in the app (2-3x that for retina) -- 320px keeps
// them crisp there. The Notion uploads came in at several MB each
// (full-resolution phone photos/exports of line art); resized once here
// rather than shipping multi-MB PNGs to every workout card.
const MAX_DIMENSION = 320;

const DATA_SOURCE_ID = "237a8e98-9c5e-4bde-a9c6-b110084b184e";
const NOTION_VERSION = "2025-09-03";
const BUCKET = "exercise-diagrams";

const { NOTION_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
for (const [k, v] of Object.entries({ NOTION_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

async function notionFetch(path, options = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${NOTION_API_KEY}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API error (${res.status}): ${data.message || JSON.stringify(data)}`);
  return data;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function fetchAllPages() {
  let cursor, all = [];
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const q = await notionFetch(`/data_sources/${DATA_SOURCE_ID}/query`, { method: "POST", body: JSON.stringify(body) });
    all = all.concat(q.results);
    cursor = q.has_more ? q.next_cursor : null;
  } while (cursor);
  return all;
}

let ok = 0, skipped = 0, failed = 0;
for (const page of await fetchAllPages()) {
  const muscleGroup = page.properties["Muscle Group / Body Part"]?.title?.[0]?.plain_text?.trim();
  const focusTags = (page.properties["Workout Focus Tag"]?.multi_select || []).map((t) => t.name);
  const files = page.properties["Diagram Image"]?.files || [];
  if (!muscleGroup) { console.warn("Skipping page with no title:", page.id); skipped++; continue; }
  if (files.length === 0) { console.warn(`Skipping "${muscleGroup}" — no file attached in Diagram Image.`); skipped++; continue; }

  const file = files[0];
  const url = file.file?.url || file.external?.url;
  const path = `${slugify(muscleGroup)}.png`;

  try {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`download failed: ${imgRes.status}`);
    const rawBuf = Buffer.from(await imgRes.arrayBuffer());
    const beforeKb = Math.round(rawBuf.length / 1024);
    // Normalized to PNG regardless of source format so every diagram is a
    // consistent, transparency-safe output — resize is a no-op if the
    // source is already smaller than MAX_DIMENSION.
    const buf = await sharp(rawBuf).resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    console.log(`  ${muscleGroup}: ${beforeKb}KB -> ${Math.round(buf.length / 1024)}KB`);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, { upsert: true, contentType: "image/png" });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbErr } = await supabase.from("exercise_diagrams").upsert({
      muscle_group: muscleGroup, image_url: pub.publicUrl, focus_tags: focusTags, synced_at: new Date().toISOString(),
    }, { onConflict: "muscle_group" });
    if (dbErr) throw dbErr;

    console.log(`✓ ${muscleGroup} -> ${pub.publicUrl}`);
    ok++;
  } catch (e) {
    console.error(`✗ ${muscleGroup}:`, e.message);
    failed++;
  }
}

console.log(`\nDone. ${ok} synced, ${skipped} skipped, ${failed} failed.`);
if (failed > 0) process.exit(1);
