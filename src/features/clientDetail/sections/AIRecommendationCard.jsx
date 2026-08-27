import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, Alert } from "../../../components/ui/index.js";

const STATUS_LABEL = { pending: "Pending Review", approved: "Approved", modified: "Modified", held: "Held", rejected: "Rejected" };

// Advisory-only AI progression recommendation for the client's current
// phase (Part 25/26) — the AI never touches programs/exercises; this card
// is the entire coach decision surface: Approve / Modify / Hold / Reject.
// Resolves the current phase's own program_phases row itself (needs its id,
// which ProgramPhase's plannedPhases list already has but doesn't expose)
// rather than threading it through the parent.
export function AIRecommendationCard({ clientId }) {
  const [phaseId, setPhaseId] = useState(undefined);
  const [latest, setLatest] = useState(undefined);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    supabase.from("programs").select("id,phase").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(async ({ data: program }) => {
        if (!program?.phase) return setPhaseId(null);
        const { data: phase } = await supabase.from("program_phases").select("id").eq("program_id", program.id).eq("phase", program.phase).maybeSingle();
        setPhaseId(phase?.id || null);
      });
  }, [clientId]);

  const load = useCallback(() => {
    supabase.from("program_phase_recommendations").select("*").eq("client_id", clientId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLatest(data || null));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/goal-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ phase_id: phaseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate a recommendation.");
      setLatest(json.recommendation);
    } catch (e) { setErr(e.message); }
    finally { setGenerating(false); }
  };

  const decide = async (status, decisionNote) => {
    await supabase.from("program_phase_recommendations").update({
      status, coach_decision_note: decisionNote || null, decided_at: new Date().toISOString(),
    }).eq("id", latest.id);
    setNoteFor(null); setNote("");
    load();
  };

  if (!phaseId || latest === undefined) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <CardTitle>AI Analysis — Recommendation Only</CardTitle>
        <Btn sm teal onClick={generate} disabled={generating}>{generating ? "Analyzing..." : latest ? "Re-run" : "Generate"}</Btn>
      </div>
      <Alert variant="error">{err}</Alert>
      {!latest && !generating && <div style={{ fontSize: 13, color: S.muted }}>No recommendation yet for this phase.</div>}
      {latest && (
        <>
          <div style={{ fontSize: 13, color: S.text, lineHeight: 1.7, marginBottom: 8 }}>{latest.recommendation_text}</div>
          {latest.reasoning_text && <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.6, marginBottom: 8 }}>{latest.reasoning_text}</div>}
          {latest.suggested_action && (
            <div style={{ fontSize: 12, color: S.accent2, marginBottom: 12 }}><strong>Suggested next step:</strong> {latest.suggested_action}</div>
          )}
          {latest.status === "pending" ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn sm onClick={() => decide("approved")}>Approve</Btn>
              <Btn sm teal onClick={() => setNoteFor("modified")}>Modify</Btn>
              <Btn sm onClick={() => decide("held")}>Hold</Btn>
              <Btn sm danger onClick={() => decide("rejected")}>Reject</Btn>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: S.muted }}>
              {STATUS_LABEL[latest.status]}{latest.decided_at ? ` on ${latest.decided_at.slice(0, 10)}` : ""}
              {latest.coach_decision_note && ` — "${latest.coach_decision_note}"`}
            </div>
          )}
          {noteFor && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you changing?"
                style={{ flex: 1, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 12, outline: "none" }} />
              <Btn sm onClick={() => decide("modified", note)}>Save</Btn>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
