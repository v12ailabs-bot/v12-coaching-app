import { resolveIncrement } from "./engine.js";

// APRE (Autoregulatory Progressive Resistance Exercise) 3 / 6 / 10, after
// Bryan Mann's protocol (itself derived from Knight's DAPRE; Siff &
// Verkhoshansky, Supertraining, 6th ed. p.259). Pure and deterministic.
//
// VERIFICATION (done by cross-checking published tables, not from memory):
//  * Set structure — identical in every source consulted (Mann/Training &
//    Conditioning, evolutionsportspt.com, allaboutpowerlifting.com, deaddy.net):
//      Set 1: x reps @ 50% nRM, Set 2: y reps @ 75% nRM, Set 3: max reps @ 100%
//      nRM, Set 4: max reps @ an ADJUSTED load decided by Set 3's reps.
//  * Adjustment bands (lb). The sources do not all agree to the pound (some
//    publish kg, some differ in the open-ended top bands). Each band below is
//    the range that is consistent with EVERY source that states it (kg x2 ~ lb),
//    i.e. the overlap, not any one author's wider range. Where no source states
//    a band (APRE 10 under 4 reps; APRE 3 at 0 reps) there is NO row and the
//    engine returns no number rather than extrapolating.
//  * Next session: the sources state the adjusted Set-4 load becomes the next
//    session's nRM load ("the next week the athlete's first max out set would
//    be the fourth set from the week prior"). No separate Set-4-reps table was
//    found in any accessible source, so none is implemented. The author's
//    optional "stop at ~1 RIR" modification is not implemented.
//  * Loads are in LB (the app's unit). Ranges are [min, max] signed changes.
export const APRE_SOURCES = [
  "Mann, B. APRE protocol — Training & Conditioning, 'Understanding APRE' (2017)",
  "Evolution Sports PT — Autoregulatory Progressive Resistance Exercise (lb tables)",
  "All About Powerlifting — The APRE Protocols: Programs for All Seasons (3RM, lb)",
  "deaddy.net — APRE tables (kg), citing Siff & Verkhoshansky, Supertraining",
];

