import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, bS } from "../../theme.jsx";

// Shown after the client follows the emailed password-reset link. Supabase has
// already established a short-lived recovery session, so updateUser is all that's
// needed to set the new password; on success we drop them into the app.
export function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async () => {
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    // Clear the recovery token from the URL so a refresh doesn't re-trigger this.
    if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
    setSuccess("Password updated. Signing you in...");
    setTimeout(() => onDone && onDone(), 1200);
  };

  return (
    <div style={{minHeight:"100vh",background:S.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 25% 50%,rgba(255,106,0,.13) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(0,201,167,.07) 0%,transparent 50%)"}}/>
      <div style={{position:"relative",zIndex:1,background:S.surface,border:"1px solid "+S.border,padding:"48px 40px",width:420,maxWidth:"95vw"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:56,color:S.accent,lineHeight:1}}>V12</div>
        <div style={{fontSize:11,letterSpacing:3,color:S.muted,textTransform:"uppercase",marginBottom:36,marginTop:2}}>Set a new password</div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:6}}>New Password</div>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
            style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:6}}>Confirm Password</div>
          <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••"
            onKeyDown={e=>e.key==="Enter"&&submit()}
            style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}/>
        </div>
        {error && <div style={{color:S.accent,fontSize:12,marginBottom:12}}>{error}</div>}
        {success && <div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"10px 16px",fontSize:12,fontWeight:600,marginBottom:12}}>{success}</div>}
        <button onClick={submit} disabled={loading||!!success}
          style={{...bS({width:"100%",padding:14}),background:S.accent,color:"white",opacity:(loading||success)?0.5:1}}>
          {loading?"Updating...":"Update Password"}
        </button>
      </div>
    </div>
  );
}
