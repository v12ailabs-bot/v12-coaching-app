import { useState, useEffect } from "react";
import { S, RADIUS, trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { fetchMilestones, currentExerciseValue, milestoneProgress, MILESTONE_CATEGORY_LABELS } from "../../lib/milestones.js";

// Client milestones as sideways bars against their targets: each bar runs from
// where the client started (baseline) to the target; the fill is how far they
// are today, with today's value on the fill and the target at the far end.
// Same client_goals rows and the same milestoneProgress the coach sees — no
// coach notes. A milestone with no logged value yet shows its empty track and
// says so instead of guessing.
function MilestoneBar({ m, current }) {
  const { progressPct, achieved } = milestoneProgress(m, current);
  const unit = m.unit || "";
  const color = achieved ? S.success : S.accent;
  const hasValue = progressPct != null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.exercise_name || MILESTONE_CATEGORY_LABELS?.[m.category] || "Milestone"}</div>
          {m.priority === "primary" && <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.accent }}>Primary</div>}
        </div>
        <div style={{ fontSize: 12, color: achieved ? S.success : S.muted, fontWeight: achieved ? 700 : 400, flexShrink: 0 }}>
          {achieved ? "Target reached" : hasValue ? `${progressPct}%` : "No data yet"}
        </div>
      </div>
      <div style={{ position: "relative", height: 22, background: S.surface2, border: "1px solid " + S.border, borderRadius: 11, overflow: "hidden" }}>
        {hasValue && (
          <div style={{ width: Math.max(progressPct, 4) + "%", height: "100%", background: `linear-gradient(90deg, ${color}99, ${color})`, borderRadius: 11, transition: "width .5s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, boxSizing: "border-box" }}>
            {progressPct >= 22 && <span style={{ fontSize: 11, fontWeight: 700, color: "#0B0B0D", whiteSpace: "nowrap" }}>{current}{unit}</span>}
          </div>
        )}
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 3, background: S.text, opacity: 0.55 }} title="Target" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: S.muted, marginTop: 4 }}>
        <span>Start {m.baseline_value}{unit}</span>
        {hasValue && progressPct < 22 && <span style={{ color }}>Now {current}{unit}</span>}
        <span style={{ color: S.text, fontWeight: 600 }}>Target {m.target_value}{unit}</span>
      </div>
    </div>
  );
}

export function CurrentMilestoneCard({ profile }) {
  const [items, setItems] = useState(undefined); // [{ m, current }]

  useEffect(() => {
    const owner = trainingOwnerId(profile);
    fetchMilestones(owner).then(async (all) => {
      const sorted = [...all].sort((a, b) => (a.priority === "primary" ? -1 : 0) - (b.priority === "primary" ? -1 : 0)).slice(0, 6);
      const withValues = await Promise.all(sorted.map(async (m) => ({
        m, current: m.exercise_name ? await currentExerciseValue(owner, m.exercise_name, m.unit === "reps") : null,
      })));
      setItems(withValues);
    });
  }, [profile.id, profile.shared_program_owner_id]);

  if (!items || items.length === 0) return null;
  return (
    <Card>
      <CardTitle>Milestones</CardTitle>
      <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>How far you are from each target.</div>
      {items.map(({ m, current }) => <MilestoneBar key={m.id} m={m} current={current} />)}
    </Card>
  );
}
