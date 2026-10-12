import { resolveIncrement } from "./engine.js";

// Conjugate (Westside) — deterministic. Two roles, set per exercise:
//   max_effort     work up to a heavy 1-3 rep top set on a rotating variation
//   dynamic_effort submaximal speed work on a 3-week WAVE of percentages of the 1RM
//
// SOURCES (primary: Westside Barbell's own articles, fetched and read for this build):
//  * "Starting Conjugate: Dynamic Effort" — lower wave 12x2 / 10x2 / 8x2 (or 5x5) at 75/80/85% TOTAL
//    = 50/55/60% bar + 25% accommodating resistance (bands/chains); percentages come from the most
//    recent squat or bench 1RM; upper wave 9x3 at 50/55/60% with minibands; waves run 3 weeks; bar
//    weight should be near exact, band tension as close to 25% as possible.
//  * "Alternative Dynamic Effort Training Waves" — deadlift 6x2 / 5x2 / 4x2 ("similar intensity
//    parameters", weekly percentages NOT published); volume squat wave 5x5@70, 5x5@75, 10x2@80; repeated-
//    effort upper wave 5x5 at 75/80/85, reduce by 5% without accommodating resistance; "ascend in
//    intensity while descending in volume, restarting as the next three-week wave begins".
//  * "Training Methods Part 2: Max Effort Day" — "we max out each week" by switching exercises each week;
//    training at 90%+ for more than 3 weeks risks central-nervous-system fatigue; a strength type not
//    trained for 3 weeks can lose 10%+; no formal criterion for a PR ("it's all you're capable of on
//    that day"; lifters not near a meet won't PR). Other published programs rotate every 1-3 weeks and
//    use 1-3 reps — so rotationWeeks and repRange are the coach's settings.
//  NOT PUBLISHED (so never invented): deadlift weekly percentages, rest periods, a numeric stall rule.
//  Where one is needed the coach supplies it, or the result says what is missing.
export const CONJUGATE_SOURCES = [
  "Westside Barbell — Starting Conjugate: Dynamic Effort (westside-barbell.com)",
  "Westside Barbell — Alternative Dynamic Effort Training Waves (westside-barbell.com)",
  "Westside Barbell — Training Methods Part 2: Max Effort Day (westside-barbell.com)",
];

export const DE_WAVES = {
  westside_lower: { label: "Westside lower (squat)", weeks: [{ sets: 12, reps: 2, total: 75 }, { sets: 10, reps: 2, total: 80 }, { sets: 8, reps: 2, total: 85 }], accommodation: 25, note: "5x5 at the same percentages is the published alternative. Total % = bar + accommodating resistance." },
  westside_upper_miniband: { label: "Westside upper (bench), minibands", weeks: [{ sets: 9, reps: 3, total: 50 }, { sets: 9, reps: 3, total: 55 }, { sets: 9, reps: 3, total: 60 }], accommodation: 0, note: "Published with minibands; miniband tension isn't quantified, so the % is the bar load." },
  repeated_effort_upper: { label: "Repeated-effort upper (bench)", weeks: [{ sets: 5, reps: 5, total: 75 }, { sets: 5, reps: 5, total: 80 }, { sets: 5, reps: 5, total: 85 }], accommodation: 0, withoutAccommodationReduction: 5, needsAccommodationAnswer: true, note: "Without accommodating resistance Westside recommends reducing the percentages by 5." },
  volume_squat: { label: "Volume squat wave", weeks: [{ sets: 5, reps: 5, total: 70 }, { sets: 5, reps: 5, total: 75 }, { sets: 10, reps: 2, total: 80 }], accommodation: 0, note: "Intensity may drop 5-10% per week depending on the athlete." },
  deadlift: { label: "Dynamic-effort deadlift", weeks: [{ sets: 6, reps: 2 }, { sets: 5, reps: 2 }, { sets: 4, reps: 2 }], accommodation: 0, needsCustomPercents: true, note: "Sets x reps are published; the weekly percentages are NOT. Supply them in customPercents." },
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const DAY = 86400000;
const parseDay = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const roundTo = (x, inc) => Math.round(x / inc) * inc;

const out = (status, extra = {}) => ({ methodId: "conjugate", status, recommendedLoad: null, reasons: [], missing: [], calc: {}, ...extra });

// Whole weeks from `start` to `today` (negative before the start date).
export function weeksSince(start, today) {
  const s = parseDay(start), t = typeof today === "string" ? parseDay(today) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!s || !t) return null;
  return Math.floor((t - s) / (7 * DAY));
}

