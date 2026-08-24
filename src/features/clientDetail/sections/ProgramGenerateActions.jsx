import { S, RADIUS } from "../../../theme.jsx";
import { Btn } from "../../../components/ui/index.js";

// The "regenerate program" actions that used to live at the top of the old
// ClientHeaderSection, split out so the identity/status strip above it (now
// ClientDetailHeader) stays lean, and these program-editing actions live in
// the Program Phase tab where a coach actually uses them.
export function ProgramGenerateActions({ client, templateId, setTemplateId, templates, generating, genScope, genMsg, onGenerate }) {
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
                {t.name}{t.difficulty ? ` · ${t.difficulty}` : ""}{t.duration ? ` · ${t.duration}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Btn onClick={() => onGenerate(client)} disabled={generating}>
          {generating && genScope === "full" ? "Generating..." : "⚡ Generate AI Program"}
        </Btn>
        <Btn sm teal onClick={() => onGenerate(client, "nutrition")} disabled={generating}>
          {generating && genScope === "nutrition" ? "Generating..." : "🥗 Regenerate Nutrition Only"}
        </Btn>
      </div>
      <div style={{ fontSize: 11, color: S.muted, marginTop: 12 }}>
        Pulls this client's intake from Notion, builds a training + nutrition plan with AI from the selected template, and publishes it to their portal. "Regenerate Nutrition Only" rebuilds just the nutrition plan and leaves the training program and logged history untouched.
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
