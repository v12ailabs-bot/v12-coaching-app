// Pure helpers for the client's "you did it" popup (no I/O).

export const ACHIEVEMENTS_EVENT = "v12:achievements-check";
// Call after something that can complete a milestone/goal is saved (a workout log, a weigh-in)
// so the popup shows right away instead of waiting for the next poll.
export const pingAchievements = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(ACHIEVEMENTS_EVENT)); };

const num = (v) => (v == null || v === "" ? null : Number(v));

export function celebrationText(goal, firstName) {
  const who = firstName ? `, ${firstName}` : "";
  const unit = goal.unit ? (goal.unit === "lb" || goal.unit === "kg" ? ` ${goal.unit}` : ` ${goal.unit}`) : "";
  if (goal.metric_key === "bodyweight") {
    return { title: `You hit your goal${who}!`, body: `You reached your goal weight of ${num(goal.target_value)}${unit || " lb"}. That's weeks of consistency paying off.`, emoji: "🏆" };
  }
  const name = goal.exercise_name || "your milestone";
  const from = num(goal.baseline_value);
  return {
    title: `Milestone smashed${who}!`,
    body: `${name}: you hit ${num(goal.target_value)}${unit}${from != null ? ` — up from ${from}${unit} when you started` : ""}. Your coach will set your next target.`,
    emoji: "💪",
  };
}
