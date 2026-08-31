// The one V12 mark used everywhere in the app (topbar, login, password
// reset) — same asset as the PWA home-screen icon and launch screen
// (public/icons/icon-512.png, generated from src/assets/v12-logo-source.jpg
// via scripts/generate-app-icons.mjs). Previously this was a CSS-drawn
// wordmark that didn't match the real approved logo, and password reset had
// its own separate plain "V12" text — both replaced so there's a single
// source of truth. `size` sets the square mark's pixel dimensions.
export function V12Logo({ size = 30 }) {
  return <img src="/icons/icon-512.png" alt="V12" width={size} height={size} style={{ borderRadius: size * 0.22, flexShrink: 0 }} />;
}
