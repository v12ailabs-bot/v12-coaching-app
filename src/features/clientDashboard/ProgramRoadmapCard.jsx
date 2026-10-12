import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { trainingOwnerId } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";
import { ClientRoadmapLive } from "./ClientRoadmapLive.jsx";

// Reads the coach's planned phase sequence (program_phases) for this program and
// renders the client-facing roadmap view (stepper, current phase, quick stats,
// phase progress) — the same view the coach previews in their roadmap editor.
export function ProgramRoadmapCard({ profile, setPage }) {
  const [program, setProgram] = useState(null);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("programs").select("id,phase,start_date,weeks").eq("client_id", trainingOwnerId(profile))
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
      <ClientRoadmapLive profile={profile} program={program} phases={phases} />
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("program")}>View Full Program Details</Btn></div>
    </Card>
  );
}
