import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, CardTitle, Btn, ProgressRing } from "../../components/ui/index.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function MacroBar({ label, logged, target, color }) {
  if (target == null) return null;
  const pct = clamp(((logged || 0) / target) * 100, 0, 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: S.muted, marginBottom: 5 }}>
        <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span>{logged || 0} / {target}g</span>
      </div>
      <div style={{ height: 6, background: S.surface2, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: color, transition: "width .3s" }} />
      </div>
    </div>
  );
}

// Targets come from nutrition_plans (existing, coach-set); logged macros come
// from today's daily_checkins row (existing self-report columns) — no new data.
export function NutritionMacroBars({ profile, todayCheckin, setPage }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g")
      .eq("client_id", profile.id).eq("active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { setPlan(data || null); setLoading(false); });
  }, [profile.id]);

  if (loading) return null;
  if (!plan) return null;

  const remaining = plan.calories != null ? plan.calories - (todayCheckin?.calories || 0) : null;
  const ringPct = plan.calories ? clamp((remaining / plan.calories) * 100, 0, 100) : 0;

  return (
    <Card>
      <CardTitle>Nutrition Targets</CardTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        {plan.calories != null && (
          <ProgressRing value={ringPct} size={100} color={remaining < 0 ? S.danger : S.success}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: S.text, lineHeight: 1 }}>{remaining}</div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted }}>Cal Remaining</div>
          </ProgressRing>
        )}
        <div style={{ flex: 1, minWidth: 180 }}>
          <MacroBar label="Protein" logged={todayCheckin?.protein_g} target={plan.protein_g} color={S.success} />
          <MacroBar label="Carbs" logged={todayCheckin?.carbs_g} target={plan.carbs_g} color={S.accent2} />
          <MacroBar label="Fats" logged={todayCheckin?.fats_g} target={plan.fats_g} color={S.warning} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("nutrition")}>View Nutrition Log</Btn></div>
    </Card>
  );
}
