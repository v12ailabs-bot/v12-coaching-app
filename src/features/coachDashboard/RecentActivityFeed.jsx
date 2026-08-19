import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";

const relTime = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
};

// Merges the most recent rows across the tables clients actually write to
// (daily_checkins, weekly_checkins, workout_logs, progress_photos) into one
// feed — no separate "activity log" table, just a client-side merge sorted
// by created_at.
export function RecentActivityFeed({ nameOf }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: dc }, { data: wc }, { data: wl }, { data: pp }] = await Promise.all([
        supabase.from("daily_checkins").select("client_id,created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("weekly_checkins").select("client_id,created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("workout_logs").select("client_id,created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("progress_photos").select("client_id,created_at").order("created_at", { ascending: false }).limit(8),
      ]);
      const merged = [
        ...(dc || []).map((r) => ({ ...r, text: "completed a daily check-in" })),
        ...(wc || []).map((r) => ({ ...r, text: "completed a weekly check-in" })),
        ...(wl || []).map((r) => ({ ...r, text: "logged a workout" })),
        ...(pp || []).map((r) => ({ ...r, text: "uploaded progress photos" })),
      ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8);
      setEvents(merged);
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardTitle>Recent Activity</CardTitle>
      {loading ? (
        <div className="spinner" style={{ margin: "20px auto" }} />
      ) : events.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13 }}>No activity yet.</div>
      ) : (
        events.map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i < events.length - 1 ? "1px solid " + S.border : "none", fontSize: 12.5 }}>
            <span><strong>{nameOf(e.client_id)}</strong> {e.text}</span>
            <span style={{ color: S.muted, whiteSpace: "nowrap" }}>{relTime(e.created_at)}</span>
          </div>
        ))
      )}
    </Card>
  );
}