export const APRE_VARIANTS = {
  3: {
    rm: 3, sets: [{ n: 1, reps: 6, pct: 50 }, { n: 2, reps: 3, pct: 75 }, { n: 3, reps: "max", pct: 100 }, { n: 4, reps: "max", pct: "adjusted" }],
    bands: [
      { min: 1, max: 2, change: [-10, -5] },
      { min: 3, max: 4, change: [0, 0] },
      { min: 5, max: 6, change: [5, 10] },
      { min: 7, max: null, change: [10, 15] },
    ],
  },
  6: {
    rm: 6, sets: [{ n: 1, reps: 10, pct: 50 }, { n: 2, reps: 6, pct: 75 }, { n: 3, reps: "max", pct: 100 }, { n: 4, reps: "max", pct: "adjusted" }],
    bands: [
      { min: 0, max: 2, change: [-10, -5] },
      { min: 3, max: 4, change: [-5, 0] },
      { min: 5, max: 7, change: [0, 0] },
      { min: 8, max: 12, change: [5, 10] },
      { min: 13, max: null, change: [10, 15] },
    ],
  },
  10: {
    rm: 10, sets: [{ n: 1, reps: 12, pct: 50 }, { n: 2, reps: 10, pct: 75 }, { n: 3, reps: "max", pct: 100 }, { n: 4, reps: "max", pct: "adjusted" }],
    bands: [
      { min: 4, max: 6, change: [-10, -5] },
      { min: 7, max: 8, change: [-5, 0] },
      { min: 9, max: 11, change: [0, 0] },
      { min: 12, max: 16, change: [5, 10] },
      { min: 17, max: null, change: [10, 15] },
    ],
  },
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
// Round a positive magnitude to the loadable increment; ties go up.
const roundTo = (x, inc) => Math.round(x / inc) * inc;
const signedRound = (x, inc) => Math.sign(x) * roundTo(Math.abs(x), inc);

export function bandFor(variant, set3Reps) {
  const v = APRE_VARIANTS[variant];
  return v ? v.bands.find((b) => set3Reps >= b.min && (b.max == null || set3Reps <= b.max)) || null : null;
}

// stepMode picks a point inside the published range: 'low' = the smaller
// magnitude of change (default, most conservative about moving the load),
// 'mid', 'high' = the larger magnitude.
function pick(change, stepMode) {
  const [a, b] = change;
  const lo = Math.abs(a) <= Math.abs(b) ? a : b, hi = lo === a ? b : a;
  return stepMode === "high" ? hi : stepMode === "mid" ? (lo + hi) / 2 : lo;
}

// The loads for one APRE session from the working (nRM) weight.
export function apreSetPlan({ variant, workingWeight, set3Reps, config = {} }) {
  const v = APRE_VARIANTS[variant];
  const inc = resolveIncrement(config);
  if (!v || !isNum(workingWeight) || workingWeight <= 0 || inc === null) return null;
  const evalr = isNum(set3Reps) ? evaluateApre({ variant, config, workingWeight, sets: [{ sets: 3, reps: set3Reps, weight: workingWeight }] }) : null;
  return {
    variant, rm: v.rm,
    sets: v.sets.map((s) => ({
      n: s.n, reps: s.reps,
      load: s.pct === "adjusted" ? (evalr?.status === "increase" || evalr?.status === "decrease" || evalr?.status === "hold" ? evalr.recommendedLoad : null) : roundTo((workingWeight * s.pct) / 100, inc),
      pct: s.pct,
    })),
  };
}

// Evaluates a logged APRE session. `sets` = workout_logs rows (set number in
// `sets`, plus reps/weight). Set 3 (the max-rep set at 100% nRM) decides the
// adjusted load, which is also the next session's working weight.
export function evaluateApre({ config = {}, workingWeight, sets: rows = [], variant: variantArg }) {
  const variant = variantArg || config.variant;
  const methodId = `apre_${variant}`;
  const out = (status, extra = {}) => ({ methodId, status, recommendedLoad: null, reasons: [], missing: [], calc: {}, ...extra });
  const calc = { variant, config, workingWeight };
  if (!APRE_VARIANTS[variant]) return out("invalid", { reasons: [`Unknown APRE variant "${variant}" (use 3, 6 or 10).`], calc });
  if (!isNum(workingWeight) || workingWeight <= 0) return out("invalid", { reasons: ["The working (nRM) weight must be a positive number."], calc });
  const inc = resolveIncrement(config);
  if (inc === null) return out("invalid", { reasons: ["No valid loadable increment is configured (set an increment or equipment)."], calc });
  const stepMode = config.stepMode || "low";
  if (!["low", "mid", "high"].includes(stepMode)) return out("invalid", { reasons: [`stepMode must be low, mid or high (got "${stepMode}").`], calc });

  // Set 3 only counts if it was a real (non warm-up) set; the LAST logged row for set 3 wins.
  const set3rows = (rows || []).filter((r) => Number(r.sets) === 3 && (r.set_type || "working") === "working");
  const row = set3rows[set3rows.length - 1];
  if (!row) return out("insufficient_data", { missing: ["Set 3 (the max-rep set at the working weight) was not logged."], reasons: ["APRE adjusts from set 3, which is missing."], calc });
  const reps = toNum(row.reps), load = toNum(row.weight ?? row.load);
  if (reps === null || !Number.isInteger(reps) || reps < 0) return out("insufficient_data", { missing: ["Set 3 needs a whole-number rep count."], reasons: ["Set 3 reps are missing or invalid."], calc: { ...calc, set3: { reps, load } } });
  if (load === null || !isNum(load) || load <= 0) return out("insufficient_data", { missing: ["Set 3 needs its load."], reasons: ["Set 3 load is missing or invalid."], calc: { ...calc, set3: { reps, load } } });
  if (Math.abs(load - workingWeight) > 1e-9) return out("insufficient_data", { missing: [`Set 3 was logged at ${load}, not the ${workingWeight} working weight.`], reasons: ["APRE's adjustment is only valid when set 3 was performed at the working weight."], calc: { ...calc, set3: { reps, load } } });

  const band = bandFor(variant, reps);
  if (!band) return out("insufficient_data", { missing: [`No published APRE ${variant} adjustment exists for ${reps} rep${reps === 1 ? "" : "s"} on set 3.`], reasons: ["Set 3 reps fall outside the verified table, so no adjustment is calculated. Decide this one as the coach."], calc: { ...calc, set3: { reps, load } } });

  const raw = pick(band.change, stepMode);
  const change = raw === 0 ? 0 : signedRound(raw, inc);
  const adjusted = workingWeight + change;
  const range = band.change[0] === band.change[1] ? "no change" : `${band.change[0] > 0 ? "+" : ""}${band.change[0]} to ${band.change[1] > 0 ? "+" : ""}${band.change[1]} lb`;
  if (adjusted <= 0) return out("invalid", { reasons: [`The adjustment would take the load to ${adjusted}.`], calc: { ...calc, set3: { reps, load }, band, change } });
  const status = change > 0 ? "increase" : change < 0 ? "decrease" : "hold";
  return out(status, {
    recommendedLoad: adjusted,
    reasons: [
      `${reps} rep${reps === 1 ? "" : "s"} on set 3 at ${workingWeight}: APRE ${variant} table says ${range}; ${stepMode} end, rounded to ${inc} = ${change === 0 ? "no change" : (change > 0 ? "+" : "") + change}.`,
      `Set 4 load is ${adjusted}, and ${adjusted} is the working weight for the next session.`,
    ],
    calc: { ...calc, increment: inc, stepMode, set3: { reps, load }, band, change, adjustedLoad: adjusted, nextSessionLoad: adjusted },
  });
}
