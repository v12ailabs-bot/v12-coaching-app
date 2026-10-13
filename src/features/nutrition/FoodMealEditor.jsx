import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, todayStr } from "../../theme.jsx";
import { Inp, Btn } from "../../components/ui/index.js";
import { toGrams, parseHouseholdMeasures, unitOptions } from "../../lib/householdMeasures.js";
import { computeNutrients, sumNutrient, validateQuantityG, formatKcal, formatMacro } from "../../lib/foodMath.js";

// Ingredient-level logging for one meal slot. Search hits the debounced
// search_foods() RPC (never the whole library). Each line's nutrients are
// computed with exact decimal math from the food's per-100 g values; on save the
// database recomputes from its own snapshot, so history never changes when the
// library is edited. meal_logs totals are kept in sync by a DB trigger, so every
// existing reader (daily/weekly widgets, coach views) sees the new numbers
// without being changed.

const REC_TYPES = ["Ingredient", "Prepared dish", "Packaged product"];

export const foodLabel = (f) =>
  [f.food_name || f.name, f.state, f.cooking_method, f.canned_liquid].filter(Boolean).join(" · ");

const per100Of = (f) => ({
  kcal: f.kcal_per_100g, protein: f.protein_per_100g, carbs: f.carbs_per_100g, fat: f.fat_per_100g,
});

// Loads a slot's entries (oldest first). Returns [] if the table doesn't exist
// yet (migration not applied) so legacy manual logging keeps working.
export async function loadEntries(mealLogIds) {
  if (!mealLogIds.length) return [];
  const { data, error } = await supabase.from("meal_log_entries").select("*").in("meal_log_id", mealLogIds).order("created_at");
  return error ? [] : data || [];
}

