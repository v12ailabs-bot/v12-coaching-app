import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, bS } from "../../theme.jsx";
import { COACH_EMAIL } from "../../lib/constants.js";
import { IntakeForm } from "./IntakeForm.jsx";
import { V12Logo } from "../../components/ui/index.js";

// Starter's self-serve $15/30-day signup: only an email up front, no
// password (see starterActivation.js) and no account until payment confirms.
function StarterCheckoutForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch("/api/starter-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      setMsg({ ok: false, text: data.error || "Something went wrong. Please try again." });
    } catch {
      setMsg({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ fontSize: 12, color: S.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Starter — $15 for 30 days of workouts, logging, and the macro calculator. No coach approval needed. Enter your email to continue to payment.
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>Email</div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com"
          style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }} />
      </div>
      {msg && <div style={{ color: S.accent, fontSize: 12, marginBottom: 12 }}>{msg.text}</div>}
      <button onClick={submit} disabled={loading || !email}
        style={{ ...bS({ width: "100%", padding: 14 }), background: S.accent, color: "white", opacity: loading || !email ? 0.5 : 1 }}>
        {loading ? "Please wait..." : "Continue to Payment — $15"}
      </button>
    </>
  );
}

const TIERS = [
  { key: "starter", icon: "⚡", label: "Starter", blurb: "Essentials to build momentum." },
  { key: "program", icon: "🏋", label: "V12 Program", blurb: "Structured training programs." },
  { key: "coaching", icon: "👑", label: "Coaching", blurb: "1-on-1 coaching and full support." },
];

