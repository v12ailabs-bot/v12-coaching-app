// ---------------------------------------------------------------------------
// Create new program-library template pages (General Fitness, Group/Partner
// Session) matching the structure the AI generator reads (see
// api/_lib/notionTemplates.js). Resolves real property names from the DB schema
// so trailing spaces / capitalization in the Notion columns don't matter.
//
//   npm run create:templates
// ---------------------------------------------------------------------------

import { Client } from "@notionhq/client";

const DB_ID = process.env.NOTION_PROGRAM_LIBRARY_DB_ID || "322930f968978089a0bac68ad019bb4c";
if (!process.env.NOTION_API_KEY) { console.error("Missing NOTION_API_KEY"); process.exit(1); }
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const normalize = (s) => String(s || "").trim().toLowerCase().replace(/[\s_/-]+/g, " ").trim();

// Turn plain body lines into Notion paragraph blocks (matches how existing
// templates store their content — plain text, not headings).
const paragraphs = (lines) =>
  lines.map((text) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: text ? [{ type: "text", text: { content: text } }] : [] },
  }));

const TEMPLATES = [
  {
    mode: "update", // update the existing "general fitness" page in place
    meta: { name: "general fitness", goal: "general fitness", duration: "1 month", difficulty: "beginner", equipment: "Home equipment" },
    body: [
      "PROGRAM OVERVIEW",
      "frequency: 3-4 days",
      "session length: 45-60 min",
      "goal: overall health, balanced strength and conditioning",
      "rest: 60-90 sec",
      "WEEKLY SPLIT",
      "day 1: full body",
      "day 2: rest",
      "day 3: full body",
      "day 4: rest",
      "day 5: full body",
      "SESSION TEMPLATE",
      "warm up",
      "primary compound",
      "3x6-8",
      "secondary compound",
      "3x8-10",
      "accessory movement",
      "3x10-12",
      "core",
      "10 min",
      "light conditioning",
      "10-15 min",
      "PROGRESSION RULE",
      "week 1: establish baseline",
      "week 2: +1 rep or +5 pounds",
      "week 3: +1 rep or +5 pounds",
      "week 4: repeat or deload",
    ],
  },
  {
    mode: "create",
    meta: { name: "group / partner session", goal: "group training", duration: "ongoing", difficulty: "beginner", equipment: "full gym" },
    body: [
      "PROGRAM OVERVIEW",
      "frequency: 3 days",
      "session length: 45-60 min",
      "goal: partner training for two people who train together — every session runs all THREE phases from day one",
      "format: a shared session structure done as a pair, with INDIVIDUAL loads (one partner may be stronger than the other)",
      "scaling: this is NOT a program that adds phases over the weeks. Every pair — including beginners — runs all three phases from day one. Beginner pairs get a SCALED-DOWN version of the SAME three phases (lighter loads, simpler movements, fewer sets/rounds), not a shorter or phased-in program. Match difficulty to the less-experienced partner and let the stronger partner load heavier on the same movement.",
      "rest: partner-paced — while one partner works their set, the other rests, so rest is built into the alternation",
      "WEEKLY SPLIT",
      "day 1: full body (squat + push emphasis)",
      "day 2: rest",
      "day 3: full body (hinge + pull emphasis)",
      "day 4: rest",
      "day 5: full body (mixed + heavier conditioning)",
      "SESSION TEMPLATE",
      "warm up",
      "partner dynamic warm up",
      "5-10 min",
      "PHASE 1 — MAIN COMPOUND LIFT (alternate by SET, not by exercise)",
      "primary compound — same exercise and station for both partners; each uses their OWN working load. Partner A does their set, racks, and rests while Partner B does their set at their own weight, then back to A. Continue alternating until both complete all sets.",
      "4x5-6",
      "PHASE 2 — ACCESSORIES / HYPERTROPHY (alternate by SET, individual loads)",
      "secondary compound — same alternating-by-set approach: A works while B rests, B works while A rests, each at their own load",
      "3x8-10",
      "accessory movement — alternate by set, individual loads",
      "3x10-12",
      "PHASE 3 — CONDITIONING / FINISHER (staggered circuit, work SIMULTANEOUSLY)",
      "partner circuit finisher — both partners move through the SAME circuit offset from each other (staggered start), so they work at the same time instead of waiting. Scale reps/rounds to each partner.",
      "10-15 min",
      "core",
      "10 min",
      "PROGRESSION RULE",
      "all three phases are present from week 1 — progress load/volume within each phase, never add or remove phases",
      "week 1: establish each partner's baseline loads and the alternation rhythm",
      "week 2: +1 rep or +5 pounds (each partner independently)",
      "week 3: +1 rep or +5 pounds, tighten rest windows",
      "week 4: repeat or deload",
    ],
  },
  {
    meta: { name: "fat loss - home", goal: "fat loss", duration: "3 months", difficulty: "beginner", equipment: "Home equipment" },
    body: [
      "PROGRAM OVERVIEW",
      "frequency: 4-5 days",
      "session length: 30-45 min",
      "goal: burn fat and preserve muscle using minimal home equipment",
      "equipment note: dumbbells / resistance bands / bodyweight — program only movements these support",
      "rest: 45-60 sec (keep density high)",
      "WEEKLY SPLIT",
      "day 1: full body strength",
      "day 2: conditioning",
      "day 3: full body strength",
      "day 4: rest",
      "day 5: full body + conditioning finisher",
      "SESSION TEMPLATE",
      "warm up",
      "5 min light cardio + mobility",
      "primary compound (dumbbell or bodyweight)",
      "3x8-10",
      "secondary compound (dumbbell or band)",
      "3x10-12",
      "accessory 1",
      "3x12-15",
      "accessory 2",
      "3x12-15",
      "core",
      "10 min",
      "conditioning finisher (bodyweight circuit / intervals)",
      "10-15 min",
      "PROGRESSION RULE",
      "week 1: establish baseline",
      "week 2: +1 rep or shorter rest",
      "week 3: +1 rep or add a round to the finisher",
      "week 4: repeat or deload",
    ],
  },
  {
    meta: { name: "2-day full body", goal: "general fitness", duration: "ongoing", difficulty: "beginner", equipment: "full gym" },
    body: [
      "PROGRAM OVERVIEW",
      "frequency: 2 days",
      "session length: 60 min",
      "goal: full-body strength and conditioning for a busy 2-day-per-week schedule",
      "rest: 90-120 sec on compounds, 60 sec on accessories",
      "WEEKLY SPLIT",
      "day 1: full body A (squat + push emphasis)",
      "day 2: full body B (hinge + pull emphasis)",
      "SESSION TEMPLATE",
      "warm up",
      "primary compound",
      "4x5-6",
      "secondary compound",
      "3x8-10",
      "accessory movement",
      "3x10-12",
      "core",
      "10 min",
      "conditioning finisher",
      "10 min",
      "PROGRESSION RULE",
      "week 1: establish baseline",
      "week 2: +1 rep or +5 pounds",
      "week 3: +1 rep or +5 pounds",
      "week 4: repeat or deload",
    ],
  },
];

