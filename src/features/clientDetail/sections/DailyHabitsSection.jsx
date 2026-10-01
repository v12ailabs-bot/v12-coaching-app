import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Inp, Btn, Fld, RG, StatusBadge } from "../../../components/ui/index.js";

const TYPE_LABELS = { completion_button: "Checkbox", manual_value: "Manual number", linked_check_in_value: "From check-in" };
const TYPE_OPTIONS = Object.values(TYPE_LABELS);
const typeFromLabel = (label) => Object.keys(TYPE_LABELS).find((k) => TYPE_LABELS[k] === label) || "completion_button";

const LINKED_FIELD_LABELS = { calories: "Calories", protein_g: "Protein", carbs_g: "Carbs", fats_g: "Fat", water: "Water" };
const MACRO_FIELDS = ["calories", "protein_g", "carbs_g", "fats_g"];
const DIRECTION_LABELS = { at_least: "At least", at_most: "At most" };

function typeBadge(h, planTarget) {
  if (h.type === "manual_value") return `${h.target_value ?? "—"}${h.unit || ""}`;
  if (h.type === "linked_check_in_value") {
    const target = MACRO_FIELDS.includes(h.linked_field) ? planTarget : h.target_value;
    return `${LINKED_FIELD_LABELS[h.linked_field] || h.linked_field} · ${target ?? "—"}${h.unit || ""}`;
  }
  return "Checkbox";
}

// Shared fields for both the add form and the inline edit form.
function HabitFields({ form, setForm }) {
  const isManual = form.type === "manual_value";
  const isLinked = form.type === "linked_check_in_value";
  const linkedIsMacro = isLinked && MACRO_FIELDS.includes(form.linked_field);
  return (
    <>
      <Fld label="Type">
        <RG options={TYPE_OPTIONS} value={TYPE_LABELS[form.type]} onChange={(label) => setForm((p) => ({ ...p, type: typeFromLabel(label) }))} />
      </Fld>
      {isLinked && (
        <Fld label="Linked check-in field">
          <RG options={Object.values(LINKED_FIELD_LABELS)} value={LINKED_FIELD_LABELS[form.linked_field] || ""} onChange={(label) => {
            const field = Object.keys(LINKED_FIELD_LABELS).find((k) => LINKED_FIELD_LABELS[k] === label);
            setForm((p) => ({ ...p, linked_field: field }));
          }} />
        </Fld>
      )}
      {linkedIsMacro && (
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>Target pulled from this client's nutrition plan — edit it on the Nutrition tab, not here.</div>
      )}
      {(isManual || (isLinked && !linkedIsMacro)) && (
        <div style={{ display: "flex", gap: 10 }}>
          <Fld label="Target value"><Inp type="number" value={form.target_value} onChange={(e) => setForm((p) => ({ ...p, target_value: e.target.value }))} placeholder="e.g. 8000" /></Fld>
          <Fld label="Unit"><Inp type="text" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} placeholder="e.g. steps" /></Fld>
        </div>
      )}
      {(isManual || (isLinked && !linkedIsMacro)) && (
        <Fld label="Direction">
          <RG options={Object.values(DIRECTION_LABELS)} value={DIRECTION_LABELS[form.target_direction]} onChange={(label) => {
            const dir = Object.keys(DIRECTION_LABELS).find((k) => DIRECTION_LABELS[k] === label);
            setForm((p) => ({ ...p, target_direction: dir }));
          }} />
        </Fld>
      )}
      {isManual && (
        <Fld label="Metric key (optional)">
          <Inp type="text" value={form.metric_key} onChange={(e) => setForm((p) => ({ ...p, metric_key: e.target.value }))} placeholder="e.g. steps" />
          <div style={{ fontSize: 11, color: S.muted, marginTop: 6 }}>Type exactly "steps" here if this habit tracks step count — the client's Today screen uses this to avoid asking for steps twice.</div>
        </Fld>
      )}
    </>
  );
}

