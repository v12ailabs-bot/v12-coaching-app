import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS } from "../../theme.jsx";
import { Card, Btn, Modal } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";
import { todayStr } from "../../lib/dates.js";
import { sessionsOnDate, timeLabel, repeatLabel, WEEKDAY_LABELS } from "../../lib/coachSessions.js";

// Coach "Today": the clients the coach has sessions with today, by time slot,
// with the coach-only Session Reminder shown under each row. Sessions live in
// coach_sessions (one-off date or recurring weekdays) — the client scheduler
// only assigns workout days to dates (no times, no recurrence), so it couldn't
// be reused as the data model.
const input = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 14, borderRadius: RADIUS.md, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 11, color: S.muted, textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 4px", display: "block" };

function SessionForm({ clients, session, onClose, onSaved }) {
  const [clientId, setClientId] = useState(session?.client_id || clients[0]?.id || "");
  const [time, setTime] = useState((session?.start_time || "09:00").slice(0, 5));
  const [type, setType] = useState(session?.session_type || "");
  const [recurring, setRecurring] = useState(session ? !session.session_date : true);
  const [days, setDays] = useState(session?.weekdays || [new Date().getDay()]);
  const [date, setDate] = useState(session?.session_date || todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const valid = clientId && time && (recurring ? days.length > 0 : !!date);

  const save = async () => {
    setBusy(true); setErr(null);
    const row = { client_id: clientId, start_time: time, session_type: type.trim() || null, session_date: recurring ? null : date, weekdays: recurring ? [...days].sort() : null };
    const q = session ? supabase.from("coach_sessions").update(row).eq("id", session.id) : supabase.from("coach_sessions").insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) { setErr(/coach_sessions/.test(error.message) && /exist|cache/.test(error.message) ? "The sessions table isn't set up yet — run db/add_coach_sessions.sql in Supabase." : error.message); return; }
    onSaved(); onClose();
  };

  return (
    <Modal title={session ? "Edit session" : "Schedule a session"} onClose={onClose} width={480}>
      <label style={lbl}>Client</label>
      <select style={input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
      </select>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={lbl}>Time</label><input style={input} type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>Session type</label><input style={input} value={type} placeholder="e.g. Training, Check-in" onChange={(e) => setType(e.target.value)} /></div>
      </div>
      <label style={lbl}>Repeats</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Btn sm teal={recurring} onClick={() => setRecurring(true)}>Weekly</Btn>
        <Btn sm teal={!recurring} onClick={() => setRecurring(false)}>One day only</Btn>
      </div>
      {recurring ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WEEKDAY_LABELS.map((d, i) => {
            const on = days.includes(i);
            return <button key={d} type="button" onClick={() => setDays((l) => (on ? l.filter((x) => x !== i) : [...l, i]))}
              style={{ cursor: "pointer", padding: "8px 12px", fontSize: 13, fontWeight: 600, borderRadius: 999, background: on ? "rgba(255,106,0,.16)" : S.surface2, color: on ? S.accent : S.muted, border: "1px solid " + (on ? S.accent : S.border) }}>{d}</button>;
          })}
        </div>
      ) : <input style={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      {err && <div style={{ fontSize: 12, color: S.danger, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn onClick={save} disabled={busy || !valid}>{busy ? "Saving..." : "Save"}</Btn>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
      </div>
    </Modal>
  );
}

export function CoachTodaySection({ clients, reminders = {}, openClient }) {
  const [sessions, setSessions] = useState([]);
  const [form, setForm] = useState(null); // null | {} (new) | session (edit)
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("coach_sessions").select("*").order("start_time");
    setSessions(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const nameOf = (id) => { const c = clients.find((x) => x.id === id); return c ? (c.name || c.email) : "Client"; };
  const today = sessionsOnDate(sessions, todayStr());
  const remove = async (s) => {
    if (!window.confirm(s.session_date ? "Remove this session?" : `Remove this recurring session (${repeatLabel(s)})? It's removed from every day.`)) return;
    await supabase.from("coach_sessions").delete().eq("id", s.id);
    load();
  };

  const Row = ({ s, withReminder }) => (
    <div style={{ padding: "10px 0", borderBottom: "1px solid " + S.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 70, fontSize: 13, fontWeight: 700, color: S.accent, flexShrink: 0 }}>{timeLabel(s.start_time)}</div>
        <div onClick={() => openClient(s.client_id)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(s.client_id)}</div>
          <div style={{ fontSize: 11, color: S.muted }}>{[s.session_type, repeatLabel(s)].filter(Boolean).join(" · ")}</div>
        </div>
        <button type="button" onClick={() => setForm(s)} style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 12 }}>Edit</button>
        <button type="button" onClick={() => remove(s)} title="Remove" style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 16 }}>×</button>
      </div>
      {withReminder && reminders[s.client_id]?.reminder && (
        <div style={{ fontSize: 12, color: S.accent, marginTop: 4, marginLeft: 80 }}>Reminder: {reminders[s.client_id].reminder}</div>
      )}
    </div>
  );

  return (
    <Card>
      <SectionTitle action={<Btn sm teal onClick={() => setForm({})}>+ Schedule</Btn>}>Today</SectionTitle>
      {today.length === 0 ? <div style={{ fontSize: 13, color: S.muted }}>No sessions today</div> : today.map((s) => <Row key={s.id} s={s} withReminder />)}
      {sessions.length > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} style={{ background: "none", border: "none", color: S.muted, fontSize: 12, cursor: "pointer", padding: "10px 0 0" }}>
          {showAll ? "▲ Hide all sessions" : `▼ All scheduled sessions (${sessions.length})`}
        </button>
      )}
      {showAll && sessions.map((s) => <Row key={s.id} s={s} />)}
      {form && <SessionForm clients={clients} session={form.id ? form : null} onClose={() => setForm(null)} onSaved={load} />}
    </Card>
  );
}
