import { S } from "../../theme.jsx";
import { Card } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

// Grouped by each client's actual goal/program text (profiles.goal, or the
// program name when set) — no fixed category list invented; a long tail of
// one-off labels collapses into "Other" so the list stays readable.
export function ProgramDistribution({ groups }) {
  const total = groups.reduce((s, g) => s + g.count, 0);
  return (
    <Card>
      <SectionTitle>Program Distribution</SectionTitle>
      {groups.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13 }}>No clients yet.</div>
      ) : (
        groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: S.text, marginBottom: 5 }}>
              <span>{g.label}</span>
              <span style={{ color: S.muted }}>{g.count} clients · {total ? Math.round((g.count / total) * 100) : 0}%</span>
            </div>
            <div style={{ height: 6, background: S.surface2, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: (total ? (g.count / total) * 100 : 0) + "%", height: "100%", background: S.accent2 }} />
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