const EMPTY_FORM = { name: "", type: "completion_button", target_value: "", unit: "", target_direction: "at_least", linked_field: "calories", metric_key: "" };

// Coach defines the client's daily habits; the client checks them off (or
// enters a value, or reads it live off their check-in — see habit `type`).
// `embedded` skips the outer Card/title so this can nest inside another
// card (e.g. DailyHabitsPanel's combined manage+adherence layout) without a
// redundant double border/title. `onChanged` lets a parent showing adherence
// data alongside this list refresh after an add/remove/edit.
export function CoachHabits({ clientId, embedded = false, onChanged }) {
  const [habits, setHabits] = useState([]);
  const [planTarget, setPlanTarget] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("habits").select("*").eq("client_id", clientId).eq("active", true).order("order_index");
    setHabits(data || []);
    const { data: plan } = await supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id", clientId).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setPlanTarget(plan ? { calories: plan.calories, protein_g: plan.protein_g, carbs_g: plan.carbs_g, fats_g: plan.fats_g } : {});
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const toRow = (f) => ({
    type: f.type,
    target_value: f.type !== "completion_button" && f.target_value !== "" ? Number(f.target_value) : null,
    unit: f.type !== "completion_button" ? (f.unit || null) : null,
    target_direction: f.target_direction || "at_least",
    linked_field: f.type === "linked_check_in_value" ? f.linked_field : null,
    metric_key: f.type === "manual_value" && f.metric_key.trim() ? f.metric_key.trim() : null,
  });

  const add = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from("habits").insert({ client_id: clientId, name: form.name.trim(), order_index: habits.length, ...toRow(form) });
    setForm(EMPTY_FORM); setSaving(false); load(); onChanged?.();
  };
  const remove = async (h) => {
    await supabase.from("habits").update({ active: false }).eq("id", h.id);
    load(); onChanged?.();
  };
  const startEdit = (h) => {
    setEditingId(h.id);
    setEditForm({ name: h.name, type: h.type || "completion_button", target_value: h.target_value ?? "", unit: h.unit || "", target_direction: h.target_direction || "at_least", linked_field: h.linked_field || "calories", metric_key: h.metric_key || "" });
  };
  const saveEdit = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    await supabase.from("habits").update({ name: editForm.name.trim(), ...toRow(editForm) }).eq("id", editingId);
    setEditingId(null); setSaving(false); load(); onChanged?.();
  };

  const body = (
    <>
      {!embedded && <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>These appear on the client's Today screen each day.</div>}
      {habits.length === 0 && <div style={{ color: S.muted, fontSize: 13, marginBottom: 12 }}>No habits set yet.</div>}
      {habits.map((h) => (
        <div key={h.id} style={{ padding: "9px 0", borderBottom: "1px solid " + S.border }}>
          {editingId === h.id ? (
            <div style={{ padding: "6px 0 10px" }}>
              <Fld label="Name"><Inp type="text" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></Fld>
              <HabitFields form={editForm} setForm={setEditForm} />
              <div style={{ display: "flex", gap: 10 }}>
                <Btn sm onClick={saveEdit} disabled={saving}>{saving ? "..." : "Save"}</Btn>
                <button onClick={() => setEditingId(null)} style={{ padding: "7px 14px", fontSize: 10, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{h.name}</div>
                <div style={{ marginTop: 4 }}><StatusBadge label={typeBadge(h, planTarget[h.linked_field])} tone="neutral" /></div>
              </div>
              <button onClick={() => startEdit(h)} style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Edit</button>
              <button onClick={() => remove(h)} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Remove</button>
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: 14 }}>
        <Fld label="Name"><Inp type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. 10k steps, Protein target" onKeyDown={(e) => e.key === "Enter" && add()} /></Fld>
        <HabitFields form={form} setForm={setForm} />
        <Btn sm onClick={add} disabled={saving}>{saving ? "..." : "+ Add Habit"}</Btn>
      </div>
    </>
  );

  if (embedded) return body;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Manage Habits</CardTitle>
      {body}
    </Card>
  );
}