// ---- Dynamic effort: the prescription for this week of the wave ------------------------
export function dynamicEffortPrescription({ config, oneRepMax, today = new Date() }) {
  const calc = { config, oneRepMax, role: "dynamic_effort" };
  const wave = config.wave === "custom" ? { label: "Custom wave", weeks: config.customWave, accommodation: config.accommodationPct ?? 0 } : DE_WAVES[config.wave];
  if (!wave) return out("invalid", { reasons: [`wave must be one of ${Object.keys(DE_WAVES).join(", ")} or custom.`], calc });
  if (!isNum(oneRepMax) || oneRepMax <= 0) return out("insufficient_data", { missing: ["A current 1RM for this lift — the published percentages are of the most recent 1RM (squat or bench). Enter it when you calculate."], reasons: ["No usable 1RM."], calc });
  const inc = resolveIncrement(config);
  if (inc === null) return out("invalid", { reasons: ["No valid loadable increment is configured (set an increment or equipment)."], calc });
  if (!config.waveStartDate || !parseDay(config.waveStartDate)) return out("insufficient_data", { missing: ["The wave start date (the Monday of week 1) so the app knows which week of the wave this is."], reasons: ["Wave start date not set."], calc });

  let weeks = wave.weeks;
  if (wave.needsCustomPercents || config.wave === "custom") {
    const cp = config.wave === "custom" ? config.customWave : config.customPercents;
    if (!Array.isArray(cp) || cp.length < 1 || cp.length > 6) return out("insufficient_data", { missing: [config.wave === "deadlift" ? "Westside publishes 6x2 / 5x2 / 4x2 for deadlift but not the weekly percentages; enter them in customPercents (one number per week, e.g. [70, 75, 80])." : "A custom wave needs 1 to 6 weeks of {sets, reps, totalPct}."], reasons: ["The wave's percentages aren't defined."], calc });
    if (config.wave === "custom") {
      if (cp.some((w) => !Number.isInteger(w?.sets) || w.sets < 1 || !Number.isInteger(w?.reps) || w.reps < 1 || !isNum(w?.totalPct) || w.totalPct <= 0 || w.totalPct > 100)) return out("invalid", { reasons: ["Each custom week needs whole sets and reps and a totalPct above 0 and at most 100."], calc });
      weeks = cp.map((w) => ({ sets: w.sets, reps: w.reps, total: w.totalPct }));
    } else {
      if (cp.length !== weeks.length || cp.some((p) => !isNum(p) || p <= 0 || p > 100)) return out("invalid", { reasons: [`customPercents must be ${weeks.length} numbers above 0 and at most 100.`], calc });
      weeks = weeks.map((w, i) => ({ ...w, total: cp[i] }));
    }
  }
  if (wave.needsAccommodationAnswer && typeof config.accommodatingResistance !== "boolean") return out("insufficient_data", { missing: ["Whether this lifter uses accommodating resistance (bands/chains): Westside says to reduce the percentages by 5 without it. Set accommodatingResistance to true or false."], reasons: ["Accommodating resistance not specified."], calc });

  const ws = weeksSince(config.waveStartDate, today);
  if (ws < 0) return out("insufficient_data", { missing: [`The wave starts ${config.waveStartDate}.`], reasons: ["The wave hasn't started yet."], calc: { ...calc, weeksSince: ws } });
  const idx = ws % weeks.length, waveNo = Math.floor(ws / weeks.length) + 1;
  const w = weeks[idx];
  const accommodation = config.accommodationPct != null ? config.accommodationPct : wave.accommodation;
  if (!isNum(accommodation) || accommodation < 0 || accommodation >= w.total) return out("invalid", { reasons: ["accommodationPct must be zero or more and less than the week's total percentage."], calc });
  let total = w.total;
  const reasons = [];
  if (wave.needsAccommodationAnswer && config.accommodatingResistance === false) { total -= wave.withoutAccommodationReduction; reasons.push(`No accommodating resistance: percentages reduced by ${wave.withoutAccommodationReduction} (Westside's rule for this wave).`); }
  const barPct = total - accommodation;
  const load = roundTo((barPct * oneRepMax) / 100, inc);
  const bandLoad = accommodation > 0 ? roundTo((accommodation * oneRepMax) / 100, inc) : 0;
  if (config.wave === "westside_lower" && accommodation === 0) reasons.push("The published lower wave assumes ~25% accommodating resistance; using barbell-only loads at these percentages is not part of the published wave — your call.");
  reasons.unshift(`${wave.label}, week ${idx + 1} of ${weeks.length} (wave ${waveNo}): ${w.sets} x ${w.reps} at ${total}% total of ${oneRepMax} = ${barPct}% bar${accommodation ? ` + ${accommodation}% accommodating resistance` : ""}. Bar load ${load}${bandLoad ? `, band/chain tension about ${bandLoad} at the top` : ""}, rounded to ${inc}.`);
  if (config.restSec != null) reasons.push(`Rest: ${config.restSec}s (your setting — Westside's articles don't prescribe a rest period).`);
  reasons.push("Bar speed matters more than the number: if the bar is too slow, lower the band tension and add that weight to the bar (Westside's guidance).");
  if (idx === weeks.length - 1) reasons.push("Last week of the wave: the next wave restarts the cycle — update the 1RM first.");
  return out("prescription", { recommendedLoad: load, reasons, calc: { ...calc, sets: w.sets, reps: w.reps, totalPct: total, barPct, accommodationPct: accommodation, bandLoad, waveWeek: idx + 1, waveNumber: waveNo, increment: inc } });
}

