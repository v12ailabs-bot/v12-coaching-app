import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// DESIGN TOKENS + SHARED HELPERS
// ---------------------------------------------------------------------------

// Color palette used across the whole app.
export const S = {
  bg: "#0A0A0B",
  surface: "#141416",
  surface2: "#1C1C20",
  border: "#2A2A30",
  text: "#F5F5F7",
  muted: "#666670",
  accent: "#FF4D00",
  accent2: "#00C9A7",
  neon: "#C6FF00",
};

// Avatar colors, cycled by index.
export const COLORS = ["#FF4D00", "#00C9A7", "#8B5CF6", "#3B82F6", "#F59E0B", "#EF4444"];

// Spacing/elevation scale — softer corners and a subtle shadow instead of the
// flat bordered rectangles used everywhere, without touching the black/
// charcoal/orange palette above.
export const RADIUS = { sm: 8, md: 12, lg: 16 };
export const SHADOW = { card: "0 1px 3px rgba(0,0,0,.3)" };

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

// Today's date as YYYY-MM-DD.
export const todayStr = () => new Date().toISOString().split("T")[0];

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
        .g4 { grid-template-columns: repeat(2, 1fr) !important; }
        .g2, .g3, .cg { grid-template-columns: 1fr !important; }
        table { font-size: 12px; }
      }
    `}</style>
  );
}
