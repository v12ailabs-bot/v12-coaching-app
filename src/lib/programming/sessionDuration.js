import { PHASE_ORDER } from "../constants.js";
import { DEFAULT_REST_BY_SECTION, normalizeSection } from "./validateProgram.js";

// Deterministic session-duration model. The AI is never trusted to hit a time
// budget on its own: sets × reps × rest × transitions are summed here, split into
// independent preparation / coach-supervised training / independent finishing.

// How the client is actually being coached decides the standard options — not
// simply "online" vs "in person".
export const ARRANGEMENTS = {
  in_person: { label: "In-person (scheduled appointment)", options: [45, 60, 75] },
  video_call: { label: "Scheduled video call", options: [45, 60, 75] },
  independent_online: { label: "Independent online coaching", options: [45, 60, 75, 90, 120, 180] },
};
export const CUSTOM_MIN = 15;
export const CUSTOM_MAX = 240;

export function durationOptionsFor(arrangement) {
  return (ARRANGEMENTS[arrangement] || ARRANGEMENTS.independent_online).options;
}

export function isValidSessionMinutes(minutes, arrangement) {
  const m = Number(minutes);
  if (!Number.isInteger(m)) return false;
  // Scheduled appointments use the fixed slot lengths; independent clients can
  // also use any custom length.
  if (arrangement === "in_person" || arrangement === "video_call") return durationOptionsFor(arrangement).includes(m);
  return m >= CUSTOM_MIN && m <= CUSTOM_MAX;
}

// config: { arrangement, session_minutes, prep: "independent"|"coached",
//           finish: "independent"|"coached", finisher_independent?: boolean }
export const DEFAULT_SESSION_CONFIG = { arrangement: "independent_online", session_minutes: 60, prep: "independent", finish: "independent", finisher_independent: false };

export function normalizeSessionConfig(cfg) {
  const c = { ...DEFAULT_SESSION_CONFIG, ...(cfg || {}) };
  if (!ARRANGEMENTS[c.arrangement]) c.arrangement = DEFAULT_SESSION_CONFIG.arrangement;
  c.session_minutes = Number(c.session_minutes);
  if (!isValidSessionMinutes(c.session_minutes, c.arrangement)) c.session_minutes = DEFAULT_SESSION_CONFIG.session_minutes;
  c.prep = c.prep === "coached" ? "coached" : "independent";
  c.finish = c.finish === "coached" ? "coached" : "independent";
  c.finisher_independent = !!c.finisher_independent;
  return c;
}

const PREP = new Set(["Warm-Up", "Activation"]);
const SEC_PER_REP = 3;       // controlled tempo, incl. a breath between reps
const SET_OVERHEAD_SEC = 12; // un-racking, settling in
const TRANSITION_SEC = 45;   // moving to / setting up the next exercise or block
const GROUPED = new Set(["superset", "circuit_for_time", "timed_circuit", "weighted_circuit"]);

// Seconds of work in one set. "8" / "8-12" / "30 sec" / "1 min" / "AMRAP" / "5/side".
export function setWorkSeconds(reps) {
  const s = String(reps ?? "").toLowerCase();
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const timed = /(\d+(?:\.\d+)?)\s*(sec|s\b|second|min|minute)/.exec(s);
  if (timed) {
    const v = Number(timed[1]) * (/^min/.test(timed[2]) ? 60 : 1);
    return Math.min(600, v) + SET_OVERHEAD_SEC;
  }
  if (!nums.length) return 40 + SET_OVERHEAD_SEC; // AMRAP / to failure
  let n = nums.length >= 2 && /[-–]/.test(s) ? (nums[0] + nums[1]) / 2 : nums[0];
  if (/side|leg|arm|each|ea\b/.test(s)) n *= 2;
  return Math.min(100, n) * SEC_PER_REP + SET_OVERHEAD_SEC;
}

const restOf = (ex) => (Number.isFinite(Number(ex.rest_seconds)) && ex.rest_seconds !== null && ex.rest_seconds !== "")
  ? Number(ex.rest_seconds)
  : (DEFAULT_REST_BY_SECTION[normalizeSection(ex.section)] ?? 75);

// Seconds for one block: a straight-set exercise, or every member of a
// superset/circuit performed together (rest taken once per round).
function blockSeconds(members) {
  const grouped = members.length > 1 && GROUPED.has(members[0].block_type);
  if (!grouped) {
    return members.reduce((t, ex) => {
      const sets = Math.max(1, Number(ex.sets) || 1);
      return t + sets * setWorkSeconds(ex.reps) + (sets - 1) * restOf(ex) + TRANSITION_SEC;
    }, 0);
  }
  const rounds = Math.max(...members.map((m) => Math.max(1, Number(m.sets) || 1)));
  const roundWork = members.reduce((t, m) => t + setWorkSeconds(m.reps), 0);
  const rest = members[0].block_type === "circuit_for_time" ? 0 : Math.max(...members.map(restOf));
  return rounds * roundWork + (rounds - 1) * rest + TRANSITION_SEC;
}

