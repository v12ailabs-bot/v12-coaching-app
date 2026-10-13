import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS, todayStr } from "../../theme.jsx";
import { Card, CardTitle, Btn, Fld, Inp } from "../../components/ui/index.js";

// Saved meals: build a meal once (a prepped lunch, a go-to breakfast) and log it
// into today's Breakfast/Lunch/etc. with one tap instead of retyping it. Stores
// the meal's totals only, and logging writes the same meal_logs row manual entry
// does (upsert on client/date/meal), so every daily/weekly total, chart and coach
// view picks it up unchanged. Works for coaching and Program Only alike.
const num = (v) => (v === "" || v == null ? null : Number(v));
const FIELDS = [["calories", "Calories"], ["protein_g", "Protein (g)"], ["carbs_g", "Carbs (g)"], ["fats_g", "Fats (g)"]];
const macroLine = (m) => [m.calories != null && `${Math.round(m.calories)} kcal`, m.protein_g != null && `${Math.round(m.protein_g)}p`, m.carbs_g != null && `${Math.round(m.carbs_g)}c`, m.fats_g != null && `${Math.round(m.fats_g)}f`].filter(Boolean).join(" · ");

// Pre-select the slot that matches the time of day.
const defaultSlot = (slots) => {
  const h = new Date().getHours();
  const want = h < 10 ? "Breakfast" : h < 15 ? "Lunch" : h < 21 ? "Dinner" : "Evening Snack";
  return slots.includes(want) ? want : slots[0];
};

export function SavedMealsCard({ profile, slots, mealLogs, entries, simple, onLogged, refreshKey = 0 }) {
  const [meals, setMeals] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | meal
  const [form, setForm] = useState({ name: "", calories: "", protein_g: "", carbs_g: "", fats_g: "" });
  const [slotFor, setSlotFor] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from("saved_meals").select("*").eq("client_id", profile.id).order("name");
    if (error) { setMeals([]); setMsg({ ok: false, text: "Saved meals aren't set up yet." }); return; }
    setMeals(data || []);
  };
  useEffect(() => { load(); }, [profile.id, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (m) => { setEditing(m); setMsg(null); setForm({ name: m.name || "", calories: m.calories ?? "", protein_g: m.protein_g ?? "", carbs_g: m.carbs_g ?? "", fats_g: m.fats_g ?? "" }); };
  const save = async () => {
    setBusy(true); setMsg(null);
    const row = { client_id: profile.id, name: form.name.trim(), calories: num(form.calories), protein_g: num(form.protein_g), carbs_g: num(form.carbs_g), fats_g: num(form.fats_g) };
    const { error } = editing?.id ? await supabase.from("saved_meals").update(row).eq("id", editing.id) : await supabase.from("saved_meals").insert(row);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setEditing(null); load();
  };
  const remove = async (m) => {
    if (!window.confirm(`Delete "${m.name}"? Meals you already logged stay.`)) return;
    await supabase.from("saved_meals").delete().eq("id", m.id);
    load();
  };

  const logIt = async (m) => {
    const slot = slotFor[m.id] || defaultSlot(slots);
    const existing = mealLogs.find((l) => l.meal === slot);
    if (existing && entries.some((e) => e.meal_log_id === existing.id)) { setMsg({ ok: false, text: `${slot} was built from searched foods. Edit it there, or pick another meal slot.` }); return; }
    if (existing && (existing.calories != null || existing.protein_g != null) && !window.confirm(`${slot} already has ${existing.calories ?? "—"} kcal logged. Replace it with "${m.name}"?`)) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.from("meal_logs").upsert({
      client_id: profile.id, date: todayStr(), meal: slot,
      calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fats_g: m.fats_g,
    }, { onConflict: "client_id,date,meal" }).select().maybeSingle();
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    onLogged(data, slot);
    setMsg({ ok: true, text: `Logged "${m.name}" to ${slot}.` });
  };

  if (meals == null) return null;
  const fields = FIELDS; // carbs and fats are available to every tier here
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <CardTitle style={{ margin: 0 }}>Saved Meals</CardTitle>
        {!editing && <Btn sm teal onClick={() => startEdit({})}>+ New meal</Btn>}
      </div>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 10 }}>Meal prepping? Save a meal once, then tap "Log meal" any day to log it to Today, your weekly totals and your Wellness charts.</div>
      {editing && (
        <div style={{ border: "1px solid " + S.border, borderRadius: RADIUS.md, padding: 12, marginBottom: 12 }}>
          <Fld label="Meal name"><Inp value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Chicken rice bowl" /></Fld>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {fields.map(([k, label]) => <div key={k} style={{ flex: "1 1 110px" }}><Fld label={label}><Inp type="number" value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} placeholder="0" /></Fld></div>)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} disabled={busy || !form.name.trim() || (form.calories === "" && form.protein_g === "")}>{busy ? "Saving..." : "Save meal"}</Btn>
            <Btn onClick={() => setEditing(null)} disabled={busy}>Cancel</Btn>
          </div>
        </div>
      )}
      {meals.length === 0 && !editing && <div style={{ fontSize: 12, color: S.muted }}>No saved meals yet. Tap "+ New meal", or use "Save as meal" next to anything you've already logged today.</div>}
      {meals.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid " + S.border }}>
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
            <div style={{ fontSize: 11, color: S.muted }}>{macroLine(m) || "No macros"}</div>
          </div>
          <select value={slotFor[m.id] || defaultSlot(slots)} onChange={(e) => setSlotFor((p) => ({ ...p, [m.id]: e.target.value }))} style={{ background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 10px", fontSize: 13 }}>
            {slots.map((s) => <option key={s}>{s}</option>)}
          </select>
          <Btn sm teal onClick={() => logIt(m)} disabled={busy}>Log meal</Btn>
          <button type="button" onClick={() => startEdit(m)} style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 12 }}>Edit</button>
          <button type="button" onClick={() => remove(m)} title="Delete" style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      ))}
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</div>}
    </Card>
  );
}
