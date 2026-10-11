// Coach decisions on a recommendation. Pure: returns a new decision object and
// never touches the recommendation's original calculation — the stored
// calc/recommendedLoad stay exactly as the engine produced them, and the
// approved prescription is a separate value (it may differ if the coach edits).
const isPosNum = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

export function decideRecommendation(recommendation, decision) {
  const { decision: kind, modifiedLoad, note } = decision || {};
  if (!recommendation) return { ok: false, error: "No recommendation to decide." };
  if (recommendation.status && recommendation.status !== "pending") return { ok: false, error: `This recommendation was already ${recommendation.status}.` };
  if (!["approve", "modify", "reject"].includes(kind)) return { ok: false, error: `decision must be approve, modify or reject (got "${kind}").` };

  const calculated = recommendation.calc_result?.recommendedLoad ?? recommendation.recommendedLoad ?? recommendation.recommended_load ?? null;

  if (kind === "reject") return { ok: true, status: "rejected", approvedPrescription: null, note: note || null, original: calculated };
  if (kind === "approve") {
    if (!isPosNum(calculated)) return { ok: false, error: "There is no calculated load to approve; use modify to set one." };
    return { ok: true, status: "approved", approvedPrescription: { load: calculated, source: "calculated" }, note: note || null, original: calculated };
  }
  if (!isPosNum(modifiedLoad)) return { ok: false, error: "modify requires a positive modifiedLoad." };
  return { ok: true, status: "modified", approvedPrescription: { load: modifiedLoad, source: "coach_override", calculatedLoad: calculated }, note: note || null, original: calculated };
}
