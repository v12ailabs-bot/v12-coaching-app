import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// DESIGN TOKENS + SHARED HELPERS
// ---------------------------------------------------------------------------

// Color palette used across the whole app.
export const S = {
  bg: "#0B0B0D",
  surface: "#141417",
  surface2: "#1C1C20",
  border: "#242427",
  text: "#FFFFFF",
  muted: "#A1A1AA",
  accent: "#FF6A00",
  accent2: "#00C9A7",
  neon: "#C6FF00",
  success: "#22C55E",
  warning: "#FACC15",
  // Coral-red, reserved for warnings/due-dates/overdue items and destructive
  // actions — was previously duplicated as a stray hardcoded hex literal in
  // ~20 components (delete buttons, overdue follow-ups, error messages)
  // while this token sat at a different, barely-used red (#EF4444).
  // Consolidated to the value already in de-facto use everywhere.
  danger: "#FF6B5B",
};

// Avatar colors, cycled by index.
export const COLORS = ["#FF6A00", "#00C9A7", "#8B5CF6", "#3B82F6", "#F59E0B", "#EF4444"];

// sm/md: the radius already in use across all existing cards/buttons/inputs —
// left untouched so unrelated screens don't visually shift. lg: for larger
// new surfaces (kanban columns, split-workspace panels) added in this pass.
export const RADIUS = { sm: 12, md: 12, lg: 16 };
export const SHADOW = { card: "0 1px 3px rgba(0,0,0,.3)" };

// Spacing scale used by new components (existing inline styles are untouched).
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 };

// Focus-visible ring for interactive elements in newly-built components (no
// equivalent existed before — inputs app-wide set outline:"none" with no
// replacement). Not retrofitted onto untouched legacy screens.
export const FOCUS_RING = "0 0 0 3px rgba(255,106,0,.35)";

// Base button style; pass overrides that are merged on top.
export const bS = (o = {}) => ({
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  fontSize: 12,
  padding: "10px 20px",
  ...o,
});

// Shared recharts tooltip styling.
export const TT = {
  contentStyle: {
    background: S.surface,
    border: "1px solid " + S.border,
    fontSize: 12,
    color: S.text,
  },
  labelStyle: { color: S.muted },
  itemStyle: { color: S.text },
};

// Today's date as YYYY-MM-DD, in the browser's local timezone. toISOString()
// converts to UTC first, which rolls to "tomorrow" in the evening for any
// timezone west of UTC (e.g. from ~4-8pm in US timezones) — that off-by-one
// broke check-in dates for evening submissions, so this formats from local
// getFullYear/getMonth/getDate instead.
export const todayStr = () => localDateStr(new Date());

// Formats a Date as YYYY-MM-DD using its local calendar fields (not UTC).
export function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// True when the viewport is at the mobile breakpoint, so components can swap a
// dense desktop table for a stacked card layout. Mirrors the 720px CSS query.
export function useIsMobile() {
  const query = "(max-width: 720px)";
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  return mobile;
}

// TRAINING (programs + exercises + program_versions) can be SHARED between
// linked training partners: a client's `shared_program_owner_id` points at the
// partner who owns the shared training rows. Pass a profile/client row and get
// back the id whose training rows it should read/write. Nutrition, workout
// logs, check-ins, and photos always use the client's OWN id — never this.
export const trainingOwnerId = (p) => p?.shared_program_owner_id || p?.id;

// Initials from a name ("Jane Doe" -> "JD") or email ("you@x.com" -> "Y").
export function avatarFrom(nameOrEmail = "") {
  const s = String(nameOrEmail).trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return s[0].toUpperCase();
}

