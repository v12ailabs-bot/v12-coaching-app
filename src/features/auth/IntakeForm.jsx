import { useState } from "react";
import { S, bS } from "../../theme.jsx";
import { INTAKE_FIELDS, INJURY_MULTISELECT_OPTIONS } from "../../lib/constants.js";

function MultiSelectChips({ label, options, values, onChange }) {
  const toggle = (opt) => onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid " + (values.includes(opt) ? S.accent : S.border), background: values.includes(opt) ? "rgba(255,77,0,.1)" : "transparent", color: values.includes(opt) ? S.accent : S.muted }}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// Public intake application — reachable from LoginScreen without an account.
// Writes to the `leads` table (shared with the in-app CRM + accept/reject flow)
// with source="intake_form", status="applied".
export function IntakeForm({ onDone }) {
  const [form, setForm] = useState({});
  const [currentInjuries, setCurrentInjuries] = useState([]);
  const [previousInjuries, setPreviousInjuries] = useState([]);
  const [painTriggers, setPainTriggers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setError("");
    if (!form.name || !form.email || !form.height) { setError("Name, email, and height are required."); return; }
    setSaving(true);
    // Goes through the server (not a direct Supabase insert) so submissions
    // can be rate-limited and mirrored into Notion server-side.
    const res = await fetch("/api/submit-application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, currentInjuries, previousInjuries, painTriggers }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error || "Submission failed. Please try again."); return; }
    setDone(true);
  };

  if (done) return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, marginBottom: 8 }}>Application received</div>
      <div style={{ color: S.muted, fontSize: 13, marginBottom: 16 }}>We'll review it and follow up soon.</div>
      <button onClick={onDone} style={{ ...bS({ padding: "10px 20px" }), background: "transparent", border: "1px solid " + S.border, color: S.text }}>Back to sign in</button>
    </div>
  );

  return (
    <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
      {INTAKE_FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{f.label}{f.required ? " *" : ""}</div>
          {f.type === "textarea" ? (
            <textarea value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} rows={2}
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          ) : f.type === "select" ? (
            <select value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }}>
              <option value="">— Select —</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type} value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.ph || ""}
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }} />
          )}
        </div>
      ))}
      <MultiSelectChips label="Current Injuries" options={INJURY_MULTISELECT_OPTIONS.currentInjuries} values={currentInjuries} onChange={setCurrentInjuries} />
      <MultiSelectChips label="Previous Injuries" options={INJURY_MULTISELECT_OPTIONS.previousInjuries} values={previousInjuries} onChange={setPreviousInjuries} />
      <MultiSelectChips label="Pain Triggers" options={INJURY_MULTISELECT_OPTIONS.painTriggers} values={painTriggers} onChange={setPainTriggers} />
      {error && <div style={{ color: S.accent, fontSize: 12, marginBottom: 12 }}>{error}</div>}
      <button onClick={submit} disabled={saving}
        style={{ ...bS({ width: "100%", padding: 14 }), background: S.accent, color: "white", opacity: saving ? 0.5 : 1 }}>
        {saving ? "Submitting..." : "Submit Application"}
      </button>
    </div>
  );
}
