import { DAY_ORDER, PHASE_ORDER, BLOCK_TYPES, EX_TYPES } from "../constants.js";

// Deterministic validation + normalisation of an AI-generated (or coach-edited)
// training plan. Shared by the API (before a draft is saved) and the coach UI
// (before a draft is approved), so malformed output can never silently become
// an active client program.
//
// Plan shape:
//   { program_name, goal?, weeks?, progression_model_used?, days_per_week?,
//     weekly_split: [{ day, focus, exercises: [{ name, sets, reps, rest_seconds?,
//       section?, category?, exercise_type?, block_type?, group_id?, is_bodyweight?, notes? }] }] }
//
// Returns { ok, errors[], warnings[], program }. `program` is the normalised plan
// (canonical day names, ordered by phase, order_index reassigned, defaults filled)
// and is only meaningful when ok === true. Each issue is { path, message }.

export const DEFAULT_REST_BY_SECTION = {
  "Warm-Up": 20, "Activation": 20, "Power/Plyometrics": 90, "Main Compound Lift": 180,
  "Secondary Compound Lift": 120, "Accessories": 75, "Isolation": 60, "Conditioning": 45,
  "Finisher": 45, "Cooldown": 0,
};
const FALLBACK_REST = 75;
const PHASE_ALIASES = { primary: "Main Compound Lift", secondary: "Secondary Compound Lift", accessory: "Accessories", core: "Isolation", warmup: "Warm-Up", "warm up": "Warm-Up", plyometrics: "Power/Plyometrics", power: "Power/Plyometrics", "cool down": "Cooldown", "cool-down": "Cooldown" };
const GROUPED = new Set(["superset", "circuit_for_time", "timed_circuit", "weighted_circuit"]);
const CATEGORIES = ["Powerlifting", "Bodybuilding", "Power", "Conditioning"];
export const MAX_DAYS = 7;
export const MAX_EXERCISES_PER_DAY = 20;

export function normalizeDayName(day) {
  const t = String(day ?? "").trim().toLowerCase();
  return DAY_ORDER.find((d) => d.toLowerCase() === t) || null;
}

export function normalizeSection(section) {
  const raw = String(section ?? "").trim();
  if (!raw) return null;
  const exact = PHASE_ORDER.find((p) => p.toLowerCase() === raw.toLowerCase());
  return exact || PHASE_ALIASES[raw.toLowerCase()] || null;
}

const phaseRank = (section) => { const i = PHASE_ORDER.indexOf(section); return i === -1 ? PHASE_ORDER.indexOf("Accessories") : i; };

// reps is free text ("8", "8-12", "30 sec", "AMRAP", "5/side") — it only has to
// be present and say *something* numeric or an explicit open-ended effort.
export function isValidReps(reps) {
  const s = String(reps ?? "").trim();
  if (!s || s.length > 40) return false;
  return /\d/.test(s) || /^(amrap|max|failure|to failure|fail)\b/i.test(s);
}

