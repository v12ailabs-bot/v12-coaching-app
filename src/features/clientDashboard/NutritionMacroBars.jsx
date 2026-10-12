import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, localDateStr } from "../../theme.jsx";
import { Card, CardTitle, Btn, ProgressRing } from "../../components/ui/index.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lighten = { [S.success]: "#7DF0A8", [S.accent2]: "#7FD8FF", [S.warning]: "#FFD27A" };

// A macro as a glowing gradient bar with its logged grams, target and percent.
function MacroBar({ label, logged, target, color }) {
  if (target == null) return null;
  const raw = ((logged || 0) / target) * 100;
  const pct = clamp(raw, 0, 100);
  const over = raw > 105;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: S.muted }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />{label}
        </span>
        <span style={{ fontSize: 12, color: S.muted }}><b style={{ color: over ? S.danger : S.text, fontSize: 15 }}>{Math.round(logged || 0)}</b> / {target}g <span style={{ color: over ? S.danger : color, fontWeight: 700 }}>· {Math.round(raw)}%</span></span>
      </div>
      <div style={{ height: 10, background: "rgba(255,255,255,.06)", borderRadius: 5, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", borderRadius: 5, background: over ? `linear-gradient(90deg, ${S.danger}, #ff8a80)` : `linear-gradient(90deg, ${color}, ${lighten[color] || color})`, boxShadow: `0 0 12px ${over ? S.danger : color}66`, transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
    </div>
  );
}

// Calorie ring with a gradient stroke; the number in the middle is what you've logged this week.
function CalorieRing({ logged, target }) {
  const size = 140, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = clamp((logged / target) * 100, 0, 100);
  const over = logged > target;
  const left = Math.round(target - logged);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="v12CalGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={over ? S.danger : S.accent} /><stop offset="100%" stopColor={over ? "#ff8a80" : "#ffb36b"} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#v12CalGrad)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 6px ${over ? S.danger : S.accent}88)` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, lineHeight: 1, color: S.text }}>{Math.round(logged)}</div>
        <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, marginTop: 2 }}>cal logged</div>
        <div style={{ fontSize: 11, color: over ? S.danger : S.accent2, marginTop: 4, fontWeight: 600 }}>{over ? `${Math.abs(left)} over` : `${left} left`}</div>
      </div>
    </div>
  );
}

