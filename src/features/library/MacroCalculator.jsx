import { useState } from "react";
import { S } from "../../theme.jsx";
import { Card, CardTitle } from "../../components/ui/index.js";
import { calculateMacros, ACTIVITY_OPTIONS, GOAL_OPTIONS } from "../../lib/macroCalculator.js";

const selStyle = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 13, outline: "none" };

// Standalone formula-based tool inside the Library (spec Sections 8/14/15) --
// deliberately NOT the personalized nutrition plan Program-tier clients get.
// No persistence: every calculation is a fresh one-shot result from whatever
// is currently in the fields, available to every tier including Starter.
export function MacroCalculator() {
  const [form, setForm] = useState({ sex: "male", age: "", weightLb: "", heightIn: "", activity: "moderate", goal: "maintain" });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const result = calculateMacros({
    sex: form.sex,
    age: Number(form.age) || null,
    weightLb: Number(form.weightLb) || null,
    heightIn: Number(form.heightIn) || null,
    activity: form.activity,
    goal: form.goal,
  });

  return (
    <Card>
      <CardTitle>Macro Calculator</CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 16, lineHeight: 1.6 }}>
        A quick formula-based estimate, not a personalized plan — recalculate any time. Enter your stats to see your target.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Sex</div>
          <select value={form.sex} onChange={(e) => set("sex", e.target.value)} style={selStyle}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Age</div>
          <input type="number" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="e.g. 30" style={selStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Weight (lb)</div>
          <input type="number" value={form.weightLb} onChange={(e) => set("weightLb", e.target.value)} placeholder="e.g. 180" style={selStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Height (in)</div>
          <input type="number" value={form.heightIn} onChange={(e) => set("heightIn", e.target.value)} placeholder="e.g. 70" style={selStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Activity Level</div>
          <select value={form.activity} onChange={(e) => set("activity", e.target.value)} style={selStyle}>
            {ACTIVITY_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Goal</div>
          <select value={form.goal} onChange={(e) => set("goal", e.target.value)} style={selStyle}>
            {GOAL_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>
      {result ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted }}>Calories</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.text }}>{result.calories}<span style={{ fontSize: 11, color: S.muted }}> kcal</span></div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted }}>Protein</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.text }}>{result.proteinG}<span style={{ fontSize: 11, color: S.muted }}> g</span></div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted }}>Carbs</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.text }}>{result.carbsG}<span style={{ fontSize: 11, color: S.muted }}> g</span></div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted }}>Fats</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.text }}>{result.fatsG}<span style={{ fontSize: 11, color: S.muted }}> g</span></div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: S.muted }}>Fill in every field above to see your target.</div>
      )}
    </Card>
  );
}
