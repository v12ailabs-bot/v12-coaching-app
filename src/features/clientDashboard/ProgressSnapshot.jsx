import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, CardTitle, Btn } from "../../components/ui/index.js";

// Weight trend from the same daily_checkins history ClientHome already
// loads (passed down as `checkins`) + the most recent progress photo
// thumbnail (progress_photos + a signed storage URL, same pattern as
// ProgressPhotos in SharedProgressViews.jsx). Body fat % isn't tracked
// anywhere in the schema yet, so it's intentionally left out here.
export function ProgressSnapshot({ profile, checkins, setPage }) {
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("progress_photos").select("path,taken_on")
        .eq("client_id", profile.id).order("taken_on", { ascending: false }).limit(1);
      const row = rows?.[0];
      if (row) {
        const { data: signed } = await supabase.storage.from("progress-photos").createSignedUrl(row.path, 3600);
        setPhoto({ ...row, url: signed?.signedUrl });
      }
      setLoading(false);
    })();
  }, [profile.id]);

  const weights = checkins.filter((c) => c.weight != null);
  const latest = weights.length ? weights[weights.length - 1].weight : null;
  const weekAgo = weights.length ? weights.find((w) => w.date <= weights[weights.length - 1].date && new Date(weights[weights.length - 1].date) - new Date(w.date) >= 6 * 86400000) : null;
  const delta = latest != null && weekAgo ? +(latest - weekAgo.weight).toFixed(1) : null;

  return (
    <Card>
      <CardTitle>Progress Snapshot</CardTitle>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Weight</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, lineHeight: 1 }}>{latest ?? "—"}<span style={{ fontSize: 13, color: S.muted }}> lbs</span></div>
          {delta != null && (
            <div style={{ fontSize: 11, marginTop: 4, color: delta < 0 ? S.success : delta > 0 ? S.danger : S.muted }}>
              {delta === 0 ? "No change" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} lbs this week`}
            </div>
          )}
        </div>
        {!loading && photo?.url && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Photos</div>
            <img src={photo.url} alt="Latest progress" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid " + S.border }} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("progress")}>View Progress</Btn></div>
    </Card>
  );
}
