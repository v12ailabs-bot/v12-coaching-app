import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, bS } from "../../theme.jsx";
import { COACH_EMAIL } from "../../lib/constants.js";
import { IntakeForm } from "./IntakeForm.jsx";
import { V12Logo } from "../../components/ui/index.js";

// Starter's self-serve $15/30-day signup: only an email up front, no
// password (see StarterActivation) and no account until payment confirms.
// A minimal functional entry point -- the full "Choose Your Path" tier
// picker (spec Section 14) is a separate visual redesign, held for later.
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

export function LoginScreen() {
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      setSuccess("Account created! Please sign in."); setTab("signin");
    }
    setLoading(false);
  };

  const F = (label, type, val, set, ph) => (
    <div style={{marginBottom:16}}>
      <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:6}}>{label}</div>
      <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
        onKeyDown={e=>e.key==="Enter"&&(tab==="signin"?signIn():signUp())}
        style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}/>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:S.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 25% 50%,rgba(255,106,0,.13) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(0,201,167,.07) 0%,transparent 50%)"}}/>
      <div style={{position:"relative",zIndex:1,background:S.surface,border:"1px solid "+S.border,padding:"48px 40px",width:420,maxWidth:"95vw"}}>
        <V12Logo size={56}/>
        <div style={{fontSize:11,letterSpacing:3,color:S.muted,textTransform:"uppercase",marginBottom:36,marginTop:2}}>System · Client Portal</div>
        <div style={{display:"flex",border:"1px solid "+S.border,marginBottom:28,flexWrap:"wrap"}}>
          {["signin","signup","starter","apply"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);setError("");setSuccess("");}}
              style={{flex:"1 1 0",minWidth:70,padding:10,fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",border:"none",background:tab===t?S.accent:"transparent",color:tab===t?"white":S.muted}}>
              {t==="signin"?"Sign In":t==="signup"?"Create Account":t==="starter"?"Starter":"Apply"}
            </button>
          ))}
        </div>
        {tab==="apply" ? (
          <IntakeForm onDone={()=>setTab("signin")} />
        ) : tab==="starter" ? (
          <StarterCheckoutForm />
        ) : (
          <>
            {tab==="signup" && F("Full Name","text",name,setName,"Your full name")}
            {F("Email","email",email,setEmail,"you@gmail.com")}
            {F("Password","password",password,setPassword,"••••••••")}
            {error && <div style={{color:S.accent,fontSize:12,marginBottom:12}}>{error}</div>}
            {success && <div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"10px 16px",fontSize:12,fontWeight:600,marginBottom:12}}>{success}</div>}
            {tab==="signin" && (
              <div style={{textAlign:"right",marginBottom:12}}>
                <span onClick={resetPassword}
                  style={{color:S.accent,fontSize:12,cursor:"pointer"}}>Forgot password?</span>
              </div>
            )}
            <button onClick={tab==="signin"?signIn:signUp} disabled={loading}
              style={{...bS({width:"100%",padding:14}),background:S.accent,color:"white",opacity:loading?0.5:1}}>
              {loading?"Please wait...":tab==="signin"?"Sign In":"Create Account"}
            </button>
            <p style={{marginTop:16,fontSize:11,color:S.muted,textAlign:"center",lineHeight:1.7}}>
              Works with any email — Gmail, Yahoo, Hotmail, etc.<br/>Coach login: coach@v12system.com
            </p>
          </>
        )}
      </div>
    </div>
  );
}
