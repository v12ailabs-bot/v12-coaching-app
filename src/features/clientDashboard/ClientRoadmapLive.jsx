import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { ClientProgramRoadmap } from "../../components/ClientProgramRoadmap.jsx";
import { roadmapStats } from "../../lib/roadmapStats.js";

// Loads the signed-in client's own check-ins and meal logs for the program and
// renders the client-facing roadmap with real phase stats.
export function ClientRoadmapLive({ profile, program, phases, showPhaseCard = true }) {
  const [data, setData] = useState({ daily: [], mealLogs: [] });
  useEffect(() => {
    if (!program?.start_date) return;
    Promise.all([
      supabase.from("daily_checkins").select("date,workout,calories,protein_g,carbs_g,fats_g").eq("client_id", profile.id).gte("date", program.start_date),
      supabase.from("meal_logs").select("date,calories,protein_g,carbs_g,fats_g").eq("client_id", profile.id).gte("date", program.start_date),
    ]).then(([d, m]) => setData({ daily: d.data || [], mealLogs: m.data || [] }));
  }, [profile.id, program?.start_date]);
  const current = phases.find((p) => p.phase === program?.phase);
  const stats = current ? roadmapStats({ phase: current, programStart: program.start_date, daily: data.daily, mealLogs: data.mealLogs }) : null;
  return <ClientProgramRoadmap phases={phases} currentPhase={program?.phase} startDate={program?.start_date} stats={stats} showPhaseCard={showPhaseCard} />;
}
