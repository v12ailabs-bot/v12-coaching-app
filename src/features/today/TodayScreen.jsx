import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr } from "../../theme.jsx";
import { Card, CardTitle, PageTitle, Fld, Inp, Sld, RG, Btn, StatusBadge, BackdateField } from "../../components/ui/index.js";
import { isHabitSatisfied, targetStatus, todayCompletionFrom } from "../../lib/scoring.js";
import { isWithinBackdateWindow, localDateStr } from "../../lib/dates.js";

const BACKDATE_DAYS = 7;

const MACRO_FIELDS = ["calories", "protein_g", "carbs_g", "fats_g"];
const STATUS_TONE = { "On Target": "green", "Near Target": "amber", "Over Target": "red", "Above Target": "amber", "Under Target": "amber" };

function targetLabel(habit, planTarget) {
  if (habit.type === "linked_check_in_value" && MACRO_FIELDS.includes(habit.linked_field)) return planTarget ?? null;
  return habit.target_value ?? null;
}

// One row per active habit, rendered by type — checkbox / numeric input vs
// a coach-set target / a live read of the Daily Check-In field it's linked
// to. `checkinValue` is only read for linked_check_in_value habits, never
// written here — that field's one input lives in the Daily Check-In section
// below, so nothing is ever asked for twice.
function TargetRow({ habit, planTarget, draft, onChangeDraft, checkinValue }) {
  const target = targetLabel(habit, planTarget);
  if (habit.type === "completion_button") {
    const done = !!draft?.done;
    return (
      <div onClick={() => onChangeDraft({ ...draft, done: !done })}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 4px", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: done ? S.neon : "transparent", color: done ? "#0A0A0B" : S.muted, border: done ? "none" : "1px solid " + S.border }}>{done ? "✓" : ""}</div>
        <span style={{ flex: 1, fontSize: 14, color: done ? S.text : S.muted }}>{habit.name}</span>
      </div>
    );
  }
  if (habit.type === "manual_value") {
    const status = draft?.value !== "" && draft?.value != null ? targetStatus(Number(draft.value), target, habit.target_direction) : null;
    return (
      <div style={{ padding: "12px 4px", borderBottom: "1px solid " + S.border }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: S.text }}>{habit.name}</span>
          <span style={{ fontSize: 11, color: S.muted }}>{target != null ? `Target: ${target}${habit.unit || ""}` : ""}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Inp type="number" value={draft?.value ?? ""} onChange={(e) => onChangeDraft({ ...draft, value: e.target.value })} placeholder={`e.g. ${target ?? ""}`} style={{ flex: 1 }} />
          {status && <StatusBadge label={status} tone={STATUS_TONE[status] || "neutral"} />}
        </div>
      </div>
    );
  }
  // linked_check_in_value — read-only, value comes from the Daily Check-In field below.
  const status = checkinValue != null && checkinValue !== "" ? targetStatus(Number(checkinValue), target, habit.target_direction) : null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", borderBottom: "1px solid " + S.border }}>
      <span style={{ fontSize: 14, color: S.text }}>{habit.name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: S.muted }}>{checkinValue || checkinValue === 0 ? checkinValue : "—"} / {target ?? "—"}{habit.unit || "g"}</span>
        {status && <StatusBadge label={status} tone={STATUS_TONE[status] || "neutral"} />}
      </div>
    </div>
  );
}

const EMPTY_FORM = { weight: "", calories: "", protein_g: "", carbs_g: "", fats_g: "", water: "", sleep_hours: "", energy: 7, mood: 7, steps: "", diet: "On track", workout: "completed" };