export function validateTrainingPlan(raw) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    err("", "Program must be a JSON object.");
    return { ok: false, errors, warnings, program: null };
  }
  if (typeof raw.program_name !== "string" || !raw.program_name.trim()) err("program_name", "Missing program name.");
  let weeks = raw.weeks;
  if (weeks == null || weeks === "") { weeks = 12; warn("weeks", "No program length given — defaulted to 12 weeks."); }
  else if (!Number.isInteger(Number(weeks)) || Number(weeks) < 1 || Number(weeks) > 52) { err("weeks", `Invalid program length "${raw.weeks}".`); }
  if (!Array.isArray(raw.weekly_split) || !raw.weekly_split.length) {
    err("weekly_split", "Program has no training days.");
    return { ok: false, errors, warnings, program: null };
  }
  if (raw.weekly_split.length > MAX_DAYS) err("weekly_split", `Program has ${raw.weekly_split.length} training days (max ${MAX_DAYS}).`);

  const seenDays = new Set();
  const days = [];
  raw.weekly_split.forEach((d, di) => {
    const dp = `weekly_split[${di}]`;
    if (d == null || typeof d !== "object") { err(dp, "Training day is not an object."); return; }
    const day = normalizeDayName(d.day);
    if (!day) { err(`${dp}.day`, `Unrecognised day "${d.day}" (expected Monday–Sunday).`); return; }
    if (seenDays.has(day)) { err(`${dp}.day`, `${day} appears more than once.`); return; }
    seenDays.add(day);
    const focus = typeof d.focus === "string" ? d.focus.trim() : "";
    if (!focus) warn(`${dp}.focus`, `${day} has no focus label.`);
    if (!Array.isArray(d.exercises) || !d.exercises.length) { err(`${dp}.exercises`, `${day} has no exercises.`); return; }
    if (d.exercises.length > MAX_EXERCISES_PER_DAY) err(`${dp}.exercises`, `${day} has ${d.exercises.length} exercises (max ${MAX_EXERCISES_PER_DAY}).`);

    const exercises = [];
    d.exercises.forEach((ex, ei) => {
      const ep = `${dp}.exercises[${ei}]`;
      const label = ex && typeof ex.name === "string" && ex.name.trim() ? `${day}: ${ex.name.trim()}` : `${day} exercise ${ei + 1}`;
      if (ex == null || typeof ex !== "object") { err(ep, `${label} is not an object.`); return; }
      const name = typeof ex.name === "string" ? ex.name.trim() : "";
      if (!name) { err(`${ep}.name`, `${label}: missing name.`); return; }
      if (name.length > 120) err(`${ep}.name`, `${label}: name too long.`);

      const sets = Number(ex.sets);
      if (ex.sets == null || ex.sets === "" || !Number.isInteger(sets) || sets < 1 || sets > 12) err(`${ep}.sets`, `${label}: sets must be a whole number from 1 to 12 (got "${ex.sets ?? ""}").`);
      if (!isValidReps(ex.reps)) err(`${ep}.reps`, `${label}: missing or unreadable reps (got "${ex.reps ?? ""}").`);

      let section = null;
      if (ex.section != null && String(ex.section).trim()) {
        section = normalizeSection(ex.section);
        if (!section) warn(`${ep}.section`, `${label}: unknown phase "${ex.section}" — left unset.`);
      } else warn(`${ep}.section`, `${label}: no phase set.`);

      let rest = null;
      if (ex.rest_seconds != null && ex.rest_seconds !== "") {
        rest = Number(ex.rest_seconds);
        if (!Number.isFinite(rest) || !Number.isInteger(rest) || rest < 0 || rest > 600) { err(`${ep}.rest_seconds`, `${label}: rest must be 0–600 seconds (got "${ex.rest_seconds}").`); rest = null; }
      } else {
        rest = DEFAULT_REST_BY_SECTION[section] ?? FALLBACK_REST;
        warn(`${ep}.rest_seconds`, `${label}: no rest period given — defaulted to ${rest}s.`);
      }

      let block_type = ex.block_type || "straight_set";
      if (!BLOCK_TYPES.includes(block_type)) { warn(`${ep}.block_type`, `${label}: unknown block type "${block_type}" — treated as straight set.`); block_type = "straight_set"; }
      const exercise_type = EX_TYPES.includes(ex.exercise_type) ? ex.exercise_type : null;
      const category = CATEGORIES.includes(ex.category) ? ex.category : (ex.category ? String(ex.category) : null);

      exercises.push({
        name, category, section, exercise_type, block_type,
        group_id: ex.group_id != null && String(ex.group_id).trim() ? String(ex.group_id).trim() : null,
        sets: Number.isInteger(sets) ? sets : null,
        reps: String(ex.reps ?? "").trim(),
        rest_seconds: rest,
        is_bodyweight: !!ex.is_bodyweight,
        notes: typeof ex.notes === "string" && ex.notes.trim() ? ex.notes.trim() : null,
      });
    });

    // Superset/circuit coherence: a grouped block needs a shared group_id and at
    // least two members; a lone "superset" is demoted rather than rejected.
    const byGroup = new Map();
    exercises.forEach((e) => { if (GROUPED.has(e.block_type) && e.group_id) (byGroup.get(e.group_id) || byGroup.set(e.group_id, []).get(e.group_id)).push(e); });
    exercises.forEach((e) => {
      if (!GROUPED.has(e.block_type)) return;
      const members = e.group_id ? byGroup.get(e.group_id) : null;
      if (!members || members.length < 2) {
        warn(`${dp}.exercises`, `${day}: ${e.name} is marked ${e.block_type} but has no partner — treated as a straight set.`);
        e.block_type = "straight_set";
        e.group_id = null;
      }
    });

    // Order by workout phase (stable within phase), then give every exercise a
    // sequential order_index and a group_id (own position for straight sets).
    const ordered = exercises.map((e, i) => ({ e, i })).sort((a, b) => phaseRank(a.e.section) - phaseRank(b.e.section) || a.i - b.i).map((x) => x.e);
    const seenNames = new Set();
    ordered.forEach((e, i) => {
      e.order_index = i;
      if (e.block_type === "straight_set") e.group_id = String(i);
      const key = e.name.toLowerCase();
      if (seenNames.has(key)) warn(`${dp}.exercises`, `${day}: "${e.name}" appears more than once.`);
      seenNames.add(key);
    });
    days.push({ day, focus: focus || null, exercises: ordered });
  });

  if (errors.length) return { ok: false, errors, warnings, program: null };

  days.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  return {
    ok: true, errors, warnings,
    program: {
      program_name: raw.program_name.trim(),
      goal: typeof raw.goal === "string" ? raw.goal : null,
      weeks: Number(weeks),
      days_per_week: days.length,
      progression_model_used: typeof raw.progression_model_used === "string" ? raw.progression_model_used : null,
      weekly_split: days,
    },
  };
}

