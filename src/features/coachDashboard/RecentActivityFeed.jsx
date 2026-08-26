import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

const WINDOW_HOURS = 48;
const SCROLL_AFTER = 8;

const relTime = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
};

// Merges rows across the tables clients actually write to (daily_checkins,
// weekly_checkins, workout_logs, progress_photos) from the last 48 hours
// into one feed — no separate "activity log" table, just a client-side
// merge sorted by created_at. `clientIds` restricts this to coaching
// clients — program-only clients have their own Program Subscribers
// section, not this feed. A single workout save can insert several
// workout_logs rows (one per set) sharing the exact same created_at —
// deduped below so one gym session doesn't show up as several
// identical-looking lines.
export function RecentActivityFeed({ nameOf, clientIds }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientIds || clientIds.length === 0) { setEvents([]); setLoading(false); return; }
    (async () => {
      const cutoff = new Date(Date.now() - WINDOW_HOURS * 3600000).toISOString();
      const [{ data: dc }, { data: wc }, { data: wl }, { data: pp }] = await Promise.all([
        supabase.from("daily_checkins").select("client_id,created_at").in("client_id", clientIds).gte("created_at", cutoff).order("created_at", { ascending: false }),
        supabase.from("weekly_checkins").select("client_id,created_at").in("client_id", clientIds).gte("created_at", cutoff).order("created_at", { ascending: false }),
        supabase.from("workout_logs").select("client_id,created_at").in("client_id", clientIds).gte("created_at", cutoff).order("created_at", { ascending: false }),
        supabase.from("progress_photos").select("client_id,created_at").in("client_id", clientIds).gte("created_at", cutoff).order("created_at", { ascending: false }),
      ]);
      const seen = new Set();
      const merged = [
        ...(dc || []).map((r) => ({ ...r, text: "completed a daily check-in" })),
        ...(wc || []).map((r) => ({ ...r, text: "completed a weekly check-in" })),
        ...(wl || []).map((r) => ({ ...r, text: "logged a workout" })),
        ...(pp || []).map((r) => ({ ...r, text: "uploaded progress photos" })),
      ].filter((r) => {
        const key = `${r.client_id}|${r.text}|${r.created_at}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setEvents(merged);
      setLoading(false);
    })();
  }, [clientIds && clientIds.join(",")]);

  return (
    <Card>
      <SectionTitle>Recent Activity <span style={{ fontSize: 11, color: S.muted, fontWeight: 400, marginLeft: 6 }}>Last 48h</span></SectionTitle>
      {loading ? (
        <div className="spinner" style={{ margin: "20px auto" }} />
      ) : events.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13 }}>No activity in the last 48 hours.</div>
      ) : (
        <div style={{ maxHeight: events.length > SCROLL_AFTER ? 360 : "none", overflowY: "auto" }}>
          {events.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "12px 4px", borderBottom: i < events.length - 1 ? "1px solid " + S.border : "none", fontSize: 13 }}>
              <span><strong style={{ fontWeight: 600 }}>{nameOf(e.client_id)}</strong> {e.text}</span>
              <span style={{ color: S.muted, fontSize: 11, whiteSpace: "nowrap" }}>{relTime(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
