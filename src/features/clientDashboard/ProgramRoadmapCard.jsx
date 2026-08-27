import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, trainingOwnerId } from "../../theme.jsx";
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

  const currentIndex = phases.findIndex((p) => p.phase === program?.phase);
  const current = currentIndex === -1 ? null : phases[currentIndex];
  const next = currentIndex === -1 ? null : phases[currentIndex + 1];

  return (
    <Card>
      <CardTitle>Your Program Roadmap</CardTitle>
      <ProgramRoadmap phases={phases} currentPhase={program?.phase} startDate={program?.start_date} />
      {current?.objective && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + S.border }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Why You're Here</div>
          <div style={{ fontSize: 13, color: S.text, lineHeight: 1.6 }}>{current.objective}</div>
          {(current.training_focus || current.movement_focus) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {current.training_focus && <span style={{ fontSize: 11, color: S.text, border: "1px solid " + S.border, borderRadius: 20, padding: "4px 10px" }}>{current.training_focus}</span>}
              {current.movement_focus && <span style={{ fontSize: 11, color: S.text, border: "1px solid " + S.border, borderRadius: 20, padding: "4px 10px" }}>{current.movement_focus}</span>}
            </div>
          )}
          {next && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11, color: S.muted }}>What's Next: </span>
              <span style={{ fontSize: 11, color: S.text, fontWeight: 600 }}>{next.phase}</span>
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("program")}>View Full Program Details</Btn></div>
    </Card>
  );
}