// ---- Max effort: rotation + this session vs the variation's own best --------------------
// rows: this exercise's logs; siblingRows: logs of every max_effort exercise for the same lift,
// each { exercise, date, sets, reps, weight, set_type }.
export function maxEffortReview({ config, rows = [], siblingRows = [], oneRepMax, today = new Date(), exerciseName }) {
  const calc = { config, role: "max_effort", nonLoad: true };
  const [rLo, rHi] = config.repRange || [1, 3];
  if (!Number.isInteger(rLo) || !Number.isInteger(rHi) || rLo < 1 || rHi < rLo) return out("invalid", { reasons: ["repRange must be whole numbers with min <= max (default 1-3)."], calc });
  const rot = config.rotationWeeks ?? 1;
  if (!Number.isInteger(rot) || rot < 1 || rot > 6) return out("invalid", { reasons: ["rotationWeeks must be a whole number from 1 to 6 (Westside rotates weekly; other published programs use 1-3)."], calc });
  const variations = Array.isArray(config.variations) ? config.variations.filter((v) => String(v).trim()) : [];

  const top = (rs) => {
    const by = new Map();
    rs.filter((r) => (r.set_type || "working") === "working" && r.date).forEach((r) => {
      const reps = toNum(r.reps), load = toNum(r.weight ?? r.load);
      if (reps === null || load === null || !Number.isInteger(reps) || load <= 0 || reps < rLo || reps > rHi) return;
      by.set(r.date, Math.max(by.get(r.date) ?? 0, load));
    });
    return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, load]) => ({ date, load }));
  };
  const mine = top(rows);
  if (!mine.length) return out("insufficient_data", { missing: [`No working set of ${rLo}-${rHi} rep${rHi > 1 ? "s" : ""} logged for this exercise.`], reasons: ["Nothing to evaluate."], calc });
  const cur = mine[mine.length - 1], prior = mine.slice(0, -1);
  const prevBest = prior.length ? Math.max(...prior.map((s) => s.load)) : null;
  const reasons = [];
  let status, verdict;
  if (prevBest === null) { status = "hold"; verdict = "baseline"; reasons.push(`First ${rLo}-${rHi} rep top set on this variation: ${cur.load} on ${cur.date} is recorded as its baseline.`); }
  else if (cur.load > prevBest) { status = "progress"; verdict = "new_best"; reasons.push(`New best on this variation: ${cur.load} vs ${prevBest} before (${cur.date}).`); }
  else if (cur.load === prevBest) { status = "hold"; verdict = "matched"; reasons.push(`Matched this variation's best (${prevBest}).`); }
  else { status = "hold"; verdict = "below"; reasons.push(`${cur.load} is below this variation's best of ${prevBest}. That is not a failure: Westside's view is that the max effort day is what you can do that day, and lifters away from a meet won't PR every time.`); }

  // Which variation is scheduled, and what's next.
  let scheduled = null, next = null, weekInRotation = null;
  if (variations.length && config.rotationStartDate && parseDay(config.rotationStartDate)) {
    const ws = weeksSince(config.rotationStartDate, today);
    if (ws >= 0) {
      const slot = Math.floor(ws / rot);
      scheduled = variations[slot % variations.length]; next = variations[(slot + 1) % variations.length]; weekInRotation = (ws % rot) + 1;
      reasons.push(`Rotation (every ${rot} week${rot > 1 ? "s" : ""}): this week's variation is ${scheduled} (week ${weekInRotation} of ${rot}); next is ${next}.`);
      if (exerciseName && scheduled && exerciseName.trim().toLowerCase() !== scheduled.trim().toLowerCase()) reasons.push(`This exercise (${exerciseName}) isn't the scheduled variation (${scheduled}).`);
    }
  } else if (variations.length) reasons.push("Add a rotation start date to see which variation is scheduled this week.");
  if (variations.length && variations.length * rot > 3) reasons.push(`Your rotation takes ${variations.length * rot} weeks to come back to a variation. Westside cautions that a strength type left untrained for 3 weeks can lose 10%+.`);

  // CNS-fatigue watch: consecutive recent weeks with a top set at/above the high-intensity line.
  let coachReviewFlag = false;
  const highPct = config.highIntensityPct ?? 90, maxWeeks = config.maxWeeksAtHighIntensity ?? 3;
  if (isNum(oneRepMax) && oneRepMax > 0) {
    const weekly = new Map();
    top(siblingRows.length ? siblingRows : rows).forEach((s) => {
      const d = parseDay(s.date); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = dayStr(mon); weekly.set(k, Math.max(weekly.get(k) ?? 0, s.load));
    });
    const weeks = [...weekly.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let run = 0; for (let i = weeks.length - 1; i >= 0; i--) { if ((weeks[i][1] / oneRepMax) * 100 >= highPct) run++; else break; }
    calc.weeksAtHighIntensity = run;
    if (run > maxWeeks) { coachReviewFlag = true; reasons.push(`Flagged: ${run} weeks in a row with a top set at ${highPct}%+ of ${oneRepMax}. Westside warns that more than ${maxWeeks} weeks at 90%+ risks central-nervous-system fatigue.`); }
  } else reasons.push("Enter the lift's 1RM to check how many weeks in a row you've been at 90%+.");

  return out(status, {
    coachReviewFlag, proposedAdjustment: null,
    reasons,
    calc: { ...calc, verdict, current: cur, previousBest: prevBest, scheduledVariation: scheduled, nextVariation: next, weekInRotation },
  });
}

// ---- entry point -------------------------------------------------------------------------
export function evaluateConjugate(input) {
  const { config = {}, oneRepMax } = input;
  if (config.role === "dynamic_effort") return dynamicEffortPrescription({ config, oneRepMax, today: input.today || new Date() });
  if (config.role === "max_effort") return maxEffortReview({ config, rows: input.rows || [], siblingRows: input.siblingRows || [], oneRepMax, today: input.today || new Date(), exerciseName: input.exerciseName });
  return out("invalid", { reasons: ["Set this exercise's conjugate role: max_effort or dynamic_effort."], calc: { config } });
}
