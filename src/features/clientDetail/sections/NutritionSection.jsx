import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn, Fld, Inp, Stat, DayFolder } from "../../../components/ui/index.js";

// The coach's editable view of the client's active nutrition plan. Mirrors the
// exercise editor: adjust macros, guidelines, hydration, and meal structure in
// place and save straight to the plan row — no full regeneration. Refetches when
// refreshKey changes (e.g. after a new program is generated).
const taStyle = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 14, outline: "none", resize: "vertical" };
const numOrNull = (v) => { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export function CoachNutrition({ clientId, refreshKey }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setLoading(true); setEditing(false); setMsg(null);
    supabase
      .from("nutrition_plans")
      .select("*")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { setPlan(data || null); setLoading(false); });
  }, [clientId, refreshKey]);

  const startEdit = () => {
    setMsg(null);
    setDraft({
      name: plan.name || "", calories: plan.calories ?? "", protein_g: plan.protein_g ?? "",
      carbs_g: plan.carbs_g ?? "", fats_g: plan.fats_g ?? "", hydration: plan.hydration || "",
      guidelines: plan.guidelines || "",
      supplements: (Array.isArray(plan.supplements) ? plan.supplements : []).map((s) => ({
        name: s.name || "", dose: s.dose || "", timing: s.timing || "", note: s.note || "",
      })),
      meals: (Array.isArray(plan.meals) ? plan.meals : []).map((m) => ({
        meal: m.meal || "", time: m.time || "", calories: m.calories ?? "", protein_g: m.protein_g ?? "",
        carbs_g: m.carbs_g ?? "", fats_g: m.fats_g ?? "",
        itemsText: (Array.isArray(m.items) ? m.items : []).map((it) => (typeof it === "string" ? it : it?.name || "")).join("\n"),
      })),
    });
    setEditing(true);
  };

  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setMeal = (i, k, v) => setDraft((d) => ({ ...d, meals: d.meals.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));
  const addMeal = () => setDraft((d) => ({ ...d, meals: [...d.meals, { meal: "", time: "", calories: "", protein_g: "", carbs_g: "", fats_g: "", itemsText: "" }] }));
  const removeMeal = (i) => setDraft((d) => ({ ...d, meals: d.meals.filter((_, j) => j !== i) }));
  const setSupplement = (i, k, v) => setDraft((d) => ({ ...d, supplements: d.supplements.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const addSupplement = () => setDraft((d) => ({ ...d, supplements: [...d.supplements, { name: "", dose: "", timing: "", note: "" }] }));
  const removeSupplement = (i) => setDraft((d) => ({ ...d, supplements: d.supplements.filter((_, j) => j !== i) }));

  const save = async () => {
    setSaving(true); setMsg(null);
    const supplements = draft.supplements
      .map((s) => ({ name: s.name.trim(), dose: s.dose.trim() || null, timing: s.timing.trim() || null, note: s.note.trim() || null }))
      .filter((s) => s.name);
    const payload = {
      name: draft.name.trim() || null,
      calories: numOrNull(draft.calories), protein_g: numOrNull(draft.protein_g),
      carbs_g: numOrNull(draft.carbs_g), fats_g: numOrNull(draft.fats_g),
      hydration: draft.hydration.trim() || null, guidelines: draft.guidelines.trim() || null,
      supplements,
      supplements_disclaimer: supplements.length
        ? "General information, not individualized medical or dietetic advice. Check with a doctor before starting any supplement, especially if pregnant, on medication, or managing a health condition."
        : null,
      meals: draft.meals.map((m) => ({
        meal: m.meal.trim() || null, time: m.time.trim() || null,
        calories: numOrNull(m.calories), protein_g: numOrNull(m.protein_g),
        carbs_g: numOrNull(m.carbs_g), fats_g: numOrNull(m.fats_g),
        items: (m.itemsText || "").split("\n").map((s) => s.trim()).filter(Boolean),
      })),
    };
    const { error } = await supabase.from("nutrition_plans").update(payload).eq("id", plan.id);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setPlan((p) => ({ ...p, ...payload }));
    setEditing(false);
    setMsg({ ok: true, text: "Nutrition plan updated." });
  };

  if (loading) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <CardTitle>Nutrition Plan</CardTitle>
        {plan && !editing && <Btn sm teal onClick={startEdit}>Edit Plan</Btn>}
      </div>

      {!plan ? (
        <div style={{ fontSize: 13, color: S.muted }}>No nutrition plan yet. Generate a program to create one.</div>
      ) : editing ? (
        <>
          <Fld label="Plan Name"><Inp type="text" value={draft.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nutrition Plan" /></Fld>
          <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 4 }}>
            <Fld label="Calories (kcal)"><Inp type="number" value={draft.calories} onChange={(e) => setField("calories", e.target.value)} /></Fld>
            <Fld label="Protein (g)"><Inp type="number" value={draft.protein_g} onChange={(e) => setField("protein_g", e.target.value)} /></Fld>
            <Fld label="Carbs (g)"><Inp type="number" value={draft.carbs_g} onChange={(e) => setField("carbs_g", e.target.value)} /></Fld>
            <Fld label="Fats (g)"><Inp type="number" value={draft.fats_g} onChange={(e) => setField("fats_g", e.target.value)} /></Fld>
          </div>
          <Fld label="Hydration"><Inp type="text" value={draft.hydration} onChange={(e) => setField("hydration", e.target.value)} placeholder="e.g. 3–4L water/day" /></Fld>
          <Fld label="Guidelines"><textarea rows={3} value={draft.guidelines} onChange={(e) => setField("guidelines", e.target.value)} style={taStyle} /></Fld>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 8px" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: S.muted }}>Supplements (general, not personalized)</div>
            <Btn sm teal onClick={addSupplement}>+ Add Supplement</Btn>
          </div>
          {draft.supplements.map((s, i) => (
            <div key={i} style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, marginBottom: 12 }}>
              <div className="g2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <Fld label="Name"><Inp type="text" value={s.name} onChange={(e) => setSupplement(i, "name", e.target.value)} placeholder="e.g. Creatine Monohydrate" /></Fld>
                <Fld label="Dose"><Inp type="text" value={s.dose} onChange={(e) => setSupplement(i, "dose", e.target.value)} placeholder="e.g. 5g" /></Fld>
              </div>
              <Fld label="Timing"><Inp type="text" value={s.timing} onChange={(e) => setSupplement(i, "timing", e.target.value)} placeholder="e.g. Daily, any time" /></Fld>
              <Fld label="Note"><Inp type="text" value={s.note} onChange={(e) => setSupplement(i, "note", e.target.value)} placeholder="Why it's included" /></Fld>
              <Btn sm danger onClick={() => removeSupplement(i)}>Remove Supplement</Btn>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 8px" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: S.muted }}>Meals</div>
            <Btn sm teal onClick={addMeal}>+ Add Meal</Btn>
          </div>
          {draft.meals.map((m, i) => (
            <div key={i} style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, marginBottom: 12 }}>
              <div className="g2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <Fld label="Meal"><Inp type="text" value={m.meal} onChange={(e) => setMeal(i, "meal", e.target.value)} placeholder="e.g. Breakfast" /></Fld>
                <Fld label="Time"><Inp type="text" value={m.time} onChange={(e) => setMeal(i, "time", e.target.value)} placeholder="e.g. 8:00 AM" /></Fld>
              </div>
              <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                <Fld label="kcal"><Inp type="number" value={m.calories} onChange={(e) => setMeal(i, "calories", e.target.value)} /></Fld>
                <Fld label="P (g)"><Inp type="number" value={m.protein_g} onChange={(e) => setMeal(i, "protein_g", e.target.value)} /></Fld>
                <Fld label="C (g)"><Inp type="number" value={m.carbs_g} onChange={(e) => setMeal(i, "carbs_g", e.target.value)} /></Fld>
                <Fld label="F (g)"><Inp type="number" value={m.fats_g} onChange={(e) => setMeal(i, "fats_g", e.target.value)} /></Fld>
              </div>
              <Fld label="Items (one per line)"><textarea rows={3} value={m.itemsText} onChange={(e) => setMeal(i, "itemsText", e.target.value)} placeholder={"1 cup oats\n2 whole eggs"} style={taStyle} /></Fld>
              <Btn sm danger onClick={() => removeMeal(i)}>Remove Meal</Btn>
            </div>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
            <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Plan"}</Btn>
            <Btn sm onClick={() => { setEditing(false); setMsg(null); }} disabled={saving}>Cancel</Btn>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : S.danger }}>{msg.text}</span>}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
            {plan.name || "Nutrition Plan"}{plan.created_at ? ` · ${plan.created_at.slice(0, 10)}` : ""}
          </div>
          <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 16 }}>
            <Stat label="Calories" value={plan.calories ?? "—"} unit=" kcal" />
            <Stat label="Protein" value={plan.protein_g ?? "—"} unit="g" />
            <Stat label="Carbs" value={plan.carbs_g ?? "—"} unit="g" />
            <Stat label="Fats" value={plan.fats_g ?? "—"} unit="g" />
          </div>
          {(plan.guidelines || plan.hydration) && (
            <div style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, marginBottom: 16 }}>
              {plan.guidelines && <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: plan.hydration ? 10 : 0 }}>{plan.guidelines}</div>}
              {plan.hydration && <div style={{ fontSize: 13, color: S.accent2 }}>💧 {plan.hydration}</div>}
            </div>
          )}
          {(Array.isArray(plan.meals) ? plan.meals : []).map((m, i) => (
            <DayFolder key={i} title={m.meal || "Meal " + (i + 1)} meta={[m.time, m.calories != null ? `${m.calories} kcal` : null].filter(Boolean).join(" · ")}>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: S.muted, marginBottom: 8, flexWrap: "wrap" }}>
                {m.calories != null && <span>{m.calories} kcal</span>}
                {m.protein_g != null && <span>P {m.protein_g}g</span>}
                {m.carbs_g != null && <span>C {m.carbs_g}g</span>}
                {m.fats_g != null && <span>F {m.fats_g}g</span>}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
                {(Array.isArray(m.items) ? m.items : []).map((it, j) => (
                  <li key={j}>{typeof it === "string" ? it : it?.name || JSON.stringify(it)}</li>
                ))}
              </ul>
            </DayFolder>
          ))}
          {Array.isArray(plan.supplements) && plan.supplements.length > 0 && (
            <div style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, marginTop: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 10 }}>Supplements</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
                {plan.supplements.map((s, i) => (
                  <li key={i}>
                    <strong>{s.name}</strong>{s.dose ? ` — ${s.dose}` : ""}{s.timing ? ` · ${s.timing}` : ""}
                    {s.note && <div style={{ fontSize: 12, color: S.muted }}>{s.note}</div>}
                  </li>
                ))}
              </ul>
              {plan.supplements_disclaimer && <div style={{ fontSize: 11, color: S.muted, marginTop: 10, fontStyle: "italic" }}>{plan.supplements_disclaimer}</div>}
            </div>
          )}
          {msg && <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : S.danger, marginTop: 12 }}>{msg.text}</div>}
        </>
      )}
    </Card>
  );
}
