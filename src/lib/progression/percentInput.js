// "70, 72.5, 75" -> [70, 72.5, 75]. Returns undefined for an empty box (so the key is dropped from the
// config) and null when any entry isn't a number in (0, 100] — the form keeps what was typed and shows a hint.
export function parsePercents(text) {
  const parts = String(text ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const nums = parts.map(Number);
  return nums.every((n) => Number.isFinite(n) && n > 0 && n <= 100) ? nums : null;
}
