// Household measures for the food logger. The Notion "Household measures" text
// ("cup=158 g; tbsp=9.9 g") is synced verbatim into foods.household_measures and
// parsed here, per food. Nothing is ever guessed: a volume or item unit exists
// for a food only if that food's own text defines it. Mass units (g, oz, lb, kg)
// are universal and never depend on the food.
export const MASS_UNITS = { g: 1, oz: 28.349523125, lb: 453.59237, kg: 1000 };
const MASS_LABEL = { g: "g", oz: "oz", lb: "lb", kg: "kg" };

// Supported household labels -> canonical key. Anything else is ignored (and
// warned about in development) rather than invented.
const ALIASES = {
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  small: "small", medium: "medium", large: "large",
  slice: "slice", slices: "slice", piece: "piece", pieces: "piece",
  each: "each", serving: "serving", scoop: "scoop", can: "can", packet: "packet",
  fillet: "fillet", patty: "patty", link: "link", bar: "bar", clove: "clove",
  stick: "stick", wedge: "wedge", bunch: "bunch", handful: "handful",
};
const MAX_G = 5000;

// Text -> { [unitKey]: gramsPerUnit }. Never throws. Malformed, unsupported,
// non-positive or implausible entries are skipped. A food's own "oz"/"g"/"lb"
// entry is ignored in favour of the exact standard factor.
export function parseHouseholdMeasures(raw, { onWarn } = {}) {
  const out = {};
  if (raw == null || typeof raw !== "string" || !raw.trim()) return out;
  const warn = (m) => { if (onWarn) onWarn(m); else if (typeof import.meta !== "undefined" && import.meta.env?.DEV) console.warn("[household-measures]", m); };
  for (const part of raw.split(/[;\n]+/).flatMap((p) => p.split(/,\s*(?=[a-z])/i))) {
    const s = part.trim();
    if (!s) continue;
    const m = /^([a-z][a-z .-]*?)\s*=\s*(\d+(?:\.\d+)?)\s*(?:g|gram|grams)?$/i.exec(s);
    if (!m) { warn(`malformed entry "${s}"`); continue; }
    const label = m[1].trim().toLowerCase();
    const grams = Number(m[2]);
    if (MASS_UNITS[label]) {
      if (label !== "g" && Math.abs(grams - MASS_UNITS[label]) / MASS_UNITS[label] > 0.02) warn(`"${s}" differs from the standard ${label}; using the standard`);
      continue;
    }
    const key = ALIASES[label];
    if (!key) { warn(`unsupported unit "${label}"`); continue; }
    if (!(grams > 0) || grams > MAX_G) { warn(`implausible weight in "${s}"`); continue; }
    if (out[key] == null) out[key] = grams;
  }
  return out;
}

// Dropdown options for one food: grams, oz, lb, kg, then that food's household
// units, each labelled with its gram weight so there's no ambiguity.
export function unitOptions(measures = {}) {
  return [
    ...Object.keys(MASS_UNITS).map((k) => ({ key: k, label: MASS_LABEL[k], household: false })),
    ...Object.entries(measures).map(([k, g]) => ({ key: k, label: `${k} (${g} g)`, household: true })),
  ];
}

// amount + unit -> grams as a string with at most 2 decimals. A household unit
// the food doesn't define yields "" (no guess). A non-numeric amount is passed
// through unchanged so the existing quantity validation reports it.
export function toGrams(amount, unit, measures = {}) {
  const raw = String(amount ?? "").trim();
  if (unit === "g" || unit == null) return raw;
  if (!/^\d+(\.\d+)?$/.test(raw)) return raw;
  const per = MASS_UNITS[unit] ?? measures[unit];
  if (!(per > 0)) return "";
  return (Math.round(Number((Number(raw) * per).toFixed(6)) * 100) / 100).toString();
}
