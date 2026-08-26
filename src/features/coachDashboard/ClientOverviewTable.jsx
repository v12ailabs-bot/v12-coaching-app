import { useState } from "react";
import { S, useIsMobile } from "../../theme.jsx";
import { Card, StatusBadge } from "../../components/ui/index.js";
import { SectionTitle } from "./SectionTitle.jsx";

const STATUS_TONE = { "On Track": "green", "Needs Attention": "amber", "At Risk": "red", "Inactive": "neutral" };
const FILTERS = [
  { id: "all", label: "All Clients" },
  { id: "active", label: "Active" },
  { id: "at_risk", label: "At Risk" },
  { id: "inactive", label: "Inactive" },
];

// Client name + phase, clickable straight through to that client's Program
// Roadmap builder — the entry point for the phase-sequence editor coaches
// otherwise have no way to find (it's one of a dozen collapsed sections on
// the client detail page).
function NameCell({ row, openClient }) {
  return (
    <>
      <div style={{ fontWeight: 600, fontSize: 13, color: S.text }}>{row.name}</div>
      <div onClick={(e) => { e.stopPropagation(); openClient(row.id, { section: "program-roadmap" }); }}
        style={{ fontSize: 11, color: S.accent, marginTop: 2, cursor: "pointer" }}>
        {row.phaseLabel || "Plan roadmap →"}
      </div>
    </>
  );
}

// Matches the Coach Dashboard's MetricCard treatment (bold Bebas Neue
// numeral first, bar as a supporting element underneath) instead of a plain
// muted percentage under a thin track — the same figure deserves the same
// visual weight wherever it shows up.
function ProgressBar({ value }) {
  if (value == null) return <span style={{ fontSize: 12, color: S.muted }}>—</span>;
  return (
    <>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, lineHeight: 1, color: S.text }}>{value}<span style={{ fontSize: 11, color: S.muted }}>%</span></div>
      <div style={{ height: 8, background: S.surface2, borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
        <div style={{ width: value + "%", height: "100%", background: S.accent, borderRadius: 4 }} />
      </div>
    </>
  );
}

function MobileRow({ row, openClient }) {
  return (
    <div onClick={() => openClient(row.id)}
      style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, marginBottom: 10, cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{row.name}</div>
          <div onClick={(e) => { e.stopPropagation(); openClient(row.id, { section: "program-roadmap" }); }} style={{ fontSize: 11, color: S.accent, marginTop: 2 }}>
            {row.phaseLabel || "Plan roadmap →"}
          </div>
        </div>
        <StatusBadge label={row.status} tone={STATUS_TONE[row.status]} />
      </div>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>{row.programName}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}><ProgressBar value={row.progress} /></div>
        <div style={{ fontSize: 12, color: S.text, whiteSpace: "nowrap" }}>{row.checkin}% check-in</div>
      </div>
      <div style={{ fontSize: 11, color: S.muted, marginTop: 8 }}>Last activity: {row.lastActivity}</div>
    </div>
  );
}

// `rows` are precomputed by CoachHome from assessClientRisk/loggingAssessment
// — coaching clients only, program-only clients have their own Program
// Subscribers section. `bucket` (active/at_risk/inactive) is a mutually-
// exclusive grouping for the filter tabs, separate from the finer-grained
// `status` badge shown per row. Fixed-height card with its own internal
// scroll, so the Overview page's height doesn't grow with the roster.
export function ClientOverviewTable({ rows, openClient }) {
  const [filter, setFilter] = useState("all");
  const isMobile = useIsMobile();
  const counts = { all: rows.length, active: rows.filter((r) => r.bucket === "active").length, at_risk: rows.filter((r) => r.bucket === "at_risk").length, inactive: rows.filter((r) => r.bucket === "inactive").length };
  const shown = filter === "all" ? rows : rows.filter((r) => r.bucket === filter);

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: isMobile ? 480 : 640, minWidth: 0 }}>
      <SectionTitle
        action={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + (filter === f.id ? S.accent : S.border), background: filter === f.id ? "rgba(255,106,0,.1)" : "transparent", color: filter === f.id ? S.accent : S.muted, borderRadius: 8 }}>
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>
        }
      >
        Client Overview
      </SectionTitle>
      {shown.length === 0 ? (
        <div style={{ color: S.muted, fontSize: 13, padding: "16px 0" }}>No clients in this group.</div>
      ) : isMobile ? (
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {shown.map((r) => <MobileRow key={r.id} row={r} openClient={openClient} />)}
        </div>
      ) : (
        // overflow (not overflowY) so the sticky header scrolls away from the
        // header row above it cleanly on both axes; the sticky `<th>`s need an
        // explicit z-index — without one, scrolling `<tr>`s painted later in
        // the DOM sit on top of the "stuck" header instead of under it, which
        // is what read as the header/rows bleeding into each other.
        <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                {["Client", "Program", "Progress", "Check-In", "Status", "Last Activity"].map((h) => (
                  <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: S.surface, fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, textAlign: "left", padding: "8px 12px", borderBottom: "1px solid " + S.border, boxShadow: "0 1px 0 " + S.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => openClient(r.id)} style={{ cursor: "pointer" }}>
                  <td style={{ padding: "12px", borderBottom: "1px solid " + S.border }}><NameCell row={r} openClient={openClient} /></td>
                  <td style={{ padding: "12px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{r.programName}</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid " + S.border, minWidth: 100 }}><ProgressBar value={r.progress} /></td>
                  <td style={{ padding: "12px", fontSize: 13, color: S.text, borderBottom: "1px solid " + S.border }}>{r.checkin}%</td>
                  <td style={{ padding: "12px", borderBottom: "1px solid " + S.border }}><StatusBadge label={r.status} tone={STATUS_TONE[r.status]} /></td>
                  <td style={{ padding: "12px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{r.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
