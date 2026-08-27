import { useState, useEffect } from "react";
import { S, trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { fetchMilestones, currentExerciseValue, milestoneProgress } from "../../lib/milestones.js";

// Client-facing primary milestone -- same client_goals rows the coach
// manages in MilestonesCard, simplified: no coach notes, no secondary list
// detail beyond a count, just "what am I working toward right now."
export function CurrentMilestoneCard({ profile }) {
  const [milestone, setMilestone] = useState(undefined);
  const [current, setCurrent] = useState(null);
  const [secondaryCount, setSecondaryCount] = useState(0);

  useEffect(() => {
    fetchMilestones(trainingOwnerId(profile)).then(async (all) => {
      const primary = all.find((m) => m.priority === "primary") || all[0] || null;
      setSecondaryCount(all.filter((m) => m.id !== primary?.id).length);
      setMilestone(primary);
      if (primary?.exercise_name) {
        const v = await currentExerciseValue(trainingOwnerId(profile), primary.exercise_name, primary.unit === "reps");
        setCurrent(v);
      }
    });
  }, [profile.id, profile.shared_program_owner_id]);

  if (!milestone) return null;
  const { progressPct, achieved } = milestoneProgress(milestone, current);

  return (
    <Card>
      <CardTitle>Current Milestone</CardTitle>
      <div style={{ fontSize: 18, fontWeight: 700, color: S.text, marginTop: 6 }}>{milestone.exercise_name}</div>
      <div style={{ fontSize: 13, color: S.muted, marginTop: 2 }}>
        {milestone.baseline_value}{milestone.unit} to {milestone.target_value}{milestone.unit}
      </div>
      {progressPct != null && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 4, background: S.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: progressPct + "%", background: achieved ? S.success : S.accent, borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 11, color: achieved ? S.success : S.muted, marginTop: 4, fontWeight: achieved ? 700 : 400 }}>
            {achieved ? "Target reached — your coach will confirm your next target." : `${progressPct}% there`}
          </div>
        </div>
      )}
      {secondaryCount > 0 && <div style={{ fontSize: 11, color: S.muted, marginTop: 10 }}>+{secondaryCount} more milestone{secondaryCount > 1 ? "s" : ""} in progress</div>}
    </Card>
  );
}
