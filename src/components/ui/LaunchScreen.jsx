import { S } from "../../theme.jsx";

// Branded launch/loading screen -- shown only while App.jsx's top-level
// `loading` state is true (initial Supabase session/profile resolution).
// That flag is a one-time bootstrap value, never re-set on in-app page
// navigation, so this never replays after the first load. The entrance
// animation (see the v12LogoIn/v12Glow/v12TitleIn keyframes in
// theme.jsx's GlobalStyles) is ~0.5s and purely cosmetic -- how long this
// screen actually stays on screen is driven entirely by real auth
// resolution time, never an artificial delay.
export function LaunchScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: S.bg, gap: 18 }}>
      <img src="/icons/icon-512.png" alt="" width={112} height={112} className="launch-logo" style={{ borderRadius: 24 }} />
      <div className="launch-title" style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: S.muted, fontWeight: 600 }}>
        V12 Performance Systems
      </div>
    </div>
  );
}