// "Choose Your Path" tier picker (approved mockup) — only ever shown under
// Get Started, never under Sign In (per spec, overriding the mockup's own
// pixels, which showed it under both). Picking a card proceeds immediately
// into that tier's flow; there's no separate "confirm selection" step.
function TierPicker({ onSelect }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 14, textAlign: "center" }}>Choose Your Path</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {TIERS.map((t) => (
          <button key={t.key} onClick={() => onSelect(t.key)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px 8px", cursor: "pointer",
              border: "1px solid " + S.border, background: "transparent", borderRadius: 8, color: S.text }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.label}</span>
            <span style={{ fontSize: 10, color: S.muted, textAlign: "center", lineHeight: 1.4 }}>{t.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const BackLink = ({ onClick }) => (
  <div onClick={onClick} style={{ color: S.accent, fontSize: 12, cursor: "pointer", marginBottom: 16 }}>← Choose a different path</div>
);

export function LoginScreen() {
  // Top-level toggle (exactly 2 buttons, per spec) — everything else is a
  // sub-state within whichever one is active.
  const [mode, setMode] = useState("signin"); // "signin" | "getstarted"
  const [signinView, setSigninView] = useState("signin"); // "signin" | "createAccount"
  const [tierStep, setTierStep] = useState(null); // null | "starter" | "program" | "coaching"

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clearMsgs = () => { setError(""); setSuccess(""); };
  const goToMode = (m) => { setMode(m); setSigninView("signin"); setTierStep(null); clearMsgs(); };

  const signIn = async () => {
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const resetPassword = async () => {
    setError(""); setSuccess("");
    if (!email) { setError("Enter your email address above, then click Forgot Password."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) setError(error.message);
    else setSuccess("Password reset email sent. Check your inbox.");
    setLoading(false);
  };

  // Post-acceptance account creation — for a Program Only/Coaching
  // applicant the system already marked Accepted (payment confirmed), not
  // a general-purpose "create any account" flow. Lives as a link under Sign
  // In rather than its own top-level toggle button, since the spec caps the
  // toggle at exactly 2 (Sign In / Get Started).
  const signUp = async () => {
    setError(""); setLoading(true);
    if (email !== COACH_EMAIL) {
      try {
        const res = await fetch("/api/check-accepted", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const json = await res.json();
        if (!json.accepted) {
          setError("This email hasn't been accepted yet. Apply first — you'll be able to create an account once approved.");
          setLoading(false);
          return;
        }
      } catch {
        setError("Couldn't verify your application status. Please try again.");
        setLoading(false);
        return;
      }
    }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, role: email === COACH_EMAIL ? "coach" : "client" } }
    });
    if (error) setError(error.message);
    else {
      if (data?.user?.id) {
        try {
          await fetch("/api/link-lead", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
            body: JSON.stringify({ client_id: data.user.id }),
          });
        } catch { /* non-fatal — account creation already succeeded */ }
      }
      setSuccess("Account created! Please sign in."); setSigninView("signin");
    }
    setLoading(false);
  };

  const F = (label, type, val, set, ph, onEnter, autoComplete) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <input type={type} name={autoComplete} autoComplete={autoComplete} value={val} onChange={e => set(e.target.value)} placeholder={ph}
        onKeyDown={e => e.key === "Enter" && onEnter?.()}
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 25% 50%,rgba(255,106,0,.13) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(0,201,167,.07) 0%,transparent 50%)" }} />
      <div style={{ position: "relative", zIndex: 1, background: S.surface, border: "1px solid " + S.border, padding: "48px 40px", width: 440, maxWidth: "95vw" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><V12Logo size={56} /></div>
        <div style={{ fontSize: 11, letterSpacing: 3, color: S.muted, textTransform: "uppercase", marginBottom: 28, marginTop: 8, textAlign: "center" }}>System · Client Portal</div>

        <div style={{ display: "flex", border: "1px solid " + S.border, borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
          {["signin", "getstarted"].map((m) => (
            <button key={m} onClick={() => goToMode(m)}
              style={{ flex: 1, padding: 11, fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", border: "none", background: mode === m ? S.accent : "transparent", color: mode === m ? "white" : S.muted }}>
              {m === "signin" ? "Sign In" : "Get Started"}
            </button>
          ))}
        </div>

        {mode === "signin" ? (
          signinView === "createAccount" ? (
            <>
              <div style={{ fontSize: 12, color: S.muted, marginBottom: 16 }}>Already accepted into V12 Program or Coaching? Set up your login below.</div>
              {F("Full Name", "text", name, setName, "Your full name", signUp, "name")}
              {F("Email", "email", email, setEmail, "you@gmail.com", signUp, "email")}
              {F("Password", "password", password, setPassword, "••••••••", signUp, "new-password")}
              {error && <div style={{ color: S.accent, fontSize: 12, marginBottom: 12 }}>{error}</div>}
              <button onClick={signUp} disabled={loading}
                style={{ ...bS({ width: "100%", padding: 14 }), background: S.accent, color: "white", opacity: loading ? 0.5 : 1 }}>
                {loading ? "Please wait..." : "Create Account"}
              </button>
              <div onClick={() => { setSigninView("signin"); clearMsgs(); }} style={{ color: S.accent, fontSize: 12, cursor: "pointer", marginTop: 14, textAlign: "center" }}>← Back to sign in</div>
            </>
          ) : (
            <>
              {F("Email", "email", email, setEmail, "you@gmail.com", signIn, "email")}
              {F("Password", "password", password, setPassword, "••••••••", signIn, "current-password")}
              {error && <div style={{ color: S.accent, fontSize: 12, marginBottom: 12 }}>{error}</div>}
              {success && <div style={{ background: "rgba(0,201,167,.14)", color: S.accent2, padding: "10px 16px", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{success}</div>}
              <div style={{ textAlign: "right", marginBottom: 12 }}>
                <span onClick={resetPassword} style={{ color: S.accent, fontSize: 12, cursor: "pointer" }}>Forgot password?</span>
              </div>
              <button onClick={signIn} disabled={loading}
                style={{ ...bS({ width: "100%", padding: 14 }), background: S.accent, color: "white", opacity: loading ? 0.5 : 1 }}>
                {loading ? "Please wait..." : "Sign In"}
              </button>
              <button onClick={() => { setSigninView("createAccount"); clearMsgs(); }}
                style={{ ...bS({ width: "100%", padding: 14, marginTop: 10 }), background: "transparent", border: "1px solid " + S.accent, color: S.accent }}>
                Already Accepted? Create Your Account →
              </button>
              <p style={{ marginTop: 16, fontSize: 11, color: S.muted, textAlign: "center", lineHeight: 1.7 }}>
                Works with any email — Gmail, Yahoo, Hotmail, etc.<br />Coach login: coach@v12system.com
              </p>
            </>
          )
        ) : (
          tierStep === null ? (
            <TierPicker onSelect={setTierStep} />
          ) : tierStep === "starter" ? (
            <>
              <BackLink onClick={() => setTierStep(null)} />
              <StarterCheckoutForm />
            </>
          ) : (
            <>
              <BackLink onClick={() => setTierStep(null)} />
              <IntakeForm requestedTier={tierStep === "program" ? "V12 Program" : "Coaching"} onDone={() => goToMode("signin")} />
            </>
          )
        )}
      </div>
    </div>
  );
}
