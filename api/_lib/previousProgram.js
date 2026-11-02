import { summarizePreviousProgram } from "../../src/lib/programming/previousProgram.js";

const LOOKBACK_DAYS = 130;
const iso = (d) => d.toISOString().slice(0, 10);

// Fetches the client's last program + what they did on it and returns the AI
// briefing ({ hasHistory, text, stats }). Never throws: a failure here must not
// block generation, it just means the AI plans without transition context.
export async function loadPreviousProgramBriefing(db, { trainingOwnerId, profileId, today = iso(new Date()) }) {
  try {
    const from = new Date(); from.setDate(from.getDate() - LOOKBACK_DAYS);
    const since = iso(from);
    const [prog, exs, logs, daily, weekly, comps, sched] = await Promise.all([
      db.from("programs").select("*").eq("client_id", trainingOwnerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("exercises").select("*").eq("client_id", trainingOwnerId).is("retired_at", null).limit(300),
      db.from("workout_logs").select("*").eq("client_id", profileId).gte("date", since).limit(5000),
      db.from("daily_checkins").select("date,weight,energy,sleep_hours,workout").eq("client_id", profileId).gte("date", since).limit(500),
      db.from("weekly_checkins").select("date,what_went_well,lifts_improved,felt_weaker,exercise_feedback,holding_back,adjustments").eq("client_id", profileId).gte("date", since).order("date", { ascending: false }).limit(8),
      db.from("workout_completions").select("date,status").eq("client_id", profileId).gte("date", since).limit(500),
      db.from("scheduled_workouts").select("date,day_of_week").eq("client_id", profileId).gte("date", since).limit(500),
    ]);
    return summarizePreviousProgram({
      program: prog.data, exercises: exs.data || [], logs: logs.data || [], checkins: daily.data || [],
      weekly: weekly.data || [], completions: comps.data || [], scheduled: sched.data || [], today,
    });
  } catch (e) {
    console.warn("previous-program briefing failed (continuing without it):", e.message);
    return { hasHistory: false, text: null, stats: null };
  }
}
