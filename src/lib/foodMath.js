// Decimal-safe nutrient math for the food logger's live preview. Mirrors the
// Postgres trigger on meal_log_entries (grams * per100 / 100, numeric, round
// half up to 2 dp) using BigInt hundredths — never JS floating point — so the
// number a client sees while typing is the number the database stores.
// null = unknown and is preserved, never coerced to 0.

// "137.3" | 137.3 -> hundredths as BigInt, or null if not an exact value with
// at most 2 decimal places.
function toHundredths(v) {
  if (v == null || v === "") return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(v).trim());
  if (!m) return null;
  return BigInt(m[1]) * 100n + BigInt((m[2] || "").padEnd(2, "0") || "0");
}

const fromHundredths = (h) => Number(h) / 100;

// Returns the parsed quantity in hundredths, or an error string.
export function validateQuantityG(raw) {
  if (raw == null || String(raw).trim() === "") return { error: "Enter a quantity in grams" };
  const h = toHundredths(raw);
  if (h == null) return { error: "Use a positive number with at most 2 decimals" };
  if (h <= 0n) return { error: "Quantity must be greater than 0" };
  if (h > 99999999n) return { error: "Quantity is too large" };
  return { hundredths: h };
}

// per100: { kcal, protein, carbs, fat } (numbers/strings/null). Returns
// { kcal, protein, carbs, fat } rounded half up to 2 dp, null where unknown,
// or { error }.
export function computeNutrients(per100, quantityG) {
  const q = validateQuantityG(quantityG);
  if (q.error) return { error: q.error };
  const out = {};
  for (const k of ["kcal", "protein", "carbs", "fat"]) {
    const p = toHundredths(per100?.[k]);
    out[k] = p == null ? null : fromHundredths((p * q.hundredths + 5000n) / 10000n);
  }
  return out;
}

// Sums known values only; null if every value is unknown (matches SUM() over
// NULLs in the database).
export function sumNutrient(values) {
  let total = 0n, any = false;
  for (const v of values) {
    const h = v == null ? null : toHundredths(Number(v).toFixed(2));
    if (h != null) { total += h; any = true; }
  }
  return any ? fromHundredths(total) : null;
}

// Display rounding: kcal as whole numbers, macros to 1 decimal; null -> "unknown".
export function formatKcal(v) { return v == null ? "unknown" : String(Math.round(v)); }
export function formatMacro(v) { return v == null ? "unknown" : (Math.round(v * 10) / 10).toFixed(1); }
