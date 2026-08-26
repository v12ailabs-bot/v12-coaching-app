import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";
import { ProgramRoadmap } from "../../components/ProgramRoadmap.jsx";

// Reads the coach's planned phase sequence (program_phases) for this program
// and highlights the step matching programs.phase — same data ProgramRoadmap
// renders on the Training Plan page and in the coach's client detail view.
export function ProgramRoadmapCard({ profile, setPage }) {
  const [program, setProgram] = useState(null);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("programs").select("id,phase,start_date").eq("client_id", trainingOwnerId(profile))
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(async ({ data }) => {
        setProgram(data || null);
        if (data) {
          const { data: planned } = await supabase.from("program_phases").select("*").eq("program_id", data.id).order("order_index");
          setPhases(planned || []);
        }
        setLoading(false);
      });
  }, [profile.id, profile.shared_program_owner_id]);

  if (loading || phases.length === 0) return null;

  return (
    <Card>
      <CardTitle>Your Program Roadmap</CardTitle>
      <ProgramRoadmap phases={phases} currentPhase={program?.phase} startDate={program?.start_date} />
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("program")}>View Full Program Details</Btn></div>
    </Card>
  );
}
