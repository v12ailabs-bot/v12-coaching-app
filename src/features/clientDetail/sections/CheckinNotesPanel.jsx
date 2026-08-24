import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { Card, CardTitle } from "../../../components/ui/index.js";
import { CheckinNotes } from "../../progress/SharedProgressViews.jsx";

// Right-rail card: the client's free-text weekly check-in answers — self-
// contained fetch (same shape ProgressPage.jsx builds) so it can sit in the
// rail without threading weekly-checkins state through ClientDetailPage.
export function CheckinNotesPanel({ clientId }) {
  const [weekly, setWeekly] = useState([]);
  useEffect(() => {
    supabase.from("weekly_checkins").select("*").eq("client_id", clientId).order("date")
      .then(({ data }) => setWeekly((data || []).map((w, i) => ({ ...w, week: "Wk" + (i + 1) }))));
  }, [clientId]);

  return (
    <Card style={{ marginBottom: 0 }}>
      <CardTitle>Weekly Check-in Notes</CardTitle>
      <CheckinNotes weekly={weekly} />
    </Card>
  );
}
