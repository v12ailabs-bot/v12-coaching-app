import { S, RADIUS } from "../../../theme.jsx";
import { Btn } from "../../../components/ui/index.js";
import { ARRANGEMENTS, durationOptionsFor, normalizeSessionConfig, CUSTOM_MIN, CUSTOM_MAX } from "../../../lib/programming/sessionDuration.js";

// The "regenerate program" actions that used to live at the top of the old
// ClientHeaderSection, split out so the identity/status strip above it (now
// ClientDetailHeader) stays lean, and these program-editing actions live in
// the Program Phase tab where a coach actually uses them.
export function ProgramGenerateActions({ client, templateId, setTemplateId, templates, generating, genScope, genMsg, onGenerate, sessionConfig, setSessionConfig }) {
  const cfg = normalizeSessionConfig(sessionConfig);
  const options = durationOptionsFor(cfg.arrangement);
  const sel = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 13, outline: "none" };
  const lbl = { display: "block", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 };
  const isCustom = cfg.arrangement === "independent_online" && !options.includes(cfg.session_minutes);
  const update = (patch) => setSessionConfig?.(normalizeSessionConfig({ ...cfg, ...patch }));
  return (
    <div style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.lg, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 240px", minWidth: 200 }}>
          <label style={{ display: "block", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Template</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
            style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 13, outline: "none" }}>
            <option value="">Client's Notion template (default)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.difficulty ? ` · ${t.difficulty}` : ""}{t.equipment ? ` · ${t.equipment}` : ""}{t.duration ? ` · ${t.duration}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Btn onClick={() => onGenerate(client)} disabled={generating}>
          {generating && genScope === "full" ? "Generating..." : "⚡ Generate AI Program Draft"}
        </Btn>
        <Btn sm teal onClick={() => onGenerate(client, "nutrition")} disabled={generating}>
          {generating && genScope === "nutrition" ? "Generating..." : "🥗 Regenerate Nutrition Only"}
        </Btn>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
        <div style={{ flex: "1 1 200px" }}><label style={lbl}>Coaching arrangement</label>
          <select style={sel} value={cfg.arrangement} onChange={(e) => update({ arrangement: e.target.value })}>
            {Object.entries(ARRANGEMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div style={{ flex: "1 1 140px" }}><label style={lbl}>Session length</label>
          <select style={sel} value={isCustom ? "custom" : cfg.session_minutes} onChange={(e) => e.target.value === "custom" ? update({ session_minutes: 100 }) : update({ session_minutes: Number(e.target.value) })}>
            {options.map((m) => <option key={m} value={m}>{m} min</option>)}
            {cfg.arrangement === "independent_online" && <option value="custom">Custom…</option>}
          </select>
          {isCustom && <input type="number" min={CUSTOM_MIN} max={CUSTOM_MAX} value={cfg.session_minutes} style={{ ...sel, marginTop: 6 }} onChange={(e) => update({ session_minutes: Number(e.target.value) })} />}</div>
        <div style={{ flex: "1 1 200px" }}><label style={lbl}>Warm-up / activation</label>
          <select style={sel} value={cfg.prep} onChange={(e) => update({ prep: e.target.value })}>
            <option value="independent">Independent (not in session time)</option><option value="coached">Part of the supervised session</option></select></div>
        <div style={{ flex: "1 1 200px" }}><label style={lbl}>Cooldown</label>
          <select style={sel} value={cfg.finish} onChange={(e) => update({ finish: e.target.value })}>
            <option value="independent">Independent (not in session time)</option><option value="coached">Part of the supervised session</option></select></div>
      </div>
      <div style={{ fontSize: 11, color: S.muted, marginTop: 12 }}>
        Pulls this client's intake from Notion and builds a training plan from the selected template as a DRAFT for you to review, edit and approve — the client keeps their current program until you approve. The nutrition plan is saved right away. "Regenerate Nutrition Only" rebuilds just the nutrition plan and leaves the training program and logged history untouched.
      </div>
      {genMsg && (
        <div style={{ marginTop: 12, padding: "10px 16px", fontSize: 12, fontWeight: 600,
          background: genMsg.ok ? "rgba(0,201,167,.14)" : "rgba(192,57,43,.16)",
          color: genMsg.ok ? S.accent2 : S.danger }}>
          {genMsg.text}
        </div>
      )}
    </div>
  );
}