async function main() {
  // Resolve the DB's real property names + types, keyed by normalized name.
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const byNorm = {};
  for (const [name, def] of Object.entries(db.properties)) byNorm[normalize(name)] = { name, type: def.type };

  const titleProp = Object.values(db.properties).find((p) => p.type === "title");
  if (!titleProp) throw new Error("No title property found on the program library DB");

  // For update mode: find an existing page by normalized title.
  const findPageByName = async (name) => {
    const target = normalize(name);
    let cursor;
    do {
      const res = await notion.databases.query({ database_id: DB_ID, start_cursor: cursor, page_size: 100 });
      const hit = res.results.find((p) => {
        const tp = Object.values(p.properties).find((x) => x.type === "title");
        return normalize((tp?.title || []).map((r) => r.plain_text).join("")) === target;
      });
      if (hit) return hit;
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return null;
  };

  // Replace all body blocks on a page: archive existing children, append new.
  const replaceBody = async (pageId, blocks) => {
    let cursor;
    do {
      const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
      for (const b of res.results) await notion.blocks.delete({ block_id: b.id });
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    await notion.blocks.children.append({ block_id: pageId, children: blocks });
  };

  for (const t of TEMPLATES) {
    const properties = {};
    properties[titleProp.name] = { title: [{ type: "text", text: { content: t.meta.name } }] };
    for (const key of ["goal", "duration", "difficulty", "equipment"]) {
      const col = byNorm[key];
      if (col && col.type === "select" && t.meta[key]) {
        properties[col.name] = { select: { name: t.meta[key] } };
      }
    }

    // Upsert by name: if a page with this title already exists, update it in
    // place; otherwise create a new one. Keeps re-runs idempotent (no dupes).
    const existing = await findPageByName(t.meta.name);
    if (existing) {
      await notion.pages.update({ page_id: existing.id, properties });
      await replaceBody(existing.id, paragraphs(t.body));
      console.log(`Updated "${t.meta.name}" -> ${existing.id}`);
      continue;
    }

    const page = await notion.pages.create({
      parent: { database_id: DB_ID },
      properties,
      children: paragraphs(t.body),
    });
    console.log(`Created "${t.meta.name.trim()}" -> ${page.id}`);
  }
  console.log("\nDone. Run `npm run inspect:templates` to verify.");
}

main().catch((e) => { console.error("Create failed:", e.body || e.message); process.exit(1); });
