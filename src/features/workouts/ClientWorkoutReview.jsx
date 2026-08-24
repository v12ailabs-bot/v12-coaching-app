import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle, CollapsibleSection } from "../../components/ui/index.js";
import { groupByDay, groupIntoBlocks } from "../../lib/constants.js";
import { LogEntryList, withinReviewWindow } from "./WorkoutCharts.jsx";

// Client-facing Workout Review — a closed-by-default dropdown per day (e.g.
// "Day 2 Workout Review") that opens straight into that day's exercises with
// their date/weight/reps/set history, no further per-exercise dropdown. This
// is the raw log, not the trend graphs above it on the Workouts page — those
// stay focused on whichever exercise is currently selected for logging; this
// section lets the client review any day's full history in one place.
function DayReview({ dayGroup, logsByExercise }) {
  const [open, setOpen] = useState(false);
  const items = groupIntoBlocks(dayGroup.exercises);
  return (
    <CollapsibleSection title={`${dayGroup.label} Workout Review`} expanded={open} onToggle={setOpen}>
      {items.map((item) => {
        const isGroup = item.members.length > 1;
        const rows = item.members
          .flatMap((m) => (logsByExercise[m.id] || []).map((l) => ({ ...l, exerciseName: isGroup ? m.name : null })))
          .filter((l) => withinReviewWindow(l.date))
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        return (
          <div key={item.id} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 6 }}>{item.members.map((m) => m.name).join(" + ")}</div>
            <LogEntryList rows={rows} />
          </div>
        );
      })}
    </CollapsibleSection>
  );
}

export function ClientWorkoutReview({ profile }) {
  const [exercises, setExercises] = useState([]);
  const [logsByExercise, setLogsByExercise] = useState({});

  useEffect(() => {
    supabase.from("exercises").select("*").eq("client_id", trainingOwnerId(profile))
      .then(({ data }) => setExercises(data || []));
  }, [profile.id, profile.shared_program_owner_id]);

  useEffect(() => {
    if (!exercises.length) { setLogsByExercise({}); return; }
    const ids = exercises.map((e) => e.id);
    supabase.from("workout_logs").select("*").eq("client_id", profile.id).in("exercise_id", ids).order("date").then(({ data }) => {
      const byEx = {};
      (data || []).forEach((l) => { (byEx[l.exercise_id] = byEx[l.exercise_id] || []).push(l); });
      setLogsByExercise(byEx);
    });
  }, [profile.id, exercises]);

  const dayGroups = groupByDay(exercises);
  if (!dayGroups.length) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Workout Review</CardTitle>
      {dayGroups.map((g) => <DayReview key={g.day} dayGroup={g} logsByExercise={logsByExercise} />)}
    </Card>
  );
}
