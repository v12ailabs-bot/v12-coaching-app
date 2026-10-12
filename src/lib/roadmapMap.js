// Pure (no browser client) so it can be unit-tested.
// AI response -> the editable roadmap rows the editor uses. Pure (tested).
export function mapGeneratedPhases(phases) {
  return (phases || []).map((p) => ({
    phase: p.phase || "", week_start: p.week_start ?? "", week_end: p.week_end ?? "", note: p.note || "",
    objective: p.objective || "", training_focus: p.training_focus || "", movement_focus: p.movement_focus || "",
    progression_strategy: p.progression_strategy || "",
    exit_criteria: (p.exit_criteria || []).map((label) => ({ label, status: "incomplete" })),
    checkpoints: [], plan_rationale: "", planned_changes: [],
  }));
}
