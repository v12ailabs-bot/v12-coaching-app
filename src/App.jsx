import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://dbmkdrytjeppcbhuzkxh.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibWtkcnl0amVwcGNiaHV6a3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzU0ODEsImV4cCI6MjA5MjgxMTQ4MX0.D9UY3I0yEYDw8lpCwRHqwx2wSN39yUKvEM5PsQiQmlM"
);

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!ready) return <div style={{color:"white",padding:40}}>Loading...</div>;
  if (!user) return <Login />;
  return <Dashboard user={user} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
  };

  return (
    <div style={{minHeight:"100vh",background:"#0A0A0B",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#111",border:"1px solid #222",padding:40,width:380}}>
        <div style={{fontFamily:"serif",fontSize:48,color:"#FF4D00",marginBottom:4}}>V12</div>
        <div style={{color:"#666",fontSize:11,letterSpacing:3,marginBottom:32}}>SYSTEM · CLIENT PORTAL</div>
        <div style={{marginBottom:12}}>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
            style={{width:"100%",background:"#18181C",border:"1px solid #333",color:"white",padding:"12px 14px",fontSize:14,outline:"none"}} />
        </div>
        <div style={{marginBottom:16}}>
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&signIn()}
            style={{width:"100%",background:"#18181C",border:"1px solid #333",color:"white",padding:"12px 14px",fontSize:14,outline:"none"}} />
        </div>
        {error && <div style={{color:"#FF4D00",fontSize:12,marginBottom:12}}>{error}</div>}
        <button onClick={signIn}
          style={{width:"100%",background:"#FF4D00",color:"white",border:"none",padding:14,fontSize:13,fontWeight:600,letterSpacing:2,cursor:"pointer"}}>
          SIGN IN
        </button>
      </div>
    </div>
  );
}

function Dashboard({ user }) {
  const signOut = () => supabase.auth.signOut();
  return (
    <div style={{minHeight:"100vh",background:"#0A0A0B",color:"white",padding:40}}>
      <div style={{fontFamily:"serif",fontSize:36,color:"#FF4D00",marginBottom:8}}>V12</div>
      <div style={{marginBottom:24,color:"#666"}}>Logged in as: {user.email}</div>
      <button onClick={signOut}
        style={{background:"transparent",border:"1px solid #333",color:"white",padding:"8px 16px",cursor:"pointer"}}>
        Sign Out
      </button>
    </div>
  );
}