export function FoodMealEditor({ profile, mealLabel, existing, entries, onSaved, onCancel }) {
  // Draft lines: saved entries carry id; new ones carry only food + qty.
  // A slot with legacy manual numbers and no entries yet shows them as a fixed
  // "Manual entry" line (the database preserves them the same way on first add).
  const [lines, setLines] = useState(() => {
    // A saved entry remembers what the client typed (e.g. 1.5 cup) alongside the
    // grams it was converted to; older entries have no unit and show as grams.
    const saved = entries.map((e) => ({ key: e.id, id: e.id, entry: e, qty: e.quantity_g == null ? "" : String(e.quantity_g), measures: {},
      ...(e.entered_unit && e.entered_quantity != null ? { unit: e.entered_unit, amount: String(Number(e.entered_quantity)) } : {}) }));
    const hasLegacy = existing && [existing.calories, existing.protein_g, existing.carbs_g, existing.fats_g].some((v) => v != null);
    if (saved.length === 0 && hasLegacy) {
      saved.push({ key: "legacy", legacy: true, qty: "", entry: { food_id: null, food_name: "Manual entry", kcal: existing.calories, protein_g: existing.protein_g, carbs_g: existing.carbs_g, fat_g: existing.fats_g } });
    }
    return saved;
  });
  const [removed, setRemoved] = useState([]);
  const [q, setQ] = useState("");
  const [recType, setRecType] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const reqId = useRef(0);
  const qtyRefs = useRef({});

  useEffect(() => {
    const term = q.trim();
    setSearchErr("");
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const my = ++reqId.current;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_foods", { q: term, rec_type: recType || null, region: null, lim: 15 });
      if (my !== reqId.current) return; // a newer keystroke superseded this one
      setSearching(false);
      if (error) { setSearchErr("Food search isn't available right now — you can still log manually."); setResults([]); return; }
      setResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, recType]);

  const addFood = (f) => {
    const dup = lines.find((l) => !l.id && l.food?.id === f.id);
    if (dup) {
      setNotice(`${foodLabel(f)} is already in this meal — adjust its quantity.`);
      qtyRefs.current[dup.key]?.focus();
      return;
    }
    const key = "new-" + f.id;
    setNotice("");
    setLines((p) => [...p, { key, food: f, qty: "", measures: parseHouseholdMeasures(f.household_measures) }]);
    setQ(""); setResults([]);
    setTimeout(() => qtyRefs.current[key]?.focus(), 0);
  };

  // The client can enter an amount in g, oz or lb; everything downstream (the
  // live preview, validation, and what is saved) still works in exact grams,
  // so converting here never changes how the database computes nutrients.
  const setQty = (key, v, unit) => setLines((p) => p.map((l) => {
    if (l.key !== key) return l;
    const u = unit || l.unit || "g";
    return { ...l, unit: u, amount: v, qty: toGrams(v, u, l.measures) };
  }));

  // Saved entries only snapshot nutrients, so fetch each food's household
  // measures to offer its units again when a meal is reopened.
  useEffect(() => {
    const ids = [...new Set(entries.map((e) => e.food_id).filter(Boolean))];
    if (!ids.length) return;
    supabase.from("foods").select("id,household_measures").in("id", ids).then(({ data, error }) => {
      if (error || !data) return;
      const byId = Object.fromEntries(data.map((f) => [f.id, parseHouseholdMeasures(f.household_measures)]));
      setLines((p) => p.map((l) => (l.entry?.food_id && byId[l.entry.food_id] ? { ...l, measures: byId[l.entry.food_id] } : l)));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const removeLine = (l) => {
    setLines((p) => p.filter((x) => x.key !== l.key));
    if (l.id) setRemoved((p) => [...p, l.id]);
  };

  // Per-line nutrients. Saved library entries use their own snapshot (what the
  // database will recompute from); manual/quick-add lines carry fixed totals.
  const calc = (l) => {
    if (l.entry && l.entry.food_id == null) {
      return { kcal: l.entry.kcal, protein: l.entry.protein_g, carbs: l.entry.carbs_g, fat: l.entry.fat_g };
    }
    const src = l.entry || l.food;
    return computeNutrients(per100Of(src), l.qty);
  };
  const computed = lines.map((l) => ({ l, n: calc(l) }));
  const totals = {
    kcal: sumNutrient(computed.map((c) => c.n.error ? null : c.n.kcal)),
    protein: sumNutrient(computed.map((c) => c.n.error ? null : c.n.protein)),
    carbs: sumNutrient(computed.map((c) => c.n.error ? null : c.n.carbs)),
    fat: sumNutrient(computed.map((c) => c.n.error ? null : c.n.fat)),
  };
  const editable = lines.filter((l) => !(l.entry && l.entry.food_id == null));
  const hasInvalid = editable.some((l) => validateQuantityG(l.qty).error);
  const dirty = removed.length > 0 || lines.some((l) => (!l.id && !l.legacy) || (l.entry && l.entry.food_id != null && Number(l.qty) !== Number(l.entry.quantity_g)));

  // What the client typed, kept next to the grams so a household amount is never
  // mistaken for a weighed one. Grams entries need no extra fields (and this keeps
  // plain gram logging working even before the columns exist).
  const enteredOf = (l) => (l.unit && l.unit !== "g" && l.amount != null && l.amount !== ""
    ? { entered_quantity: Number(l.amount), entered_unit: l.unit } : { entered_quantity: null, entered_unit: null });

  const save = async () => {
    setSaving(true); setSaveErr("");
    try {
      let mealId = existing?.id;
      if (!mealId) {
        const { data, error } = await supabase.from("meal_logs").upsert(
          { client_id: profile.id, date: todayStr(), meal: mealLabel }, { onConflict: "client_id,date,meal" }
        ).select().single();
        if (error) throw error;
        mealId = data.id;
      }
      if (removed.length) {
        const { error } = await supabase.from("meal_log_entries").delete().in("id", removed);
        if (error) throw error;
      }
      for (const l of lines.filter((x) => x.id && x.entry.food_id != null && Number(x.qty) !== Number(x.entry.quantity_g))) {
        const { error } = await supabase.from("meal_log_entries").update({ quantity_g: l.qty, ...enteredOf(l) }).eq("id", l.id);
        if (error) throw error;
      }
      // One at a time on purpose: the trigger that preserves a legacy manual
      // total as its own line fires on the slot's first entry.
      for (const l of lines.filter((x) => !x.id && !x.legacy)) {
        const { error } = await supabase.from("meal_log_entries").insert({
          meal_log_id: mealId, client_id: profile.id, food_id: l.food.id, quantity_g: l.qty, ...enteredOf(l),
        });
        if (error) throw error;
      }
      await finish(mealId);
    } catch (e) {
      // Reload whatever did land so the UI matches the database, then say so.
      setSaveErr("Some changes didn't save: " + (e.message || "unknown error") + ". Showing what's saved.");
      if (existing?.id) await finish(existing.id, true);
      setSaving(false);
    }
  };

  const finish = async (mealId, keepOpen) => {
    const [{ data: row }, fresh] = await Promise.all([
      supabase.from("meal_logs").select("*").eq("id", mealId).maybeSingle(),
      loadEntries([mealId]),
    ]);
    setSaving(false);
    if (keepOpen) {
      setLines(fresh.map((e) => ({ key: e.id, id: e.id, entry: e, qty: e.quantity_g == null ? "" : String(e.quantity_g) })));
      setRemoved([]);
    }
    onSaved(row, fresh, keepOpen);
  };

  const clearMeal = async () => {
    if (!window.confirm(`Remove everything logged for ${mealLabel}?`)) return;
    setSaving(true); setSaveErr("");
    const { error } = await supabase.from("meal_log_entries").delete().eq("meal_log_id", existing.id);
    if (error) { setSaving(false); setSaveErr("Couldn't clear this meal: " + error.message); return; }
    await finish(existing.id);
  };

  const small = { fontSize: 11, color: S.muted };
  return (
    <div style={{ width: "100%", marginTop: 10, border: "1px solid " + S.border, padding: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ flex: "1 1 200px" }}>
          <Inp value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods (e.g. chicken, rice)…" aria-label="Search foods" />
        </div>
        <select value={recType} onChange={(e) => setRecType(e.target.value)} aria-label="Food type"
          style={{ background: S.surface2, color: S.text, border: "1px solid " + S.border, padding: "0 8px", height: 40, fontSize: 12 }}>
          <option value="">All types</option>
          {REC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {q.trim().length >= 2 && (
        <div style={{ border: "1px solid " + S.border, marginBottom: 10, maxHeight: 240, overflowY: "auto" }}>
          {searching && <div style={{ ...small, padding: 10 }}>Searching…</div>}
          {!searching && searchErr && <div style={{ ...small, padding: 10, color: S.danger }}>{searchErr}</div>}
          {!searching && !searchErr && results.length === 0 && (
            <div style={{ ...small, padding: 10 }}>No matching foods. Only verified foods are searchable — you can log this meal manually instead.</div>
          )}
          {results.map((f) => (
            <button key={f.id} onClick={() => addFood(f)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid " + S.border, padding: "10px 12px", cursor: "pointer", color: S.text }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{foodLabel(f)}</div>
              <div style={small}>
                {[f.record_type, f.category, f.brand].filter(Boolean).join(" · ")} — per 100 g: {formatKcal(f.kcal_per_100g)} kcal · P {formatMacro(f.protein_per_100g)} · C {formatMacro(f.carbs_per_100g)} · F {formatMacro(f.fat_per_100g)}
              </div>
            </button>
          ))}
        </div>
      )}

      {notice && <div style={{ ...small, color: S.accent2, marginBottom: 8 }}>{notice}</div>}

      {lines.length === 0 ? (
        <div style={{ ...small, marginBottom: 10 }}>Search above and tap a food to add it, then enter how much you ate in grams, ounces or pounds.</div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {computed.map(({ l, n }) => {
            const manual = l.entry && l.entry.food_id == null;
            const src = l.entry || l.food;
            const err = !manual && validateQuantityG(l.qty).error;
            return (
              <div key={l.key} style={{ padding: "8px 0", borderBottom: "1px solid " + S.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, flex: "1 1 160px" }}>{manual ? (l.entry.food_name || "Manual entry") : foodLabel(src)}</div>
                  {!manual && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input ref={(el) => { qtyRefs.current[l.key] = el; }} type="text" inputMode="decimal" value={l.amount ?? l.qty}
                        onChange={(e) => setQty(l.key, e.target.value)} placeholder="0" aria-label={`Amount of ${src.food_name || src.name}`}
                        style={{ width: 80, background: "transparent", color: S.text, border: "1px solid " + (err && l.qty !== "" ? S.danger : S.border), padding: "8px", fontSize: 14 }} />
                      {(() => {
                        const opts = unitOptions(l.measures);
                        if (l.unit && !opts.some((o) => o.key === l.unit)) opts.push({ key: l.unit, label: l.unit, household: true });
                        return (
                          <select value={l.unit || "g"} onChange={(e) => setQty(l.key, l.amount ?? l.qty, e.target.value)} aria-label="Unit"
                            style={{ background: "transparent", color: S.text, border: "1px solid " + S.border, padding: "8px 6px", fontSize: 13, maxWidth: 150 }}>
                            {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        );
                      })()}
                    </div>
                  )}
                  {!l.legacy && <button onClick={() => removeLine(l)} aria-label="Remove ingredient" style={{ background: "transparent", border: "none", color: S.muted, cursor: "pointer", fontSize: 16 }}>✕</button>}
                </div>
                {err && l.qty !== "" ? (
                  <div style={{ ...small, color: S.danger }}>{err}</div>
                ) : !n.error && (
                  <div style={small}>{l.unit && l.unit !== "g" && l.qty !== "" ? `= ${l.qty} g${unitOptions(l.measures).find((o) => o.key === l.unit)?.household ? " (estimated from the household measure)" : ""} · ` : ""}{manual ? "Manual numbers (kept as logged) — " : ""}{formatKcal(n.kcal)} kcal · P {formatMacro(n.protein)} · C {formatMacro(n.carbs)} · F {formatMacro(n.fat)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, marginBottom: 10 }}>
        <span style={small}>Meal total</span>
        <span><strong>{formatKcal(totals.kcal)}</strong> kcal</span>
        <span><strong>{formatMacro(totals.protein)}</strong>g protein</span>
        <span><strong>{formatMacro(totals.carbs)}</strong>g carbs</span>
        <span><strong>{formatMacro(totals.fat)}</strong>g fat</span>
      </div>

      {saveErr && <div style={{ ...small, color: S.danger, marginBottom: 8 }}>{saveErr}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn sm onClick={save} disabled={saving || !dirty || hasInvalid || (lines.every((l) => l.legacy) && removed.length === 0)}>{saving ? "Saving..." : "Save meal"}</Btn>
        <button onClick={onCancel} style={{ padding: "8px 14px", fontSize: 11, background: "transparent", color: S.muted, border: "1px solid " + S.border, cursor: "pointer" }}>Cancel</button>
        {existing?.id && entries.length > 0 && (
          <button onClick={clearMeal} disabled={saving} style={{ padding: "8px 14px", fontSize: 11, background: "transparent", color: S.muted, border: "1px solid " + S.border, cursor: "pointer", marginLeft: "auto" }}>Clear meal</button>
        )}
      </div>
    </div>
  );
}
