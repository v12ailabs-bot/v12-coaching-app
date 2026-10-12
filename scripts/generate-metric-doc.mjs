// Regenerates docs/METRIC_DEFINITIONS.md from src/lib/metricDefinitions.js (the single source).
//   node scripts/generate-metric-doc.mjs
import fs from "node:fs";
import { METRIC_DEFINITIONS } from "../src/lib/metricDefinitions.js";
const out = ["# V12 metric definitions", "", "_Generated from `src/lib/metricDefinitions.js` — edit that file, then run `node scripts/generate-metric-doc.mjs`. The same text is shown to coaches in Progression > Metric definitions._", "",
  "**Rules for every metric:** missing data is never a zero or a success; a day with no entry is not a hit; rest days are neither a success nor a miss; coach screens read check-ins as of yesterday while client screens include today; screens re-fetch each time they are opened.", ""];
for (const m of METRIC_DEFINITIONS) {
  out.push(`## ${m.name}`, "", `*Audience: ${m.audience}*`, "", m.definition, "", `- **Formula:** ${m.formula}`, `- **Window:** ${m.window}`, `- **Needs:** ${m.needs}`, `- **If data is missing:** ${m.missing}`);
  if (m.note) out.push(`- **Known limitation:** ${m.note}`);
  out.push(`- **Calculated by:** ${m.source.map((s) => `\`${s.fn}\` (${s.file})`).join(", ")}`, "");
}
fs.writeFileSync(new URL("../docs/METRIC_DEFINITIONS.md", import.meta.url), out.join("\n"));
console.log("wrote docs/METRIC_DEFINITIONS.md");