// This week as seven small columns against the daily calorie target.
function WeekColumns({ days, dailyTarget }) {
  const max = Math.max(dailyTarget * 1.3, ...days.map((d) => d.cal || 0));
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 64, position: "relative", marginTop: 4 }}>
      {dailyTarget > 0 && <div style={{ position: "absolute", left: 0, right: 0, bottom: (dailyTarget / max) * 52 + 12, borderTop: "1px dashed rgba(255,255,255,.25)" }} title={`Daily target ${Math.round(dailyTarget)} cal`} />}
      {days.map((d) => {
        const h = d.future ? 0 : clamp(((d.cal || 0) / max) * 52, d.cal ? 3 : 0, 52);
        const over = dailyTarget > 0 && d.cal > dailyTarget * 1.05;
        return (
          <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={d.future ? d.label : `${d.label}: ${Math.round(d.cal || 0)} cal`}>
            <div style={{ width: "100%", height: h || 3, minHeight: 3, borderRadius: 4, background: d.future ? "rgba(255,255,255,.05)" : d.cal ? (over ? S.danger : S.accent) : "rgba(255,255,255,.1)", opacity: d.cal || d.future ? 1 : 0.6, outline: d.today ? "2px solid " + S.text : "none", outlineOffset: 1 }} />
            <span style={{ fontSize: 9, color: d.today ? S.text : S.muted, fontWeight: d.today ? 700 : 400 }}>{d.label[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function NutritionMacroBars({ profile, checkins, setPage }) {
  const [plan, setPlan] = useState(null);
  const [mealLogs, setMealLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return localDateStr(d); })();
    Promise.all([
      supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g")
        .eq("client_id", profile.id).eq("active", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("meal_logs").select("date,calories,protein_g,carbs_g,fats_g")
        .eq("client_id", profile.id).gte("date", weekStart),
    ]).then(([{ data: planData }, { data: mealLogData }]) => {
      setPlan(planData || null);
      setMealLogs(mealLogData || []);
      setLoading(false);
    });
  }, [profile.id]);

  if (loading) return null;
  if (!plan) return null;

  const weekStartDate = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d; })();
  const weekStart = localDateStr(weekStartDate);
  const weekCheckins = (checkins || []).filter((c) => c.date >= weekStart);
  const loggedSum = (key) =>
    weekCheckins.reduce((s, c) => s + (Number(c[key]) || 0), 0) +
    mealLogs.reduce((s, m) => s + (Number(m[key]) || 0), 0);
  const loggedCalories = loggedSum("calories");

  const weeklyTarget = (daily) => (daily == null ? null : daily * 7);
  const calorieTarget = weeklyTarget(plan.calories);

  // Seven columns, Sunday..Saturday, from the same check-in + meal-log sums.
  const todayS = localDateStr(new Date());
  const days = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(weekStartDate); d.setDate(d.getDate() + k);
    const date = localDateStr(d);
    const cal = weekCheckins.filter((c) => c.date === date).reduce((a, c) => a + (Number(c.calories) || 0), 0) + mealLogs.filter((m) => m.date === date).reduce((a, m) => a + (Number(m.calories) || 0), 0);
    return { date, cal, label: d.toLocaleDateString(undefined, { weekday: "short" }), future: date > todayS, today: date === todayS };
  });
  const elapsed = days.filter((d) => !d.future).length;
  const expected = plan.calories ? plan.calories * elapsed : null;
  const pace = expected && elapsed > 0 ? loggedCalories / expected : null;
  const paceTone = pace == null ? null : pace > 1.1 ? ["Over pace", S.danger] : pace < 0.8 ? ["Behind pace", S.warning] : ["On pace", S.success];

  return (
    <Card style={{ background: "linear-gradient(135deg, " + S.surface + " 0%, rgba(255,106,0,.07) 100%)", border: "1px solid rgba(255,106,0,.28)", boxShadow: "0 0 24px rgba(255,106,0,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <CardTitle style={{ margin: 0 }}>Nutrition · This Week</CardTitle>
        {paceTone && <span style={{ fontSize: 11, fontWeight: 700, color: paceTone[1], border: "1px solid " + paceTone[1], borderRadius: 20, padding: "3px 12px", boxShadow: `0 0 10px ${paceTone[1]}33` }}>{paceTone[0]}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
        {calorieTarget != null && <CalorieRing logged={loggedCalories} target={calorieTarget} />}
        <div style={{ flex: 1, minWidth: 200 }}>
          <MacroBar label="Protein" logged={loggedSum("protein_g")} target={weeklyTarget(plan.protein_g)} color={S.success} />
          <MacroBar label="Carbs" logged={loggedSum("carbs_g")} target={weeklyTarget(plan.carbs_g)} color={S.accent2} />
          <MacroBar label="Fats" logged={loggedSum("fats_g")} target={weeklyTarget(plan.fats_g)} color={S.warning} />
        </div>
      </div>
      {plan.calories != null && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>Daily calories vs your {Math.round(plan.calories)} target</div>
          <WeekColumns days={days} dailyTarget={plan.calories} />
        </div>
      )}
      <div style={{ fontSize: 11, color: S.muted, marginTop: 12, lineHeight: 1.5 }}>Your logged check-in numbers and meals, added up for this week against your weekly targets.</div>
      <div style={{ marginTop: 12 }}><Btn sm onClick={() => setPage("nutrition")}>View Nutrition Log</Btn></div>
    </Card>
  );
}