// Global CSS for things components reference via className (spinner, grids,
// the display font, and range inputs). Injected once.
export function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
      * { box-sizing: border-box; }
      /* Portrait-first: never let content force a horizontal scroll. */
      html, body { max-width: 100%; overflow-x: hidden; }
      body { margin: 0; background: ${S.bg}; color: ${S.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      img { max-width: 100%; }
      .spinner { width: 32px; height: 32px; border-radius: 50%;
        border: 3px solid ${S.border}; border-top-color: ${S.accent};
        animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      input[type="range"] { width: 100%; accent-color: ${S.accent}; }
      /* Workout day-switcher arrows: a visible press/hover response instead
         of a static outlined box, plus a little slide-fade on the day label
         itself each time it changes so switching days reads as a real
         transition, not an instant swap. */
      .day-nav-arrow { transition: transform .15s ease, background-color .15s ease, border-color .15s ease; }
      .day-nav-arrow:hover { background: rgba(255,106,0,.14) !important; border-color: ${S.accent} !important; color: ${S.accent} !important; transform: scale(1.12); }
      .day-nav-arrow:active { transform: scale(0.9); }
      .day-label-swap { animation: dayLabelIn .25s ease; }
      @keyframes dayLabelIn { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: translateX(0); } }
      @media (max-width: 720px) {
        /* Collapse the left sidebar into a fixed bottom tab bar. These need
           !important: the <nav> and its items carry inline styles, which
           otherwise beat plain stylesheet rules even inside a media query. */
        .sidebar { position: fixed !important; bottom: 0; left: 0; right: 0; top: auto !important;
          width: 100% !important; height: 58px !important; flex-shrink: 0;
          padding: 0 !important; border-right: none !important; border-top: 1px solid #333;
          overflow-x: auto !important; overflow-y: hidden !important; z-index: 999;
          /* iOS Safari can visually detach a fixed element from the viewport
             mid-scroll while its address bar animates; forcing its own GPU
             compositing layer keeps it pinned to the bottom instead of
             drifting up the page. */
          transform: translateZ(0); -webkit-transform: translateZ(0); will-change: transform; }
        .sidebar-inner { display: flex !important; flex-direction: row; width: 100%;
          align-items: stretch; padding: 0 !important; }
        .sidebar-heading { display: none !important; }
        /* flex:1 1 0 + min-width:0 lets all tabs share the width evenly and shrink
           to fit (no horizontal scroll); the label truncates instead of spilling
           into its neighbour, which is what made the client's 9 tabs overlap. */
        .sidebar-item { flex: 1 1 0; min-width: 0; flex-direction: column !important;
          justify-content: center; gap: 3px !important; font-size: 9px !important;
          padding: 7px 3px !important; margin-bottom: 0 !important; text-align: center;
          white-space: nowrap; border-radius: 0 !important; overflow: hidden; }
        /* display:block is required — an inline <span> ignores max-width/overflow,
           so without it the label text spills past its column and overlaps the
           neighbouring tabs. */
        .sidebar-label { display: block; width: 100%; max-width: 100%; overflow: hidden;
          text-overflow: ellipsis; line-height: 1.1; }
        .main-content { padding: 18px 16px 84px !important; }
        .topbar { padding: 0 14px !important; }
        .card { padding: 16px !important; }
        /* iOS Safari auto-zooms the whole page on focus for any input under
           16px, and never zooms back out — that's the "screen zooms in when
           I tap a text box" the app stays stuck at until the user manually
           pinches out. Most inputs here are 13-14px; floor them all at 16px
           so focus never triggers it. */
        input, textarea, select { font-size: 16px !important; }
        .g4 { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
        .g2, .g3, .g6, .cg { grid-template-columns: minmax(0,1fr) !important; }
        table { font-size: 12px; }
      }
      /* minmax(0, 1fr), not a bare 1fr — a bare 1fr track's minimum is
         still its content's min-content size, so one wide child (e.g. a card
         with a chart) can blow the whole track — and the page — out past the
         viewport; overflow-x:hidden above then just silently clips it rather
         than showing a scrollbar. minmax(0,...) caps the floor at 0 so the
         track (and everything in it) is forced to actually fit. */
      @media (max-width: 980px) and (min-width: 721px) {
        .g6 { grid-template-columns: repeat(3, minmax(0,1fr)) !important; }
        .coach-tile-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
      }
      @media (max-width: 980px) {
        /* Coach Overview's table + side-column split — stack once there's no
           room for a real side column instead of squeezing both illegibly. */
        .coach-grid-main { grid-template-columns: minmax(0,1fr) !important; }
        /* Leads/CRM board + Today rail — same reasoning as coach-grid-main. */
        .crm-layout { grid-template-columns: minmax(0,1fr) !important; }
        /* Clients split workspace: directory | (content + quick-actions rail).
           Below 980px there's no room for all three side by side — drop to
           directory-above-workspace first; the inner content/rail split
           collapses separately at the tighter 720px breakpoint below. */
        .clients-layout { grid-template-columns: minmax(0,1fr) !important; }
      }
      @media (max-width: 720px) {
        .coach-tile-grid { grid-template-columns: minmax(0,1fr) !important; }
        /* Kanban columns are too narrow to squeeze 4-across on a phone —
           scroll horizontally, one column at a time, instead of shrinking
           each column to unreadable width. */
        .crm-columns { grid-auto-flow: column; grid-template-columns: none !important;
          grid-auto-columns: minmax(78vw, 1fr); overflow-x: auto; }
        /* Client workspace's content + Quick Actions/Notes rail — stack so
           the rail reads as a section below the tabs instead of a squeezed
           sidebar. */
        .client-workspace { grid-template-columns: minmax(0,1fr) !important; }
        /* Overview grid's 2-up rows (Progress/Insights, Roadmap/History)
           collapse to single-column stacked cards on mobile instead of
           squeezing two cards side by side. */
        .overview-row-2 { grid-template-columns: minmax(0,1fr) !important; }
        /* Tabs bar stays pinned below the fixed 54px topbar while the tab
           content scrolls underneath it, instead of scrolling away with the
           page — the coach shouldn't have to scroll back up to switch tabs. */
        .client-tabs-sticky { position: sticky; top: 54px; z-index: 90; background: ${S.bg}; padding: 6px 0; }
        .daily-habits-grid { grid-template-columns: minmax(0,1fr) !important; }
      }
    `}</style>
  );
}
