// Maps an applicant's own intake answers onto the profiles.age/sex columns
// the Body Composition estimate reads (see bodyComposition.js) — applied
// once a lead becomes a client (CRMBoard's accept(), or link-lead.js at
// signup for the common case where acceptance happens before signup), so
// the estimate can show automatically instead of asking the client or
// coach to retype what the application already collected. Callers only
// fill profile fields that are still null — this never overwrites a value
// the client or coach already set.
export function profileFieldsFromIntake(intakeData) {
  if (!intakeData) return {};
  const out = {};
  if (intakeData.age) out.age = Number(intakeData.age) || undefined;
  if (intakeData.gender === "Male") out.sex = "male";
  else if (intakeData.gender === "Female") out.sex = "female";
  return out;
}