// Collapse a day's exercise list into blocks, preserving order.
function toBlocks(exercises) {
  const blocks = [];
  const byGroup = new Map();
  exercises.forEach((ex) => {
    if (GROUPED.has(ex.block_type) && ex.group_id != null) {
      const key = String(ex.group_id);
      if (byGroup.has(key)) { byGroup.get(key).push(ex); return; }
      const m = [ex]; byGroup.set(key, m); blocks.push(m);
    } else blocks.push([ex]);
  });
  return blocks;
}

function segmentOf(ex, cfg) {
  const sec = normalizeSection(ex.section);
  if (PREP.has(sec)) return cfg.prep === "coached" ? "coached" : "prep";
  if (sec === "Cooldown") return cfg.finish === "coached" ? "coached" : "finish";
  if (sec === "Finisher" && cfg.finisher_independent) return "finish";
  return "coached";
}

// Estimate one day's session. Minutes are rounded to whole numbers.
// `coached` is what counts against the appointment / session budget;
// `prep` and `finish` are the independent portions around it.
export function estimateDay(exercises, config) {
  const cfg = normalizeSessionConfig(config);
  const secs = { prep: 0, coached: 0, finish: 0 };
  toBlocks(exercises || []).forEach((members) => {
    // A block is attributed to the segment of its first member.
    secs[segmentOf(members[0], cfg)] += blockSeconds(members);
  });
  const mins = (s) => Math.round(s / 60);
  const prep = mins(secs.prep), coached = mins(secs.coached), finish = mins(secs.finish);
  return {
    prep, coached, finish,
    total: prep + coached + finish,
    budget: cfg.session_minutes,
    overBy: Math.max(0, coached - cfg.session_minutes),
    fits: coached <= cfg.session_minutes,
  };
}

export function estimateProgram(program, config) {
  return (program?.weekly_split || []).map((d) => ({ day: d.day, ...estimateDay(d.exercises, config) }));
}

// ── Shortened workouts ────────────────────────────────────────────────────
// For a client with less time than scheduled. Keeps the main training stimulus:
//   1 primary lift → 2 secondary / power → 3 essential accessory → 4 the rest.
// Reduces volume of the lowest tier first, then drops whole low-priority blocks.
// Rest periods are deliberately never touched (rest drives the stimulus on the
// big lifts), and the primary lift is never removed.
export function priorityTier(ex) {
  const sec = normalizeSection(ex.section);
  if (sec === "Main Compound Lift") return 1;
  if (sec === "Secondary Compound Lift" || sec === "Power/Plyometrics") return 2;
  if (sec === "Accessories") return 3;
  if (sec === "Isolation" || sec === "Conditioning" || sec === "Finisher") return 4;
  return 0; // warm-up / activation / cooldown: not part of the coached stimulus
}

const MIN_SETS = { 4: 2, 3: 2, 2: 3, 1: 3 };

// exercises: one day's list (any order). Returns the kept list (original order),
// what was removed / reduced, and the before/after coached minutes.
export function shortenDay(exercises, targetMinutes, config) {
  const cfg = normalizeSessionConfig({ ...config, session_minutes: targetMinutes, arrangement: "independent_online" });
  const work = (exercises || []).map((e) => ({ ...e }));
  const before = estimateDay(work, cfg).coached;
  const removed = [];
  const reduced = [];
  const coachedMin = () => estimateDay(work, cfg).coached;

  const reduceTier = (tier) => {
    for (let guard = 0; guard < 200 && coachedMin() > targetMinutes; guard++) {
      // trim the last (lowest-ranked) exercise in the tier that still has spare sets
      const cand = work.filter((e) => priorityTier(e) === tier && (Number(e.sets) || 0) > MIN_SETS[tier]).pop();
      if (!cand) return;
      // grouped partners drop a set together so a superset stays balanced
      const partners = GROUPED.has(cand.block_type) ? work.filter((e) => e.group_id === cand.group_id && GROUPED.has(e.block_type)) : [cand];
      partners.forEach((p) => {
        const from = Number(p.sets);
        p.sets = Math.max(MIN_SETS[tier] || 1, from - 1);
        const prev = reduced.find((r) => r.name === p.name);
        if (prev) prev.to = p.sets; else reduced.push({ name: p.name, from, to: p.sets });
      });
    }
  };
  const dropTier = (tier, keepFirst) => {
    for (let guard = 0; guard < 50 && coachedMin() > targetMinutes; guard++) {
      const inTier = work.filter((e) => priorityTier(e) === tier);
      const cand = inTier.slice(keepFirst ? 1 : 0).pop();
      if (!cand) return;
      const drop = GROUPED.has(cand.block_type) ? work.filter((e) => e.group_id === cand.group_id && GROUPED.has(e.block_type)) : [cand];
      drop.forEach((d) => { work.splice(work.indexOf(d), 1); removed.push(d.name); });
    }
  };

  reduceTier(4); reduceTier(3);
  dropTier(4, false);
  dropTier(3, true);   // keep the first (essential) accessory
  reduceTier(2);
  dropTier(3, false);
  dropTier(2, false);  // secondary lifts go before the primary is ever trimmed
  reduceTier(1);

  const after = estimateDay(work, cfg);
  return { exercises: work, removed, reduced, before, after: after.coached, fits: after.coached <= targetMinutes };
}
