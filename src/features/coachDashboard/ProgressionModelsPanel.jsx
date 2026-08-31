import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient.js";
import { S } from "../../theme.jsx";
import { Card, CardTitle, PageTitle, Fld, Inp, RG, Btn, StatusBadge } from "../../components/ui/index.js";
import { TOP_PHASES, TOP_PHASE_LABELS, fetchProgressionModels, createProgressionModel, updateProgressionModel } from "../../lib/progressionModels.js";

const PILLAR_LEANS = ["powerlifting", "bodybuilding", "conditioning", "blend"];
const BLANK = { key: "", label: "", top_phase: "foundation", pillar_lean: "blend", methodology: "" };

// Coach-facing CRUD over the progression_models toolkit the AI generator
// picks from per client/phase — same direct-Supabase-call pattern as
// TemplatesPanel (App.jsx), just for a different reference table. This is
// what makes the toolkit editable/extensible without a code change: edit a
// model's methodology text, deactivate one, or add a brand new named model,
// and the next program generation picks it up automatically.
export function ProgressionModelsPanel() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | model id
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = async () => {
    setModels(await fetchProgressionModels());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing("new"); setForm(BLANK); setMsg(null); };
  const startEdit = (m) => {
    setEditing(m.id);
    setForm({ key: m.key, label: m.label, top_phase: m.top_phase, pillar_lean: m.pillar_lean || "blend", methodology: m.methodology || "" });
    setMsg(null);
  };
  const cancel = () => { setEditing(null); setForm(BLANK); };

  const save = async () => {
    if (!form.key.trim() || !form.label.trim() || !form.methodology.trim()) {
      setMsg({ ok: false, text: "Key, label, and methodology are all required." });
      return;
    }
    setSaving(true); setMsg(null);
    const payload = {
      key: form.key.trim().toLowerCase().replace(/\s+/g, "_"),
      label: form.label.trim(),
      top_phase: form.top_phase,
      pillar_lean: form.pillar_lean,
      methodology: form.methodology.trim(),
    };
    const { error } = editing === "new"
      ? await createProgressionModel(payload)
      : await updateProgressionModel(editing, payload);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: editing === "new" ? "Model created." : "Model updated." });
    setEditing(null); setForm(BLANK);
    await load();
  };

  const toggleActive = async (m) => {
    await updateProgressionModel(m.id, { is_active: !m.is_active });
    await load();
  };

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  return (
    <div>
      <PageTitle title="Progression Models" sub="The named-model toolkit the AI picks from per client and phase" />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Btn teal onClick={startNew}>+ New Model</Btn>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: "10px 16px", fontSize: 12, fontWeight: 600, background: msg.ok ? "rgba(0,201,167,.14)" : "rgba(192,57,43,.16)", color: msg.ok ? S.accent2 : S.danger }}>
          {msg.text}
        </div>
      )}

      {editing && (
        <Card>
          <CardTitle>{editing === "new" ? "New Progression Model" : "Edit Progression Model"}</CardTitle>
          <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
            <Fld label="Key (unique, no spaces)"><Inp type="text" value={form.key} onChange={(e) => set("key", e.target.value)} placeholder="e.g. conjugate" /></Fld>
            <Fld label="Label (shown to the AI and coach)"><Inp type="text" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Conjugate (Max/Dynamic Effort)" /></Fld>
          </div>
          <Fld label="Top Phase — which top-level block this model is for">
            <RG options={TOP_PHASES} value={form.top_phase} onChange={(v) => set("top_phase", v)} cap />
          </Fld>
          <Fld label="Pillar Lean (informational)">
            <RG options={PILLAR_LEANS} value={form.pillar_lean} onChange={(v) => set("pillar_lean", v)} cap />
          </Fld>
          <Fld label="Methodology (fed to the AI verbatim as this model's instructions)">
            <textarea rows={6} value={form.methodology} onChange={(e) => set("methodology", e.target.value)}
              placeholder="Describe exactly how this progression model works and which client it best fits."
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical" }} />
          </Fld>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Model"}</Btn>
            <button onClick={cancel} style={{ padding: "10px 20px", fontSize: 12, background: "transparent", color: S.text, border: "1px solid " + S.border, cursor: "pointer", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>Cancel</button>
          </div>
        </Card>
      )}

      {models.length === 0 && !editing && (
        <Card style={{ textAlign: "center", padding: 40, color: S.muted }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: S.text, marginBottom: 6 }}>No models yet</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Add at least one model per top phase so program generation has something to pick from.</div>
          <Btn teal onClick={startNew}>+ New Model</Btn>
        </Card>
      )}

      {TOP_PHASES.map((phase) => {
        const rows = models.filter((m) => m.top_phase === phase);
        if (!rows.length) return null;
        return (
          <div key={phase} style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: S.neon, marginBottom: 10 }}>{TOP_PHASE_LABELS[phase]}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
              {rows.map((m) => (
                <Card key={m.id} style={{ opacity: m.is_active ? 1 : 0.55 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17 }}>{m.label}</div>
                    <StatusBadge label={m.is_active ? "Active" : "Inactive"} tone={m.is_active ? "green" : "neutral"} />
                  </div>
                  {m.pillar_lean && <div style={{ fontSize: 10, color: S.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{m.pillar_lean}</div>}
                  <div style={{ fontSize: 12.5, color: S.text, opacity: 0.85, lineHeight: 1.6, marginBottom: 12, maxHeight: 120, overflowY: "auto", paddingRight: 4 }}>{m.methodology}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn sm onClick={() => startEdit(m)}>Edit</Btn>
                    <button onClick={() => toggleActive(m)} style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}>
                      {m.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