// One-line human summary of a failed validation (for API error messages / UI).
export function summarizeIssues(issues, max = 5) {
  const msgs = issues.slice(0, max).map((i) => i.message);
  return msgs.join(" ") + (issues.length > max ? ` (+${issues.length - max} more)` : "");
}

// ── Programming-quality review (advisory) ───────────────────────────────────
// Deterministic checks the schema validator can't make. These are WARNINGS for
// the coach — they never block a draft from being saved.
const PATTERNS = {
  squat: /squat|leg press|lunge|split squat|step[- ]?up|hack/i,
  hinge: /deadlift|rdl|romanian|hip thrust|good morning|glute bridge|swing|hip hinge/i,
  push: /bench|press|push[- ]?up|dip|fly|flye/i,
  pull: /row|pull[- ]?up|chin[- ]?up|pulldown|pull[- ]down|face pull|curl/i,
};
const WORKING = new Set(["Main Compound Lift", "Secondary Compound Lift", "Power/Plyometrics", "Accessories", "Isolation", "Conditioning", "Finisher"]);

export function reviewProgramQuality(program, { days_available, template_days } = {}) {
  const out = [];
  const days = program?.weekly_split || [];
  const expected = Number(template_days) || Number(days_available);
  if (expected >= 1 && expected <= 7 && days.length !== expected) {
    out.push({ path: "weekly_split", message: `Program has ${days.length} training day(s) but ${template_days ? "the template defines" : "the client asked for"} ${expected}.` });
  }
  const seen = new Set();
  days.forEach((d) => {
    const working = d.exercises.filter((e) => WORKING.has(e.section) || e.section == null);
    const sets = working.reduce((t, e) => t + (e.sets || 0), 0);
    if (!d.exercises.some((e) => e.section === "Main Compound Lift" || e.section === "Secondary Compound Lift" || e.exercise_type === "Compound")) {
      out.push({ path: d.day, message: `${d.day} has no compound lift.` });
    }
    if (sets > 32) out.push({ path: d.day, message: `${d.day} has ${sets} working sets — very high for one session.` });
    else if (sets < 6) out.push({ path: d.day, message: `${d.day} has only ${sets} working sets.` });
    d.exercises.forEach((e) => Object.entries(PATTERNS).forEach(([k, re]) => { if (re.test(e.name)) seen.add(k); }));
  });
  if (days.length >= 3) {
    const missing = Object.keys(PATTERNS).filter((k) => !seen.has(k));
    if (missing.length) out.push({ path: "weekly_split", message: `Week has no ${missing.join(" / ")} movement pattern.` });
  }
  // Consecutive training days both loading the same main-lift pattern.
  const order = days.map((d) => d.day);
  const dayIdx = (n) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(n);
  for (let i = 0; i + 1 < days.length; i++) {
    if (dayIdx(order[i + 1]) - dayIdx(order[i]) !== 1) continue;
    const mains = (d) => d.exercises.filter((e) => e.section === "Main Compound Lift").map((e) => e.name.toLowerCase());
    const shared = mains(days[i]).filter((n) => mains(days[i + 1]).includes(n));
    if (shared.length) out.push({ path: order[i + 1], message: `${shared[0]} is a main lift on consecutive days (${order[i]}, ${order[i + 1]}) — recovery.` });
  }
  return out;
}
