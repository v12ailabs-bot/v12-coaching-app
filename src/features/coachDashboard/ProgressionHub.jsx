import { useState } from "react";
import { S } from "../../theme.jsx";
import { PageTitle, Tabs, Card } from "../../components/ui/index.js";
import { ProgressionQueue } from "./ProgressionQueue.jsx";
import { ProgressionReference } from "./ProgressionReference.jsx";
import { ProgressionModelsPanel } from "./ProgressionModelsPanel.jsx";
import { METRIC_DEFINITIONS } from "../../lib/metricDefinitions.js";

// One home for everything progression: the review queue, the method reference,
// the written definition of every score, and the original AI-methodology editor.
function MetricsTab() {
  return (
    <div>
      <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6, marginBottom: 14 }}>
        The written definition of every score V12 shows, kept next to the code that calculates it. Missing data is never a zero or a success: a score with nothing to go on shows "—" or says what's missing. Coach screens read client check-ins as of yesterday; client screens include today. Screens re-fetch each time you open them.
      </div>
      {METRIC_DEFINITIONS.map((m) => (
        <Card key={m.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 11, color: S.muted }}>{m.audience}</div>
          </div>
          <div style={{ fontSize: 13, margin: "4px 0 8px" }}>{m.definition}</div>
          {[["Formula", m.formula], ["Window", m.window], ["Needs", m.needs], ["If data is missing", m.missing], ...(m.note ? [["Known limitation", m.note]] : [])].map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, fontSize: 12, padding: "3px 0", borderTop: "1px solid " + S.border }}><span style={{ color: S.muted }}>{k}</span><span>{v}</span></div>
          ))}
          <div style={{ fontSize: 10, color: S.muted, marginTop: 6 }}>Calculated by {m.source.map((s) => `${s.fn} (${s.file})`).join(" · ")}</div>
        </Card>
      ))}
    </div>
  );
}

export function ProgressionHub() {
  const [tab, setTab] = useState("queue");
  const tabs = [{ key: "queue", label: "Review queue" }, { key: "reference", label: "Method reference" }, { key: "metrics", label: "Metric definitions" }, { key: "models", label: "AI program notes" }];
  return (
    <div>
      <PageTitle title="Progression" sub="Review sessions, understand every method, and see exactly how each score is calculated" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div style={{ marginTop: 18 }}>
        {tab === "queue" && <ProgressionQueue />}
        {tab === "reference" && <ProgressionReference />}
        {tab === "metrics" && <MetricsTab />}
        {tab === "models" && (
          <>
            <Card><div style={{ fontSize: 12, color: S.muted, lineHeight: 1.6 }}>
              These are the free-text notes the AI reads <b>when it generates a program</b>. They do not calculate anything. The methods the app actually calculates for you (double, linear, percentage, APRE 3/6/10, density, taper) are in <b>Method reference</b>, and the older single "apre" entry below is the AI's note, not the APRE 3/6/10 calculators.
            </div></Card>
            <ProgressionModelsPanel />
          </>
        )}
      </div>
    </div>
  );
}