// Replaces the old separate Daily Check-In + Habits pages with one workflow:
// coach-configured Daily Targets, the Daily Check-In fields, Nutrition
// rating, and a single Complete Today action. See db/add_habit_types.sql
// for the habit `type` system this renders against.
export function TodayScreen({ profile, onDone }) {
  const [logDate, setLogDate] = useState(todayStr());
  const date = logDate;
  const minBackdate = (() => { const d = new Date(); d.setDate(d.getDate() - BACKDATE_DAYS); return localDateStr(d); })();
  const [habits, setHabits] = useState([]);
  const [planTarget, setPlanTarget] = useState({});
  const [existing, setExisting] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [habitDrafts, setHabitDrafts] = useState({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    setReady(false);
    Promise.all([
      supabase.from("habits").select("*").eq("client_id", profile.id).eq("active", true).order("order_index"),
      supabase.from("daily_checkins").select("*").eq("client_id", profile.id).eq("date", date).maybeSingle(),
      supabase.from("habit_logs").select("*").eq("client_id", profile.id).eq("date", date),
      supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id", profile.id).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([h, c, hl, plan]) => {
      const hs = h.data || [];
      setHabits(hs);
      setPlanTarget(plan.data || {});
      setExisting(c.data || null);
      setForm(c.data ? {
        weight: c.data.weight ?? "", calories: c.data.calories ?? "", protein_g: c.data.protein_g ?? "", carbs_g: c.data.carbs_g ?? "",
        fats_g: c.data.fats_g ?? "", water: c.data.water ?? "", sleep_hours: c.data.sleep_hours ?? "", energy: c.data.energy ?? 7, mood: c.data.mood ?? 7,
        steps: c.data.steps ?? "", diet: c.data.diet || "On track", workout: c.data.workout || "completed",
      } : EMPTY_FORM);
      const drafts = {};
      hs.forEach((hb) => {
        const log = (hl.data || []).find((l) => l.habit_id === hb.id);
        drafts[hb.id] = { done: log?.done || false, value: log?.value ?? "" };
      });
      setHabitDrafts(drafts);
      setReady(true);
    });
  }, [profile.id, date]);

  if (!ready) return <div className="spinner" style={{ margin: "80px auto" }} />;

  // Only show a manual Steps field if no habit already covers it — a
  // coach-assigned "steps" manual_value habit IS the steps entry, so this
  // is never asked twice.
  const stepsHabit = habits.find((h) => h.type === "manual_value" && h.metric_key === "steps");

  const liveLogs = habits.filter((h) => h.type !== "linked_check_in_value").map((h) => {
    const d = habitDrafts[h.id] || {};
    return { habit_id: h.id, date, done: !!d.done, value: d.value === "" || d.value == null ? null : Number(d.value) };
  });
  const liveCheckin = { ...form, diet: form.diet, workout: form.workout };
  const completion = todayCompletionFrom({ habits, habitLogs: liveLogs, checkin: liveCheckin, date });

  if (saved) return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ background: "rgba(0,201,167,.14)", color: S.accent2, padding: "16px 32px", display: "inline-flex", fontSize: 16, fontWeight: 600 }}>Check-in Submitted</div>
    </div>
  );

  const submit = async () => {
    if (!isWithinBackdateWindow(date, BACKDATE_DAYS)) return;
    setSaving(true);
    const num = (v) => { if (v === "" || v == null) return null; const n = parseFloat(v); return Number.isNaN(n) ? null : n; };
    const entry = {
      client_id: profile.id, date, submitted_date: todayStr(),
      weight: num(form.weight), calories: num(form.calories), protein_g: num(form.protein_g), carbs_g: num(form.carbs_g),
      fats_g: num(form.fats_g), water: num(form.water), sleep_hours: num(form.sleep_hours), energy: form.energy, mood: form.mood,
      steps: num(form.steps), diet: form.diet, workout: form.workout,
    };
    if (existing) await supabase.from("daily_checkins").update(entry).eq("id", existing.id);
    else await supabase.from("daily_checkins").insert(entry);

    const writable = habits.filter((h) => h.type !== "linked_check_in_value");
    await Promise.all(writable.map((h) => {
      const draft = habitDrafts[h.id] || {};
      const value = h.type === "manual_value" ? num(draft.value) : null;
      const done = h.type === "manual_value" ? isHabitSatisfied(h, { value }) : !!draft.done;
      return supabase.from("habit_logs").upsert({ client_id: profile.id, habit_id: h.id, date, done, value }, { onConflict: "habit_id,date" });
    }));

    setSaved(true); setSaving(false); setTimeout(onDone, 1400);
  };

  return (
    <div>
      <PageTitle title="Today" sub={date} />
      <Card style={{ marginBottom: 20 }}>
        <BackdateField value={logDate} min={minBackdate} onChange={setLogDate} label="Logging for" />
      </Card>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: S.muted, marginBottom: 6 }}>Daily check-in · {completion.done} of {completion.total} complete · {completion.pct}% complete</div>
        <div style={{ height: 4, background: S.surface2, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: completion.pct + "%", height: "100%", background: S.accent, transition: "width .3s" }} />
        </div>
      </div>

      {habits.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <CardTitle>Daily Targets</CardTitle>
          </div>
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 10 }}>Set by your coach</div>
          {habits.map((h) => (
            <TargetRow key={h.id} habit={h} planTarget={planTarget[h.linked_field]} draft={habitDrafts[h.id]}
              onChangeDraft={(d) => setHabitDrafts((p) => ({ ...p, [h.id]: d }))}
              checkinValue={h.type === "linked_check_in_value" ? form[h.linked_field] : undefined} />
          ))}
          <div style={{ padding: "12px 4px 0" }}>
            <div style={{ fontSize: 13, color: S.text, marginBottom: 8 }}>Workout</div>
            <RG options={["completed", "rest", "missed"]} value={form.workout} onChange={(v) => set("workout", v)} cap />
          </div>
        </Card>
      )}
      {habits.length === 0 && (
        <Card style={{ marginBottom: 20 }}>
          <CardTitle>Workout</CardTitle>
          <RG options={["completed", "rest", "missed"]} value={form.workout} onChange={(v) => set("workout", v)} cap />
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <CardTitle>Daily Check-In</CardTitle>
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>Enter your values for today</div>
        <div className="cg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Fld label="Weight (lbs)"><Inp type="number" step="0.1" value={form.weight} onChange={(e) => set("weight", e.target.value)} placeholder="185.0" /></Fld>
          <Fld label="Sleep (hours)"><Inp type="number" step="0.5" value={form.sleep_hours} onChange={(e) => set("sleep_hours", e.target.value)} placeholder="e.g. 7.5" /></Fld>
          <Fld label="Calories"><Inp type="number" value={form.calories} onChange={(e) => set("calories", e.target.value)} placeholder="e.g. 2200" /></Fld>
          <Fld label="Protein (g)"><Inp type="number" value={form.protein_g} onChange={(e) => set("protein_g", e.target.value)} placeholder="e.g. 180" /></Fld>
          <Fld label="Carbs (g)"><Inp type="number" value={form.carbs_g} onChange={(e) => set("carbs_g", e.target.value)} placeholder="e.g. 220" /></Fld>
          <Fld label="Fats (g)"><Inp type="number" value={form.fats_g} onChange={(e) => set("fats_g", e.target.value)} placeholder="e.g. 70" /></Fld>
          <Fld label="Water (glasses)"><Inp type="number" value={form.water} onChange={(e) => set("water", e.target.value)} placeholder="e.g. 8" /></Fld>
          {!stepsHabit && <Fld label="Steps (optional)"><Inp type="number" value={form.steps} onChange={(e) => set("steps", e.target.value)} placeholder="e.g. 9000" /></Fld>}
          <Sld label="Energy" val={form.energy} min={1} max={10} sfx="/10" onChange={(v) => set("energy", v)} />
          <Sld label="Mood" val={form.mood} min={1} max={10} sfx="/10" onChange={(v) => set("mood", v)} />
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardTitle>Nutrition</CardTitle>
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 10 }}>How closely did you stay to your nutrition target today?</div>
        <RG options={["On track", "Mostly clean", "Struggled", "Off plan"]} value={form.diet} onChange={(v) => set("diet", v)} />
      </Card>

      <Btn onClick={submit} disabled={saving}>{saving ? "Saving..." : "Complete Today"}</Btn>
    </div>
  );
}
