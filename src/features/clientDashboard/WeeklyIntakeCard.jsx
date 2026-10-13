import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, localDateStr } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { WeekColumns } from "./NutritionMacroBars.jsx";
import { mergeDailyNutrition } from "../../lib/scoring/nutritionAdherence.js";

// Program Only's weekly calories & macros: the same week view coaching clients
// see (NutritionMacroBars' seven day columns) built from the same meal logs and
// check-in numbers, but with NO targets, pace verdicts or plan comparison —
// that stays a coaching feature. Macros only appear if they were actually logged
// (e.g. via "Search foods"), never as zeros.
const wkStart = (offsetWeeks = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay() - offsetWeeks * 7); return d; };
const avg = (rows, k) => { const v = rows.filter((r) => r[k] != null); return v.length ? Math.round(v.reduce((s, r) => s + r[k], 0) / v.length) : null; };

export function WeeklyIntakeCard({ profile }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const from = localDateStr(wkStart(1));
    Promise.all([
      supabase.from("meal_logs").select("date,calories,protein_g,carbs_g,fats_g").eq("client_id", profile.id).gte("date", from),
      supabase.from("daily_checkins").select("date,calories,protein_g,carbs_g,fats_g").eq("client_id", profile.id).gte("date", from),
    ]).then(([{ data: meals }, { data: checks }]) => setRows(mergeDailyNutrition(checks || [], meals || [])));
  }, [profile.id]);
  if (!rows) return null;

  const thisStart = wkStart(0), thisStr = localDateStr(thisStart), todayS = localDateStr(new Date());
  const thisWeek = rows.filter((r) => r.date >= thisStr), lastWeek = rows.filter((r) => r.date < thisStr);
  const days = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(thisStart); d.setDate(d.getDate() + k);
    const date = localDateStr(d);
    return { date, cal: thisWeek.find((r) => r.date === date)?.calories || 0, label: d.toLocaleDateString(undefined, { weekday: "short" }), future: date > todayS, today: date === todayS };
  });
  const total = Math.round(thisWeek.reduce((s, r) => s + (r.calories || 0), 0));
  const stat = (label, value, unit) => value == null ? null : (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}<span style={{ fontSize: 11, color: S.muted }}>{unit}</span></div>
    </div>
  );
  return (
    <Card>
      <CardTitle>This Week · Calories & Macros</CardTitle>
      {thisWeek.length === 0 ? (
        <div style={{ fontSize: 12, color: S.muted }}>Nothing logged yet this week. Log a meal above and your week fills in here.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 10 }}>
            {stat("Week total", total.toLocaleString(), " kcal")}
            {stat("Avg / logged day", avg(thisWeek, "calories"), " kcal")}
            {stat("Protein / day", avg(thisWeek, "protein_g"), " g")}
            {stat("Carbs / day", avg(thisWeek, "carbs_g"), " g")}
            {stat("Fats / day", avg(thisWeek, "fats_g"), " g")}
          </div>
          <WeekColumns days={days} dailyTarget={0} />
        </>
      )}
      {lastWeek.length > 0 && <div style={{ fontSize: 11, color: S.muted, marginTop: 10 }}>Last week: {avg(lastWeek, "calories") ?? "—"} kcal per logged day across {lastWeek.length} day{lastWeek.length === 1 ? "" : "s"}.</div>}
    </Card>
  );
}
