import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, localDateStr } from "../../theme.jsx";
import { Card, CardTitle, Btn, ProgressRing } from "../../components/ui/index.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function MacroBar({ label, logged, target, color }) {
  if (target == null) return null;
  const pct = clamp(((logged || 0) / target) * 100, 0, 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: S.muted, marginBottom: 5 }}>
        <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span>{Math.round(logged || 0)} / {target}g</span>
      </div>
      <div style={{ height: 6, background: S.surface2, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: color, transition: "width .3s" }} />
      </div>
    </div>
  );
}

// Targets come from nutrition_plans (existing, coach-set daily target);
// logged macros are the SUM of this week's daily_checkins self-reports
// (existing self-report columns, entered once per day at check-in — not a
// live in-app food log). Framed as a weekly target (daily × 7) against the
// week's running total instead of a single day's "remaining," since that's
// what the underlying data actually represents.
export function NutritionMacroBars({ profile, checkins, setPage }) {
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

  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return localDateStr(d); })();
  const weekCheckins = (checkins || []).filter((c) => c.date >= weekStart);
  const loggedSum = (key) => weekCheckins.reduce((s, c) => s + (Number(c[key]) || 0), 0);
  const loggedCalories = loggedSum("calories");

  const weeklyTarget = (daily) => (daily == null ? null : daily * 7);
  const calorieTarget = weeklyTarget(plan.calories);
  const ringPct = calorieTarget ? clamp((loggedCalories / calorieTarget) * 100, 0, 100) : 0;

  return (
    <Card>
      <CardTitle>Nutrition Targets</CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14, lineHeight: 1.5 }}>This week's self-reported totals vs. your weekly target — logged once per day at check-in, not a live food log.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        {calorieTarget != null && (
          <ProgressRing value={ringPct} size={100} color={loggedCalories > calorieTarget ? S.danger : S.success}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: S.text, lineHeight: 1 }}>{Math.round(loggedCalories)}</div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, textAlign: "center" }}>of {calorieTarget} cal/wk</div>
          </ProgressRing>
        )}
        <div style={{ flex: 1, minWidth: 180 }}>
          <MacroBar label="Protein" logged={loggedSum("protein_g")} target={weeklyTarget(plan.protein_g)} color={S.success} />
          <MacroBar label="Carbs" logged={loggedSum("carbs_g")} target={weeklyTarget(plan.carbs_g)} color={S.accent2} />
          <MacroBar label="Fats" logged={loggedSum("fats_g")} target={weeklyTarget(plan.fats_g)} color={S.warning} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}><Btn sm onClick={() => setPage("nutrition")}>View Nutrition Log</Btn></div>
    </Card>
  );
}
