// Which points get a number label. Labelling every point turns a long history into an
// overlapping smear, so when there are many, label every Nth point (always the latest).
export function shouldLabel(index, total, maxLabels = 7) {
  if (total <= maxLabels) return true;
  if (index === total - 1) return true;
  const step = Math.ceil(total / maxLabels);
  return index % step === 0 && total - 1 - index >= Math.ceil(step / 2);
}
