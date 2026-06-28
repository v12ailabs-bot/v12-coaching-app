import { useState, useEffect, useRef, useCallback } from "react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";



import { createClient } from "@supabase/supabase-js";



// Credentials come from Vite env vars; the literals are dev fallbacks so the
// app keeps working locally without a .env. The anon/publishable key is safe
// to ship to the browser. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in prod.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://dbmkdrytjeppcbhuzkxh.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_fUmhHIYTbiIraSM7FA63iQ_yjMh4vNG";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});



const COACH_EMAIL = "coach@v12system.com";



// ---------------------------------------------------------------------------
// DESIGN TOKENS + SHARED HELPERS
// ---------------------------------------------------------------------------

// Color palette used across the whole app.
const S = {
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
const COLORS = ["#FF4D00", "#00C9A7", "#8B5CF6", "#3B82F6", "#F59E0B", "#EF4444"];

// Base button style; pass overrides that are merged on top.
const bS = (o = {}) => ({
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
const TT = {
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
const todayStr = () => new Date().toISOString().split("T")[0];

// Initials from a name ("Jane Doe" -> "JD") or email ("you@x.com" -> "Y").
function avatarFrom(nameOrEmail = "") {
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
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; background: ${S.bg}; color: ${S.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .spinner { width: 32px; height: 32px; border-radius: 50%;
        border: 3px solid ${S.border}; border-top-color: ${S.accent};
        animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      input[type="range"] { width: 100%; accent-color: ${S.accent}; }
      @media (max-width: 720px) {
        .sidebar { display: none; }
        .g4 { grid-template-columns: repeat(2, 1fr) !important; }
        .g2, .g3, .cg { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}



export default function App() {

  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);

  const authListenerRef = useRef(null);



  // LOAD PROFILE

  const loadProfile = useCallback(async (userData) => {

    if (!userData) {

      setProfile(null);

      return null;

    }



    try {

      console.log("Loading profile for:", userData.id);



      const { data, error } = await supabase

        .from("profiles")

        .select("*")

        .eq("id", userData.id)

        .maybeSingle();



      if (error) {

        console.error("PROFILE FETCH ERROR:", error);



        // fallback profile so app doesn't break

        const fallbackProfile = {

          id: userData.id,

          email: userData.email,

          role:

            userData.email === COACH_EMAIL

              ? "coach"

              : "client",

          name:

            userData.user_metadata?.name ||

            userData.email,

        };



        setProfile(fallbackProfile);

        return fallbackProfile;

      }



      // If profile row doesn't exist

      if (!data) {

        console.log("No profile found. Creating profile...");



        const newProfile = {

          id: userData.id,

          email: userData.email,

          role:

            userData.email === COACH_EMAIL

              ? "coach"

              : "client",

          name:

            userData.user_metadata?.name ||

            userData.email,

        };



        const { error: insertError } = await supabase

          .from("profiles")

          .insert(newProfile);



        if (insertError) {

          console.error(

            "PROFILE INSERT ERROR:",

            insertError

          );

        }



        setProfile(newProfile);

        return newProfile;

      }



      console.log("PROFILE LOADED:", data);



      setProfile(data);

      return data;

    } catch (err) {

      console.error("PROFILE EXCEPTION:", err);



      const fallbackProfile = {

        id: userData.id,

        email: userData.email,

        role:

          userData.email === COACH_EMAIL

            ? "coach"

            : "client",

        name:

          userData.user_metadata?.name ||

          userData.email,

      };



      setProfile(fallbackProfile);

      return fallbackProfile;

    }

  }, []);



  // INITIALIZE AUTH

  useEffect(() => {

    let mounted = true;



    const initializeAuth = async () => {

      try {

        console.log("INITIALIZING AUTH");



        const {

          data: { session },

          error,

        } = await supabase.auth.getSession();



        if (error) {

          console.error("GET SESSION ERROR:", error);

        }



        if (!mounted) return;



        const currentUser = session?.user ?? null;



        console.log("INITIAL USER:", currentUser);



        setUser(currentUser);



        if (currentUser) {

          await loadProfile(currentUser);

        } else {

          setProfile(null);

        }



        setLoading(false);



        // AUTH LISTENER

        const {

          data: { subscription },

        } = supabase.auth.onAuthStateChange(

          async (event, session) => {

            console.log("AUTH EVENT:", event);

            console.log("SESSION:", session);



            if (!mounted) return;



            const authUser = session?.user ?? null;



            // SIGNED OUT

            if (!authUser) {

              console.log("USER SIGNED OUT");



              setUser(null);

              setProfile(null);

              return;

            }



                        // SAME USER - always update user and profile to ensure latest session data is used
            if (authUser.id === user?.id) {
              console.log("Same user session refreshed, updating user and profile.");
            }



            console.log("SETTING USER:", authUser.id);



            setUser(authUser);



            await loadProfile(authUser);

          }

        );



        authListenerRef.current = subscription;

      } catch (err) {

        console.error("AUTH INIT EXCEPTION:", err);

      } finally {

        if (mounted) {

          setLoading(false);

        }

      }

    };



    initializeAuth();



    return () => {

      mounted = false;



      if (authListenerRef.current) {

        authListenerRef.current.unsubscribe();

      }

    };

  }, [loadProfile]);



  // LOGOUT

  const logout = async () => {

    try {

      await supabase.auth.signOut();

    } catch (err) {

      console.error("LOGOUT ERROR:", err);

    }



    setUser(null);

    setProfile(null);

  };



  // LOADING SCREEN

  if (loading) {

    return (
      <>
        <GlobalStyles />
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: S.bg,
            color: S.text,
          }}
        >
          <div className="spinner" />
        </div>
      </>
    );

  }



  // NOT LOGGED IN

  if (!user) {

    return (
      <>
        <GlobalStyles />
        <LoginScreen />
      </>
    );

  }



  // PROFILE FALLBACK

  if (!profile) {

    return (
      <>
        <GlobalStyles />
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: S.bg,
            color: S.text,
          }}
        >
          Loading profile...
        </div>
      </>
    );

  }



  const isCoach =

    profile?.role === "coach" ||

    profile?.email === COACH_EMAIL;



  // MAIN APP

  return (

    <>
      <GlobalStyles />
      {isCoach ? (
        <CoachDashboard profile={profile} logout={logout} />
      ) : (
        <ClientDashboard profile={profile} logout={logout} />
      )}
    </>

  );

}


function LoginScreen() {
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

  const signUp = async () => {
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, role: email === COACH_EMAIL ? "coach" : "client" } }
    });
    if (error) setError(error.message);
    else { setSuccess("Account created! Please sign in."); setTab("signin"); }
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
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 25% 50%,rgba(255,77,0,.13) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(0,201,167,.07) 0%,transparent 50%)"}}/>
      <div style={{position:"relative",zIndex:1,background:S.surface,border:"1px solid "+S.border,padding:"48px 40px",width:420,maxWidth:"95vw"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:56,color:S.accent,lineHeight:1}}>V12</div>
        <div style={{fontSize:11,letterSpacing:3,color:S.muted,textTransform:"uppercase",marginBottom:36,marginTop:2}}>System · Client Portal</div>
        <div style={{display:"flex",border:"1px solid "+S.border,marginBottom:28}}>
          {["signin","signup"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);setError("");setSuccess("");}}
              style={{flex:1,padding:10,fontSize:12,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",cursor:"pointer",border:"none",background:tab===t?S.accent:"transparent",color:tab===t?"white":S.muted}}>
              {t==="signin"?"Sign In":"Create Account"}
            </button>
          ))}
        </div>
        {tab==="signup" && F("Full Name","text",name,setName,"Your full name")}
        {F("Email","email",email,setEmail,"you@gmail.com")}
        {F("Password","password",password,setPassword,"••••••••")}
        {error && <div style={{color:S.accent,fontSize:12,marginBottom:12}}>{error}</div>}
        {success && <div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"10px 16px",fontSize:12,fontWeight:600,marginBottom:12}}>{success}</div>}
        <button onClick={tab==="signin"?signIn:signUp} disabled={loading}
          style={{...bS({width:"100%",padding:14}),background:S.accent,color:"white",opacity:loading?0.5:1}}>
          {loading?"Please wait...":tab==="signin"?"Sign In":"Create Account"}
        </button>
        <p style={{marginTop:16,fontSize:11,color:S.muted,textAlign:"center",lineHeight:1.7}}>
          Works with any email — Gmail, Yahoo, Hotmail, etc.<br/>Coach login: coach@v12system.com
        </p>
      </div>
    </div>
  );
}

function TopBar({ profile, isCoach, onLogout }) {
  return (
    <div style={{height:54,background:S.surface,borderBottom:"1px solid "+S.border,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",position:"sticky",top:0,zIndex:100}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:S.accent}}>V12</div>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <span style={{fontSize:13,color:S.muted}}>{profile?.name||profile?.email}</span>
        <div style={{width:32,height:32,borderRadius:"50%",background:isCoach?S.accent:S.accent2,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>
          {avatarFrom(profile?.name||profile?.email)}
        </div>
        <button onClick={onLogout} style={{...bS({}),background:"transparent",color:S.text,border:"1px solid "+S.border,padding:"7px 14px",fontSize:10}}>Sign out</button>
      </div>
    </div>
  );
}

function Sidebar({ isCoach, page, setPage }) {
  const nav = isCoach
    ? [{id:"dashboard",icon:"⚡",label:"Overview"},{id:"clients",icon:"👥",label:"Clients"},{id:"templates",icon:"📋",label:"Templates"},{id:"progress",icon:"📈",label:"Progress"}]
    : [{id:"dashboard",icon:"⚡",label:"Dashboard"},{id:"program",icon:"📋",label:"Training Plan"},{id:"nutrition",icon:"🥗",label:"Nutrition"},{id:"daily",icon:"✅",label:"Daily Check-In"},{id:"weekly",icon:"🔥",label:"Weekly Check-In"},{id:"progress",icon:"📈",label:"Progress"},{id:"workouts",icon:"🏋",label:"Workout Log"}];
  return (
    <nav className="sidebar" style={{width:216,background:S.surface,borderRight:"1px solid "+S.border,padding:"20px 0",flexShrink:0,position:"sticky",top:54,height:"calc(100vh - 54px)",overflowY:"auto"}}>
      <div style={{padding:"0 14px"}}>
        <div style={{fontSize:9,letterSpacing:"2.5px",textTransform:"uppercase",color:S.muted,padding:"0 10px",marginBottom:6}}>{isCoach?"Coach":"Training"}</div>
        {nav.map(item=>(
          <div key={item.id} onClick={()=>setPage(item.id)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",fontSize:13,fontWeight:500,color:page===item.id?S.accent:S.muted,cursor:"pointer",borderRadius:3,marginBottom:1,background:page===item.id?"rgba(255,77,0,.12)":"transparent"}}>
            <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}

const Card = ({children,style}) => <div style={{background:S.surface,border:"1px solid "+S.border,padding:24,marginBottom:20,...style}}>{children}</div>;
const CardTitle = ({children}) => <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:16}}>{children}</div>;
const PageTitle = ({title,sub}) => <><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,lineHeight:1,marginBottom:4}}>{title}</div><div style={{fontSize:13,color:S.muted,marginBottom:28}}>{sub}</div></>;
const Stat = ({label,value,unit}) => (
  <div style={{background:S.surface,border:"1px solid "+S.border,padding:20}}>
    <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:6}}>{label}</div>
    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,lineHeight:1}}>{value}<span style={{fontSize:13,color:S.muted}}>{unit}</span></div>
  </div>
);
const Fld = ({label,children}) => <div style={{marginBottom:16}}><label style={{display:"block",fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:6}}>{label}</label>{children}</div>;
const Inp = (props) => <input {...props} style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",...props.style}}/>;
const Sld = ({label,val,min,max,sfx,onChange}) => (
  <div>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:S.muted,marginBottom:6}}>
      <span>{label}</span><span style={{color:S.accent,fontWeight:600}}>{val}{sfx}</span>
    </div>
    <input type="range" min={min} max={max} value={val} onChange={e=>onChange(+e.target.value)}/>
  </div>
);
const RG = ({options,value,onChange,cap}) => (
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    {options.map(opt=>(
      <button key={opt} onClick={()=>onChange(opt)}
        style={{padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid "+(value===opt?S.accent:S.border),background:value===opt?"rgba(255,77,0,.08)":"transparent",color:value===opt?S.accent:S.muted,textTransform:cap?"capitalize":"none"}}>
        {opt}
      </button>
    ))}
  </div>
);
const CC = ({title,sub,children}) => (
  <Card><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,marginBottom:2}}>{title}</div><div style={{fontSize:11,color:S.muted,marginBottom:14}}>{sub}</div><div style={{height:230}}>{children}</div></Card>
);
const Btn = ({children,onClick,disabled,teal,sm,danger}) => (
  <button onClick={onClick} disabled={disabled}
    style={{...bS(sm?{padding:"7px 14px",fontSize:10}:{}),background:danger?"#c0392b":teal?S.accent2:S.accent,color:teal?"#0A0A0B":"white",opacity:disabled?0.5:1}}>
    {children}
  </button>
);

// Adherence over a trailing window: % of days with a daily check-in, plus the
// training-completion rate among those check-ins. Shared by client + coach views.
function adherenceFrom(checkins, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = cutoff.toISOString().split("T")[0];
  const recent = (checkins || []).filter((c) => c.date >= cut);
  const checkinDays = new Set(recent.map((c) => c.date)).size;
  const completed = recent.filter((c) => c.workout === "completed").length;
  return {
    score: Math.min(100, Math.round((checkinDays / days) * 100)),
    checkinDays,
    days,
    trainingRate: recent.length ? Math.round((completed / recent.length) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// CLIENT — WELCOME (shown until the client is onboarded / has a program)
// ---------------------------------------------------------------------------

function ClientWelcome({ profile, onEnter }) {
  const [status, setStatus] = useState({ exercises: 0, nutrition: false, loading: true });

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from("exercises")
        .select("*", { count: "exact", head: true })
        .eq("client_id", profile.id);
      const { data: nut } = await supabase
        .from("nutrition_plans")
        .select("id")
        .eq("client_id", profile.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      setStatus({ exercises: count || 0, nutrition: !!nut, loading: false });
    })();
  }, [profile.id]);

  const firstName = (profile.name || "").split(" ")[0] || "Athlete";
  const hasAssessment =
    profile.nervous_system_recruitment != null ||
    profile.muscular_density_to_size != null ||
    profile.metabolic_work_capacity != null;
  const steps = [
    { label: "Account created", done: true },
    { label: "V12 assessment received", done: hasAssessment },
    { label: "Training program built", done: status.exercises > 0 },
    { label: "Nutrition plan set", done: status.nutrition },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  const pillars = [
    ["LOOK GOOD", "Bodybuilding volume for the physique — sarcoplasmic fullness and size."],
    ["MOVE GOOD", "Athletic conditioning and explosive power — work capacity that carries over to life."],
    ["PERFORM GOOD", "Powerlifting strength for a nervous system that recruits everything you've got."],
  ];
  const next = [
    ["📋", "Program incoming", "Your coach is building a hybrid program tailored to your V12 assessment."],
    ["✅", "Daily & weekly check-ins", "Log training, recovery, and measurements so we can adapt in real time."],
    ["📈", "Progress tracking", "Weight, measurements, strength, photos, and an adherence score — all in one place."],
  ];

  return (
    <div style={{ position: "relative" }}>
      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", border: "1px solid " + S.border, background: S.surface, padding: "56px 40px", marginBottom: 24 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 0%, rgba(198,255,0,.14) 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(255,77,0,.10) 0%, transparent 50%)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: S.neon, marginBottom: 14 }}>V12 Performance Systems · Private Client</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 68, lineHeight: 0.95, letterSpacing: 1 }}>
            WELCOME, {firstName.toUpperCase()}.
          </div>
          <div style={{ fontSize: 15, color: S.text, opacity: 0.9, maxWidth: 620, marginTop: 16, lineHeight: 1.7 }}>
            You didn't join another fitness app. V12 is one hybrid system that builds the powerlifter's strength,
            the bodybuilder's physique, and the athlete's engine — at the same time. You'll{" "}
            <span style={{ color: S.neon, fontWeight: 700 }}>look good, move good, and perform good</span>, all at once.
          </div>
        </div>
      </div>

      {/* Three pillars */}
      <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {pillars.map(([title, body]) => (
          <div key={title} style={{ background: S.surface, border: "1px solid " + S.border, borderTop: "2px solid " + S.neon, padding: 22 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: S.neon, letterSpacing: 1 }}>{title}</div>
            <div style={{ fontSize: 13, color: S.muted, marginTop: 8, lineHeight: 1.6 }}>{body}</div>
          </div>
        ))}
      </div>

      {/* What to expect next */}
      <Card>
        <CardTitle>What happens next</CardTitle>
        <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          {next.map(([icon, title, body]) => (
            <div key={title}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12.5, color: S.muted, lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Onboarding status */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <CardTitle>Your onboarding status</CardTitle>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: S.neon }}>{pct}%</div>
        </div>
        <div style={{ height: 8, background: S.surface2, borderRadius: 4, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ width: pct + "%", height: "100%", background: S.neon, transition: "width .4s" }} />
        </div>
        {status.loading ? (
          <div className="spinner" style={{ margin: "10px auto" }} />
        ) : (
          steps.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid " + S.border }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: s.done ? S.neon : "transparent", color: s.done ? "#0A0A0B" : S.muted, border: s.done ? "none" : "1px solid " + S.border }}>
                {s.done ? "✓" : ""}
              </div>
              <span style={{ fontSize: 13.5, color: s.done ? S.text : S.muted }}>{s.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: s.done ? S.neon : S.muted }}>{s.done ? "Done" : "Pending"}</span>
            </div>
          ))
        )}
        <div style={{ marginTop: 18 }}>
          <Btn onClick={onEnter}>Enter your portal →</Btn>
        </div>
      </Card>
    </div>
  );
}

function ClientHome({ profile, setPage }) {
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    supabase.from("daily_checkins").select("*").eq("client_id",profile.id).order("date")
      .then(({data})=>{setCheckins(data||[]);setLoading(false);});
  },[profile.id]);

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  const doneToday = checkins.some(c=>c.date===todayStr());
  const r7 = checkins.slice(-7);
  const avgE = r7.length?(r7.reduce((s,c)=>s+c.energy,0)/r7.length).toFixed(1):"—";
  const avgS = r7.length?(r7.reduce((s,c)=>s+c.sleep,0)/r7.length).toFixed(1):"—";
  const lastW = checkins.length?checkins[checkins.length-1].weight:"—";
  const streak = (()=>{let s=0;for(let i=checkins.length-1;i>=0;i--){if(checkins[i].workout==="completed")s++;else break;}return s;})();

  return (
    <div>
      <PageTitle title={"Welcome back, "+((profile.name||"").split(" ")[0]||"Athlete")+"."} sub={profile.goal||"Keep pushing."}/>
      {!doneToday && (
        <div style={{background:"rgba(255,77,0,.09)",border:"1px solid rgba(255,77,0,.25)",padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontSize:13}}>Reminder: Daily check-in not done yet.</span>
          <Btn sm onClick={()=>setPage("daily")}>Do it now</Btn>
        </div>
      )}
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:22}}>
        <Stat label="Current Weight" value={lastW} unit="lb"/>
        <Stat label="Workout Streak" value={streak} unit="days"/>
        <Stat label="Avg Sleep" value={avgS} unit="/10"/>
        <Stat label="Avg Energy" value={avgE} unit="/10"/>
      </div>
      {checkins.length>1?(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <CC title="Bodyweight Trend" sub="Last 30 days">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={checkins.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={6}/>
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT}/>
                <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </CC>
          <CC title="Energy and Sleep" sub="14-day trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={checkins.slice(-14)}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={3}/>
                <YAxis domain={[0,10]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT}/>
                <Line type="monotone" dataKey="energy" stroke={S.accent} strokeWidth={2} dot={false} name="Energy"/>
                <Line type="monotone" dataKey="sleep" stroke={S.accent2} strokeWidth={2} dot={false} name="Sleep"/>
              </LineChart>
            </ResponsiveContainer>
          </CC>
        </div>
      ):(
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:32,marginBottom:12}}>📋</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,marginBottom:8}}>No check-ins yet</div>
          <div style={{color:S.muted,fontSize:13,marginBottom:20}}>Log your first daily check-in to start tracking.</div>
          <Btn onClick={()=>setPage("daily")}>Start Now</Btn>
        </Card>
      )}
    </div>
  );
}

function DailyCheckin({ profile, onDone }) {
  const [form, setForm] = useState({weight:"",sleep:7,energy:7,mood:7,water:8,diet:"On track",workout:"completed"});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existing, setExisting] = useState(null);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{
    supabase.from("daily_checkins").select("*").eq("client_id",profile.id).eq("date",todayStr()).maybeSingle()
      .then(({data})=>{if(data){setExisting(data);setForm({weight:data.weight||"",sleep:data.sleep,energy:data.energy,mood:data.mood,water:data.water,diet:data.diet,workout:data.workout});}});
  },[profile.id]);

  const submit = async () => {
    setLoading(true);
    const entry = {client_id:profile.id,date:todayStr(),...form,weight:parseFloat(form.weight)||null};
    if(existing) await supabase.from("daily_checkins").update(entry).eq("id",existing.id);
    else await supabase.from("daily_checkins").insert(entry);
    setSaved(true);setLoading(false);setTimeout(onDone,1400);
  };

  if(saved) return <div style={{textAlign:"center",paddingTop:80}}><div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"16px 32px",display:"inline-flex",fontSize:16,fontWeight:600}}>Check-in logged!</div></div>;

  return (
    <div>
      <PageTitle title="Daily Check-In" sub={todayStr()+(existing?" · Updating today":"")}/>
      <Card>
        <div className="cg" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <Fld label="Weight (lbs)"><Inp type="number" step="0.1" value={form.weight} onChange={e=>set("weight",e.target.value)} placeholder="185.0"/></Fld>
          <div/>
          <Sld label="Sleep Quality" val={form.sleep} min={1} max={10} sfx="/10" onChange={v=>set("sleep",v)}/>
          <Sld label="Energy Level" val={form.energy} min={1} max={10} sfx="/10" onChange={v=>set("energy",v)}/>
          <Sld label="Mood" val={form.mood} min={1} max={10} sfx="/10" onChange={v=>set("mood",v)}/>
          <Sld label="Water (glasses)" val={form.water} min={0} max={16} sfx=" glasses" onChange={v=>set("water",v)}/>
          <Fld label="Nutrition Today"><RG options={["On track","Mostly clean","Struggled","Off plan"]} value={form.diet} onChange={v=>set("diet",v)}/></Fld>
          <Fld label="Training Today"><RG options={["completed","rest","missed"]} value={form.workout} onChange={v=>set("workout",v)} cap/></Fld>
        </div>
        <div style={{marginTop:20}}><Btn onClick={submit} disabled={loading}>{loading?"Saving...":"Log Check-In"}</Btn></div>
      </Card>
    </div>
  );
}

function WeeklyCheckin({ profile, onDone }) {
  const weekStart = (()=>{const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().split("T")[0];})();
  const [form, setForm] = useState({chest:"",waist:"",hips:"",arms:"",feeling:7,goal_progress:70,notes:""});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existing, setExisting] = useState(null);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{
    supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).eq("date",weekStart).maybeSingle()
      .then(({data})=>{if(data){setExisting(data);setForm({chest:data.chest||"",waist:data.waist||"",hips:data.hips||"",arms:data.arms||"",feeling:data.feeling,goal_progress:data.goal_progress,notes:data.notes||""});}});
  },[profile.id]);

  const submit = async () => {
    setLoading(true);
    const entry = {client_id:profile.id,date:weekStart,...form,chest:parseFloat(form.chest)||null,waist:parseFloat(form.waist)||null,hips:parseFloat(form.hips)||null,arms:parseFloat(form.arms)||null};
    if(existing) await supabase.from("weekly_checkins").update(entry).eq("id",existing.id);
    else await supabase.from("weekly_checkins").insert(entry);
    setSaved(true);setLoading(false);setTimeout(onDone,1400);
  };

  if(saved) return <div style={{textAlign:"center",paddingTop:80}}><div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"16px 32px",display:"inline-flex",fontSize:16,fontWeight:600}}>Weekly check-in logged!</div></div>;

  return (
    <div>
      <PageTitle title="Weekly Check-In" sub={"Week of "+weekStart}/>
      <Card>
        <CardTitle>Measurements (inches)</CardTitle>
        <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
          {["chest","waist","hips","arms"].map(m=>(
            <Fld key={m} label={m.charAt(0).toUpperCase()+m.slice(1)}><Inp type="number" step="0.1" value={form[m]} onChange={e=>set(m,e.target.value)} placeholder="0.0"/></Fld>
          ))}
        </div>
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
          <Sld label="Overall Feeling" val={form.feeling} min={1} max={10} sfx="/10" onChange={v=>set("feeling",v)}/>
          <Sld label="Goal Progress" val={form.goal_progress} min={0} max={100} sfx="%" onChange={v=>set("goal_progress",v)}/>
        </div>
        <Fld label="Notes / Goal Review">
          <textarea rows={3} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="What went well? What needs work?"
            style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/>
        </Fld>
        <div style={{marginTop:8}}><Btn onClick={submit} disabled={loading}>{loading?"Saving...":"Submit Weekly Check-In"}</Btn></div>
      </Card>
    </div>
  );
}

function Progress({ profile }) {
  const [tab, setTab] = useState("weight");
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);

  useEffect(()=>{
    supabase.from("daily_checkins").select("*").eq("client_id",profile.id).order("date").then(({data})=>setDaily(data||[]));
    supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).order("date").then(({data})=>setWeekly((data||[]).map((w,i)=>({...w,week:"Wk"+(i+1)}))));
  },[profile.id]);

  const empty = <Card style={{textAlign:"center",padding:40,color:S.muted}}>No data yet. Complete check-ins to see charts.</Card>;
  const ts = (id) => ({padding:"10px 20px",fontSize:11,letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:600,cursor:"pointer",color:tab===id?S.accent:S.muted,background:"none",border:"none",borderBottom:tab===id?"2px solid "+S.accent:"2px solid transparent"});
  const adh = adherenceFrom(daily,30);
  const lastWeight = daily.length?daily[daily.length-1].weight:null;

  return (
    <div>
      <PageTitle title="Progress" sub="Your data over time"/>
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <Stat label="Adherence (30d)" value={adh.score} unit="%"/>
        <Stat label="Check-in Days" value={adh.checkinDays} unit={"/"+adh.days}/>
        <Stat label="Training Completion" value={adh.trainingRate} unit="%"/>
        <Stat label="Current Weight" value={lastWeight??"—"} unit={lastWeight?"lb":""}/>
      </div>
      <div style={{display:"flex",borderBottom:"1px solid "+S.border,marginBottom:24,flexWrap:"wrap"}}>
        {[["weight","Weight"],["wellness","Wellness"],["measurements","Measurements"],["strength","Strength"],["photos","Photos"],["goals","Goals"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={ts(id)}>{label}</button>
        ))}
      </div>

      {tab==="weight" && (daily.length<2?empty:(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <CC title="Bodyweight Trend" sub="Last 30 days">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={6}/>
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT}/>
                <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={{r:2}}/>
              </LineChart>
            </ResponsiveContainer>
          </CC>
          <CC title="Workout Completion" sub="Last 30 days">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily.slice(-30).map(d=>({...d,done:d.workout==="completed"?1:0}))}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={6}/>
                <YAxis tick={false}/>
                <Tooltip {...TT} formatter={v=>[v?"Done":"Rest/Missed",""]}/>
                <Bar dataKey="done" fill={S.accent} radius={[2,2,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </CC>
        </div>
      ))}

      {tab==="wellness" && (daily.length<2?empty:(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {[["energy",S.accent,"Energy"],["sleep",S.accent2,"Sleep Quality"],["mood","#8B5CF6","Mood"],["water","#3B82F6","Water (glasses)"]].map(([key,color,label])=>(
            <CC key={key} title={label} sub="14-day trend">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={3}/>
                  <YAxis domain={[0,key==="water"?16:10]} tick={{fontSize:10,fill:"#666"}}/>
                  <Tooltip {...TT}/>
                  <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </CC>
          ))}
        </div>
      ))}

      {tab==="measurements" && (weekly.length===0?empty:(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {[["chest","Chest"],["waist","Waist"],["hips","Hips"],["arms","Arms"]].map(([key,label])=>(
            <CC key={key} title={label+" (inches)"} sub="Weekly tracking">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="week" tick={{fontSize:10,fill:"#666"}}/>
                  <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                  <Tooltip {...TT}/>
                  <Line type="monotone" dataKey={key} stroke={S.accent2} strokeWidth={2} dot={{r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            </CC>
          ))}
        </div>
      ))}

      {tab==="strength" && <StrengthTab profile={profile}/>}

      {tab==="photos" && <ProgressPhotos profile={profile}/>}

      {tab==="goals" && (weekly.length===0?empty:(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <CC title="Goal Progress" sub="Weekly percent">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="week" tick={{fontSize:10,fill:"#666"}}/>
                <YAxis domain={[0,100]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT} formatter={v=>[v+"%","Progress"]}/>
                <Bar dataKey="goal_progress" fill={S.accent} radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </CC>
          <CC title="Weekly Feeling" sub="Overall rating">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="week" tick={{fontSize:10,fill:"#666"}}/>
                <YAxis domain={[0,10]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT}/>
                <Line type="monotone" dataKey="feeling" stroke={S.accent2} strokeWidth={2} dot={{r:3}}/>
              </LineChart>
            </ResponsiveContainer>
          </CC>
        </div>
      ))}
    </div>
  );
}

// Strength progression: top set per exercise per day, from the workout logs.
function StrengthTab({ profile }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      const {data:logs} = await supabase.from("workout_logs").select("*").eq("client_id",profile.id).order("date");
      const {data:exs} = await supabase.from("exercises").select("id,name,is_bodyweight").eq("client_id",profile.id);
      const exMap = {}; (exs||[]).forEach(e=>{exMap[e.id]=e;});
      const byEx = {};
      (logs||[]).forEach(l=>{
        const ex = exMap[l.exercise_id]; if(!ex) return;
        const val = ex.is_bodyweight ? (l.reps||0) : (l.weight||0);
        if(!byEx[l.exercise_id]) byEx[l.exercise_id] = {name:ex.name,is_bodyweight:ex.is_bodyweight,byDate:{}};
        const d = byEx[l.exercise_id].byDate;
        d[l.date] = Math.max(d[l.date]||0, val);
      });
      const out = Object.values(byEx).map(e=>({
        name:e.name, is_bodyweight:e.is_bodyweight,
        data:Object.entries(e.byDate).map(([date,value])=>({date,value})).sort((a,b)=>a.date<b.date?-1:1),
      })).filter(e=>e.data.length>0);
      setSeries(out); setLoading(false);
    })();
  },[profile.id]);

  if(loading) return <div className="spinner" style={{margin:"40px auto"}}/>;
  if(series.length===0) return <Card style={{textAlign:"center",padding:40,color:S.muted}}>No logged sessions yet. Strength progress appears as you log workouts.</Card>;

  return (
    <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
      {series.map(s=>(
        <CC key={s.name} title={s.name} sub={s.is_bodyweight?"Top-set reps over time":"Top-set weight over time"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={s.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
              <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
              <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
              <Tooltip {...TT}/>
              <Line type="monotone" dataKey="value" stroke={S.neon} strokeWidth={2} dot={{r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </CC>
      ))}
    </div>
  );
}

// Progress photos: upload to private storage, gallery via short-lived signed URLs.
function ProgressPhotos({ profile }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async()=>{
    const {data:rows} = await supabase.from("progress_photos").select("*").eq("client_id",profile.id).order("created_at",{ascending:false});
    const paths = (rows||[]).map(r=>r.path);
    const urls = {};
    if(paths.length){
      const {data:signed} = await supabase.storage.from("progress-photos").createSignedUrls(paths, 3600);
      (signed||[]).forEach(s=>{ if(s.path && s.signedUrl) urls[s.path]=s.signedUrl; });
    }
    setPhotos((rows||[]).map(r=>({...r, url:urls[r.path]})));
    setLoading(false);
  },[profile.id]);
  useEffect(()=>{load();},[load]);

  const onUpload = async(e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    setUploading(true); setErr(null);
    try{
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase();
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const {error:upErr} = await supabase.storage.from("progress-photos").upload(path, file, {upsert:false, contentType:file.type});
      if(upErr) throw upErr;
      const {error:insErr} = await supabase.from("progress_photos").insert({client_id:profile.id, path, taken_on:todayStr()});
      if(insErr) throw insErr;
      await load();
    }catch(e2){ setErr(e2.message); }
    finally{ setUploading(false); e.target.value=""; }
  };

  const remove = async(p)=>{
    if(!window.confirm("Delete this photo?")) return;
    await supabase.storage.from("progress-photos").remove([p.path]);
    await supabase.from("progress_photos").delete().eq("id",p.id);
    await load();
  };

  return (
    <div>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>Progress Photos</div>
            <div style={{fontSize:11,color:S.muted}}>Private to you and your coach. Shoot in consistent lighting and angle for the best comparison.</div>
          </div>
          <label style={{...bS({}),background:S.neon,color:"#0A0A0B",display:"inline-block",cursor:uploading?"default":"pointer",opacity:uploading?0.6:1}}>
            {uploading?"Uploading...":"+ Upload Photo"}
            <input type="file" accept="image/*" onChange={onUpload} disabled={uploading} style={{display:"none"}}/>
          </label>
        </div>
        {err && <div style={{color:"#ff6b5b",fontSize:12,marginTop:10}}>{err}</div>}
      </Card>
      {loading ? <div className="spinner" style={{margin:"40px auto"}}/> :
        photos.length===0 ? <Card style={{textAlign:"center",padding:40,color:S.muted}}>No photos yet. Upload your first to start your visual timeline.</Card> :
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
          {photos.map(p=>(
            <div key={p.id} style={{border:"1px solid "+S.border,background:S.surface}}>
              {p.url
                ? <img src={p.url} alt="" style={{width:"100%",height:210,objectFit:"cover",display:"block"}}/>
                : <div style={{height:210,display:"flex",alignItems:"center",justifyContent:"center",color:S.muted,fontSize:12}}>unavailable</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px"}}>
                <span style={{fontSize:11,color:S.muted}}>{p.taken_on||(p.created_at||"").slice(0,10)}</span>
                <button onClick={()=>remove(p)} style={{background:"none",border:"none",color:"#ff6b5b",cursor:"pointer",fontSize:11,fontWeight:600}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

function Workouts({ profile }) {
  const [exercises, setExercises] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [logMode, setLogMode] = useState(false);
  const blankRow = () => ({weight:"",reps:"",time:""});
  const freshSets = (n) => Array.from({length: Math.min(8, Math.max(1, parseInt(n)||4))}, blankRow);
  const [sets, setSets] = useState(freshSets(4));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadEx = useCallback(async()=>{
    const {data} = await supabase.from("exercises").select("*").eq("client_id",profile.id).order("created_at");
    setExercises(data||[]);
    if(data&&data.length>0&&!selected) setSelected(data[0].id);
  },[profile.id]);

  useEffect(()=>{loadEx();},[loadEx]);
  useEffect(()=>{
    if(!selected) return;
    supabase.from("workout_logs").select("*").eq("client_id",profile.id).eq("exercise_id",selected).order("date")
      .then(({data})=>setLogs(data||[]));
  },[selected,profile.id,saved]);

  const handleLog = async()=>{
    setSaving(true);
    const ex = exercises.find(e=>e.id===selected);
    const entries = sets.filter(s=>s.reps||s.weight).map((s,i)=>({
      client_id:profile.id,exercise_id:selected,date:todayStr(),
      sets:i+1,reps:parseInt(s.reps)||null,
      weight:ex?.is_bodyweight?null:parseFloat(s.weight)||null,
      time:s.time||null
    }));
    if(entries.length>0) await supabase.from("workout_logs").insert(entries);
    setSaving(false);setSaved(true);setLogMode(false);
    setSets(freshSets(ex?.sets));
    setTimeout(()=>setSaved(false),2000);
  };

  const selectedEx = exercises.find(e=>e.id===selected);
  const chartData = logs.reduce((acc,log)=>{const ex=acc.find(a=>a.date===log.date);if(!ex)acc.push({date:log.date,weight:log.weight,reps:log.reps});return acc;},[]);

  // Group the program's exercises by training day for the selector.
  const byDay = {};
  exercises.forEach(ex=>{ const k = ex.day_of_week || "Other"; (byDay[k]=byDay[k]||[]).push(ex); });
  const dayKeys = Object.keys(byDay).sort((a,b)=>{
    const ia=DAY_ORDER.indexOf(a), ib=DAY_ORDER.indexOf(b);
    return (ia===-1?99:ia)-(ib===-1?99:ib);
  });

  return (
    <div>
      <PageTitle title="Workout Log" sub="Track your strength progression"/>
      {saved && <div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"10px 18px",fontSize:12,fontWeight:600,marginBottom:16,display:"inline-flex"}}>Session logged!</div>}
      {exercises.length===0?(
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:32,marginBottom:12}}>🏋</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,marginBottom:8}}>No exercises assigned yet</div>
          <div style={{color:S.muted,fontSize:13}}>Your coach will assign your program. Check back soon.</div>
        </Card>
      ):(
        <>
          <div style={{marginBottom:22}}>
            {dayKeys.map(day=>(
              <div key={day} style={{marginBottom:14}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:8}}>{day}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {byDay[day].map(ex=>(
                    <button key={ex.id} onClick={()=>{setSelected(ex.id);setLogMode(false);}}
                      style={{padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid "+(selected===ex.id?S.accent:S.border),background:selected===ex.id?"rgba(255,77,0,.08)":"transparent",color:selected===ex.id?S.accent:S.muted}}>
                      {ex.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {selectedEx&&(
            <>
              <Card style={{marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22}}>{selectedEx.name}</div>
                    <div style={{fontSize:12,color:S.muted}}>{[selectedEx.day_of_week,selectedEx.category].filter(Boolean).join(" · ")||"Unscheduled"}{selectedEx.is_bodyweight?" · bodyweight":""}</div>
                    {selectedEx.notes&&<div style={{fontSize:12,color:S.muted,marginTop:8,lineHeight:1.6,maxWidth:560}}>{selectedEx.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:24}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:4}}>Target Sets</div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30}}>{selectedEx.sets??"—"}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:4}}>Target Reps</div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30}}>{selectedEx.reps??"—"}</div>
                    </div>
                  </div>
                </div>
              </Card>
              <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
                <CC title={selectedEx.name+" Progress"} sub={selectedEx.is_bodyweight?"Reps over time":"Weight over time"}>
                  {chartData.length===0
                    ?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:S.muted,fontSize:13}}>Log sessions to see chart</div>
                    :<ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                        <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                        <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                        <Tooltip {...TT}/>
                        <Line type="monotone" dataKey={selectedEx.is_bodyweight?"reps":"weight"} stroke={S.accent} strokeWidth={2} dot={{r:3}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  }
                </CC>
                <CC title="Reps per Session" sub="Top set reps over time">
                  {chartData.length===0
                    ?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:S.muted,fontSize:13}}>No data yet</div>
                    :<ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                        <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                        <YAxis tick={{fontSize:10,fill:"#666"}}/>
                        <Tooltip {...TT}/>
                        <Bar dataKey="reps" fill={S.accent2} radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  }
                </CC>
              </div>
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted}}>Session History</div>
                  <Btn sm teal onClick={()=>{const open=!logMode; setLogMode(open); if(open) setSets(freshSets(selectedEx.sets));}}>{logMode?"Cancel":"+ Log Session"}</Btn>
                </div>
                {logMode&&(
                  <div style={{marginBottom:20,padding:16,background:S.surface2,border:"1px solid "+S.border}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14,flexWrap:"wrap",gap:8}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18}}>Log {selectedEx.name}</div>
                      <div style={{fontSize:11,color:S.muted}}>Target: {selectedEx.sets??"—"} × {selectedEx.reps??"—"}</div>
                    </div>
                    {sets.map((s,i)=>(
                      <div key={i} style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:11,color:S.muted,width:42}}>Set {i+1}</span>
                        {!selectedEx.is_bodyweight&&<input type="number" placeholder="lbs" value={s.weight} onChange={e=>{const n=[...sets];n[i].weight=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:80,outline:"none"}}/>}
                        <input type="number" placeholder={selectedEx.reps?`reps (${selectedEx.reps})`:"reps"} value={s.reps} onChange={e=>{const n=[...sets];n[i].reps=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:110,outline:"none"}}/>
                        <input type="text" placeholder="time (opt)" value={s.time} onChange={e=>{const n=[...sets];n[i].time=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:100,outline:"none"}}/>
                        {sets.length>1&&<button onClick={()=>setSets(sets.filter((_,j)=>j!==i))} title="Remove set" style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}}>×</button>}
                      </div>
                    ))}
                    <div style={{display:"flex",gap:10,marginTop:14,alignItems:"center"}}>
                      <Btn onClick={handleLog} disabled={saving}>{saving?"Saving...":"Save Session"}</Btn>
                      <button onClick={()=>setSets([...sets,blankRow()])} style={{background:"none",border:"1px solid "+S.border,color:S.text,padding:"8px 14px",fontSize:10,fontWeight:600,cursor:"pointer",textTransform:"uppercase",letterSpacing:"1px"}}>+ Add Set</button>
                    </div>
                  </div>
                )}
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Date","Weight","Reps","Set","Time"].map(h=><th key={h} style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,textAlign:"left",padding:"10px 14px",borderBottom:"1px solid "+S.border}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...logs].reverse().map((row,i)=>(
                      <tr key={i}>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.date}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.weight?row.weight+" lbs":"BW"}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.reps||"—"}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.sets}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.time||"—"}</td>
                      </tr>
                    ))}
                    {logs.length===0&&<tr><td colSpan={5} style={{padding:"11px 14px",fontSize:13,color:S.muted,textAlign:"center"}}>No sessions logged yet</td></tr>}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Coach priority dashboard: surfaces clients who need attention based on missed
// check-ins, low adherence, no recent activity, or a wrong-direction weight trend.
function CoachHome({ setPage }) {
  const [clients, setClients] = useState([]);
  const [byClient, setByClient] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      const {data:cl} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL);
      const list = cl||[];
      const ids = list.map(c=>c.id);
      const grouped = {};
      if(ids.length){
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-29);
        const cut = cutoff.toISOString().split("T")[0];
        const {data:ch} = await supabase.from("daily_checkins")
          .select("client_id,date,weight,workout").in("client_id",ids).gte("date",cut).order("date");
        (ch||[]).forEach(r=>{ (grouped[r.client_id]=grouped[r.client_id]||[]).push(r); });
      }
      setClients(list); setByClient(grouped); setLoading(false);
    })();
  },[]);

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  const today = todayStr();
  const daysSinceDate = (d)=> Math.round((new Date(today) - new Date(d)) / 86400000);

  const assessed = clients.map(c=>{
    const ch = byClient[c.id] || [];
    const adh = adherenceFrom(ch, 30);
    const last = ch.length ? ch[ch.length-1].date : null;
    const since = last ? daysSinceDate(last) : null;
    const flags = [];
    if(since==null) flags.push({label:"No activity yet", tone:"red"});
    else if(since>7) flags.push({label:`No activity ${since}d`, tone:"red"});
    else if(since>=3) flags.push({label:`${since}d since check-in`, tone:"amber"});
    if(adh.score<50) flags.push({label:`Adherence ${adh.score}%`, tone:"amber"});
    const weights = ch.filter(r=>r.weight!=null);
    if(weights.length>=2){
      const delta = weights[weights.length-1].weight - weights[0].weight;
      const goal = (c.goal||"").toLowerCase();
      const wantsLoss = /(loss|lean|cut|shred|fat)/.test(goal);
      const wantsGain = /(gain|muscle|bulk|mass|size|strength)/.test(goal);
      if(wantsLoss && delta>1) flags.push({label:`Weight ▲ ${delta.toFixed(1)}lb`, tone:"red"});
      else if(wantsGain && delta<-1) flags.push({label:`Weight ▼ ${Math.abs(delta).toFixed(1)}lb`, tone:"red"});
    }
    const severity = flags.reduce((s,f)=>s+(f.tone==="red"?2:1),0);
    return {client:c, adh, last, since, flags, severity};
  });

  const needs = assessed.filter(a=>a.flags.length>0).sort((a,b)=>b.severity-a.severity);
  const avgAdh = clients.length ? Math.round(assessed.reduce((s,a)=>s+a.adh.score,0)/clients.length) : 0;

  const Chip = ({f}) => (
    <span style={{padding:"3px 9px",fontSize:10,fontWeight:600,
      background:f.tone==="red"?"rgba(192,57,43,.16)":"rgba(245,158,11,.14)",
      color:f.tone==="red"?"#ff6b5b":"#f5a623"}}>{f.label}</span>
  );

  return (
    <div>
      <PageTitle title="Coach Dashboard" sub="V12 System · Priority overview"/>
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <Stat label="Total Clients" value={clients.length} unit=""/>
        <Stat label="Need Attention" value={needs.length} unit=""/>
        <Stat label="On Track" value={clients.length-needs.length} unit=""/>
        <Stat label="Avg Adherence" value={avgAdh} unit="%"/>
      </div>

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <CardTitle>⚠ Needs Attention</CardTitle>
          <Btn sm teal onClick={()=>setPage("clients")}>Manage Clients</Btn>
        </div>
        {clients.length===0 && <div style={{color:S.muted,fontSize:13,padding:"16px 0"}}>No clients yet. Share the app URL with your clients.</div>}
        {clients.length>0 && needs.length===0 && <div style={{color:S.accent2,fontSize:13,padding:"8px 0"}}>All clients are on track. Nice work.</div>}
        {needs.map(a=>(
          <div key={a.client.id} onClick={()=>setPage("clients")}
            style={{background:S.surface,border:"1px solid "+S.border,borderLeft:"3px solid "+(a.severity>=2?"#c0392b":"#f5a623"),padding:"16px 18px",display:"flex",alignItems:"center",gap:16,cursor:"pointer",marginBottom:10}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:S.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>
              {avatarFrom(a.client.name||a.client.email)}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14}}>{a.client.name||a.client.email}</div>
              <div style={{fontSize:12,color:S.muted}}>{a.client.goal||"No goal set"} · {a.last?`last check-in ${a.last}`:"never checked in"}</div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:"50%"}}>
              {a.flags.map((f,i)=><Chip key={i} f={f}/>)}
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <CardTitle>All Clients</CardTitle>
        {assessed.map((a,i)=>(
          <div key={a.client.id} onClick={()=>setPage("clients")}
            style={{background:S.surface,border:"1px solid "+S.border,padding:"16px 18px",display:"flex",alignItems:"center",gap:16,cursor:"pointer",marginBottom:10}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:COLORS[i%COLORS.length],color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>
              {avatarFrom(a.client.name||a.client.email)}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:14}}>{a.client.name||a.client.email}</div>
              <div style={{fontSize:12,color:S.muted}}>{a.client.goal||"No goal set"}</div>
            </div>
            <div style={{textAlign:"right",fontSize:12}}>
              <div style={{color:a.adh.score<50?"#f5a623":S.accent2,fontWeight:600}}>{a.adh.score}% adherence</div>
              <div style={{color:S.muted,marginTop:2}}>{a.last?`last ${a.last}`:"no check-ins"}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ClientsPanel() {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEx, setNewEx] = useState({name:"",category:"",is_bodyweight:false});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [assess, setAssess] = useState({nervous_system_recruitment:5,muscular_density_to_size:5,metabolic_work_capacity:5});
  const [savingAssess, setSavingAssess] = useState(false);
  const [assessMsg, setAssessMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const loadClients = async()=>{
    const {data} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL);
    setClients(data||[]);
    if(data&&data.length>0&&!selected) setSelected(data[0].id);
    setLoading(false);
  };
  const loadEx = async(id)=>{
    const {data} = await supabase.from("exercises").select("*").eq("client_id",id).order("created_at");
    setExercises(data||[]);
  };

  useEffect(()=>{loadClients();},[]);
  useEffect(()=>{
    supabase.from("program_templates").select("*").order("name").then(({data})=>setTemplates(data||[]));
  },[]);
  useEffect(()=>{if(selected){loadEx(selected);setGenMsg(null);}},[selected]);
  // Sync the assessment editor to the selected client.
  useEffect(()=>{
    const c = clients.find(x=>x.id===selected);
    if(c) setAssess({
      nervous_system_recruitment: c.nervous_system_recruitment ?? 5,
      muscular_density_to_size: c.muscular_density_to_size ?? 5,
      metabolic_work_capacity: c.metabolic_work_capacity ?? 5,
    });
    setAssessMsg(null);
  },[selected, clients]);

  const saveAssessment = async()=>{
    setSavingAssess(true); setAssessMsg(null);
    const {error} = await supabase.from("profiles").update({
      nervous_system_recruitment: assess.nervous_system_recruitment,
      muscular_density_to_size: assess.muscular_density_to_size,
      metabolic_work_capacity: assess.metabolic_work_capacity,
    }).eq("id",selected);
    setSavingAssess(false);
    if(error){ setAssessMsg({ok:false,text:error.message}); return; }
    setAssessMsg({ok:true,text:"Assessment saved."});
    await loadClients();
  };

  // Re-pull this client's intake + scores from Notion into their profile.
  const refreshFromNotion = async(client)=>{
    setSyncing(true); setAssessMsg(null);
    try{
      const r = await fetch("/api/sync-client",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({client_email:client.email}),
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||`Request failed (${r.status})`);
      setAssessMsg({ok:true,text:data.updated?.length?`Synced from Notion (${data.updated.join(", ")}).`:"Notion had nothing new to sync."});
      await loadClients();
    }catch(e){
      setAssessMsg({ok:false,text:e.message});
    }finally{
      setSyncing(false);
    }
  };

  const addEx = async()=>{
    if(!newEx.name) return;
    setSaving(true);
    await supabase.from("exercises").insert({...newEx,client_id:selected});
    await loadEx(selected);
    setNewEx({name:"",category:"",is_bodyweight:false});
    setShowAdd(false);setSaving(false);
  };
  const delEx = async(id)=>{
    await supabase.from("exercises").delete().eq("id",id);
    await loadEx(selected);
  };

  // Runs the full pipeline: Notion -> AI (training + nutrition) -> Supabase.
  const generateProgram = async(client)=>{
    setGenerating(true); setGenMsg(null);
    try{
      const r = await fetch("/api/generate-program",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({client_email:client.email, template_id:templateId||undefined}),
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||`Request failed (${r.status})`);
      setGenMsg({ok:true,text:`Generated "${data.program}"${data.template?` from ${data.template}`:""} — ${data.exercises_created} exercises, ${data.meals_created} meals${data.calories?`, ${data.calories} kcal/day`:""}.`});
      await loadEx(selected);
    }catch(e){
      setGenMsg({ok:false,text:e.message});
    }finally{
      setGenerating(false);
    }
  };

  const client = clients.find(c=>c.id===selected);
  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  return (
    <div>
      <PageTitle title="Clients" sub="Manage programs and view client data"/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:22}}>
        {clients.map(c=>(
          <button key={c.id} onClick={()=>setSelected(c.id)}
            style={{padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid "+(selected===c.id?S.accent:S.border),background:selected===c.id?"rgba(255,77,0,.08)":"transparent",color:selected===c.id?S.accent:S.muted}}>
            {c.name||c.email}
          </button>
        ))}
        {clients.length===0&&<div style={{color:S.muted,fontSize:13}}>No clients yet. Share the app URL with your clients.</div>}
      </div>
      {client&&(
        <>
          <Card style={{marginBottom:20}}>
            <div style={{display:"flex",gap:16,alignItems:"center"}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:S.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,flexShrink:0}}>
                {avatarFrom(client.name||client.email)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22}}>{client.name||"—"}</div>
                <div style={{fontSize:12,color:S.muted}}>{client.email} · Joined {client.created_at?.split("T")[0]}</div>
                <div style={{fontSize:13,marginTop:4}}>{client.goal||"No goal set"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:230}}>
                <select value={templateId} onChange={e=>setTemplateId(e.target.value)}
                  style={{background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"10px 12px",fontSize:13,outline:"none"}}>
                  <option value="">Client's Notion template (default)</option>
                  {templates.map(t=>(
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <Btn onClick={()=>generateProgram(client)} disabled={generating}>
                  {generating?"Generating...":"⚡ Generate AI Program"}
                </Btn>
              </div>
            </div>
            <div style={{fontSize:11,color:S.muted,marginTop:12}}>
              Pulls this client's intake from Notion, builds a training + nutrition plan with AI from the selected template, and publishes it to their portal.
            </div>
            {genMsg && (
              <div style={{marginTop:12,padding:"10px 16px",fontSize:12,fontWeight:600,
                background:genMsg.ok?"rgba(0,201,167,.14)":"rgba(192,57,43,.16)",
                color:genMsg.ok?S.accent2:"#ff6b5b"}}>
                {genMsg.text}
              </div>
            )}
          </Card>
          <Card style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <CardTitle>V12 Assessment — three systems</CardTitle>
              <Btn sm teal onClick={()=>refreshFromNotion(client)} disabled={syncing}>
                {syncing?"Syncing...":"↻ Refresh from Notion"}
              </Btn>
            </div>
            <div style={{fontSize:11,color:S.muted,marginBottom:16}}>
              Drives the weekly balance of the three pillars. Pulled from the client's Notion application; override here as you reassess.
            </div>
            <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
              <Sld label="Nervous System Recruitment" val={assess.nervous_system_recruitment} min={1} max={10} sfx="/10" onChange={v=>setAssess(p=>({...p,nervous_system_recruitment:v}))}/>
              <Sld label="Muscular Density-to-Size" val={assess.muscular_density_to_size} min={1} max={10} sfx="/10" onChange={v=>setAssess(p=>({...p,muscular_density_to_size:v}))}/>
              <Sld label="Metabolic Work Capacity" val={assess.metabolic_work_capacity} min={1} max={10} sfx="/10" onChange={v=>setAssess(p=>({...p,metabolic_work_capacity:v}))}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14,marginTop:18}}>
              <Btn onClick={saveAssessment} disabled={savingAssess}>{savingAssess?"Saving...":"Save Assessment"}</Btn>
              {assessMsg && (
                <span style={{fontSize:12,fontWeight:600,color:assessMsg.ok?S.accent2:"#ff6b5b"}}>{assessMsg.text}</span>
              )}
            </div>
          </Card>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <CardTitle>Assigned Exercises</CardTitle>
              <Btn sm teal onClick={()=>setShowAdd(true)}>+ Add Exercise</Btn>
            </div>
            {showAdd&&(
              <div style={{background:S.surface2,border:"1px solid "+S.border,padding:20,marginBottom:16}}>
                <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                  <Fld label="Exercise Name"><Inp type="text" value={newEx.name} onChange={e=>setNewEx(p=>({...p,name:e.target.value}))} placeholder="e.g. Squat"/></Fld>
                  <Fld label="Category"><Inp type="text" value={newEx.category} onChange={e=>setNewEx(p=>({...p,category:e.target.value}))} placeholder="e.g. Lower Body"/></Fld>
                  <Fld label="Type">
                    <RG options={["Weighted","Bodyweight"]} value={newEx.is_bodyweight?"Bodyweight":"Weighted"} onChange={v=>setNewEx(p=>({...p,is_bodyweight:v==="Bodyweight"}))}/>
                  </Fld>
                </div>
                <div style={{display:"flex",gap:10,marginTop:8}}>
                  <Btn sm onClick={addEx} disabled={saving}>{saving?"Saving...":"Add Exercise"}</Btn>
                  <button onClick={()=>setShowAdd(false)} style={{padding:"7px 14px",fontSize:10,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>Cancel</button>
                </div>
              </div>
            )}
            {exercises.length===0&&<div style={{color:S.muted,fontSize:13,padding:"16px 0"}}>No exercises assigned yet.</div>}
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Exercise","Category","Type",""].map(h=><th key={h} style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,textAlign:"left",padding:"10px 14px",borderBottom:"1px solid "+S.border}}>{h}</th>)}</tr></thead>
              <tbody>
                {exercises.map(ex=>(
                  <tr key={ex.id}>
                    <td style={{padding:"11px 14px",fontSize:13,fontWeight:500,borderBottom:"1px solid "+S.border}}>{ex.name}</td>
                    <td style={{padding:"11px 14px",fontSize:13,color:S.muted,borderBottom:"1px solid "+S.border}}>{ex.category||"—"}</td>
                    <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>
                      <span style={{padding:"3px 10px",fontSize:10,fontWeight:600,background:ex.is_bodyweight?"rgba(102,102,112,.2)":"rgba(255,77,0,.15)",color:ex.is_bodyweight?S.muted:S.accent}}>
                        {ex.is_bodyweight?"Bodyweight":"Weighted"}
                      </span>
                    </td>
                    <td style={{padding:"11px 14px",borderBottom:"1px solid "+S.border}}><Btn sm danger onClick={()=>delEx(ex.id)}>Remove</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function CoachProgress() {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    supabase.from("profiles").select("*").neq("email",COACH_EMAIL)
      .then(({data})=>{setClients(data||[]);if(data&&data.length>0)setSelected(data[0]);setLoading(false);});
  },[]);

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  return (
    <div>
      <PageTitle title="All Progress" sub="View any client's full progress data"/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24}}>
        {clients.map(c=>(
          <button key={c.id} onClick={()=>setSelected(c)}
            style={{padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid "+(selected?.id===c.id?S.accent:S.border),background:selected?.id===c.id?"rgba(255,77,0,.08)":"transparent",color:selected?.id===c.id?S.accent:S.muted}}>
            {c.name||c.email}
          </button>
        ))}
      </div>
      {selected&&<Progress profile={selected}/>}
      {clients.length===0&&<div style={{color:S.muted,fontSize:13}}>No clients yet.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COACH — TEMPLATE MANAGEMENT (create / edit / delete program templates)
// ---------------------------------------------------------------------------

const BLANK_TEMPLATE = { name:"", goal:"", days_per_week:4, description:"", structure:"" };

function TemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // null | "new" | template id
  const [form, setForm] = useState(BLANK_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async()=>{
    const {data} = await supabase.from("program_templates").select("*").order("name");
    setTemplates(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const startNew = ()=>{ setEditing("new"); setForm(BLANK_TEMPLATE); setMsg(null); };
  const startEdit = (t)=>{
    setEditing(t.id);
    setForm({name:t.name||"",goal:t.goal||"",days_per_week:t.days_per_week||4,description:t.description||"",structure:t.structure||""});
    setMsg(null);
  };
  const cancel = ()=>{ setEditing(null); setForm(BLANK_TEMPLATE); };

  const save = async()=>{
    if(!form.name.trim()){ setMsg({ok:false,text:"Name is required."}); return; }
    setSaving(true); setMsg(null);
    const payload = {
      name:form.name.trim(), goal:form.goal.trim()||null,
      days_per_week:parseInt(form.days_per_week)||null,
      description:form.description.trim()||null, structure:form.structure.trim()||null,
    };
    const { error } = editing==="new"
      ? await supabase.from("program_templates").insert(payload)
      : await supabase.from("program_templates").update(payload).eq("id",editing);
    setSaving(false);
    if(error){ setMsg({ok:false,text:error.message}); return; }
    setMsg({ok:true,text:editing==="new"?"Template created.":"Template updated."});
    setEditing(null); setForm(BLANK_TEMPLATE);
    await load();
  };

  const remove = async(t)=>{
    if(!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("program_templates").delete().eq("id",t.id);
    if(error){ setMsg({ok:false,text:error.message}); return; }
    if(editing===t.id) cancel();
    await load();
  };

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  return (
    <div>
      <PageTitle title="Templates" sub="Reusable training blueprints for AI program generation"/>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <Btn teal onClick={startNew}>+ New Template</Btn>
      </div>

      {msg && (
        <div style={{marginBottom:16,padding:"10px 16px",fontSize:12,fontWeight:600,
          background:msg.ok?"rgba(0,201,167,.14)":"rgba(192,57,43,.16)",
          color:msg.ok?S.accent2:"#ff6b5b"}}>
          {msg.text}
        </div>
      )}

      {editing && (
        <Card>
          <CardTitle>{editing==="new"?"New Template":"Edit Template"}</CardTitle>
          <div className="g3" style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:16}}>
            <Fld label="Name"><Inp type="text" value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Hypertrophy — Upper/Lower"/></Fld>
            <Fld label="Goal"><Inp type="text" value={form.goal} onChange={e=>set("goal",e.target.value)} placeholder="e.g. Hypertrophy"/></Fld>
            <Fld label="Days / Week"><Inp type="number" min={1} max={7} value={form.days_per_week} onChange={e=>set("days_per_week",e.target.value)}/></Fld>
          </div>
          <Fld label="Short Description"><Inp type="text" value={form.description} onChange={e=>set("description",e.target.value)} placeholder="One-line summary shown to coaches"/></Fld>
          <Fld label="Structure (the blueprint the AI follows)">
            <textarea rows={5} value={form.structure} onChange={e=>set("structure",e.target.value)}
              placeholder="Describe the split, set/rep schemes, progression, and any rules the AI should follow."
              style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/>
          </Fld>
          <div style={{display:"flex",gap:10,marginTop:8}}>
            <Btn onClick={save} disabled={saving}>{saving?"Saving...":"Save Template"}</Btn>
            <button onClick={cancel} style={{padding:"10px 20px",fontSize:12,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>Cancel</button>
          </div>
        </Card>
      )}

      {templates.length===0 && !editing && (
        <Card style={{textAlign:"center",padding:40,color:S.muted}}>No templates yet. Create your first one.</Card>
      )}

      {templates.map(t=>(
        <Card key={t.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16}}>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{t.name}</div>
              <div style={{display:"flex",gap:14,fontSize:11,color:S.muted,margin:"4px 0 10px"}}>
                {t.goal && <span>{t.goal}</span>}
                {t.days_per_week && <span>{t.days_per_week} days/week</span>}
              </div>
              {t.description && <div style={{fontSize:13,marginBottom:8}}>{t.description}</div>}
              {t.structure && <div style={{fontSize:12,color:S.muted,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{t.structure}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              <Btn sm teal onClick={()=>startEdit(t)}>Edit</Btn>
              <Btn sm danger onClick={()=>remove(t)}>Delete</Btn>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLIENT — TRAINING PLAN (read-only weekly split)
// ---------------------------------------------------------------------------

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Read-only display of the V12 three-system assessment + which pillar each drives.
function AssessmentBar({ profile }) {
  const items = [
    ["nervous_system_recruitment", "Nervous System", "Powerlifting"],
    ["muscular_density_to_size", "Density-to-Size", "Bodybuilding"],
    ["metabolic_work_capacity", "Work Capacity", "Conditioning"],
  ];
  if (items.every(([k]) => profile[k] == null)) return null;
  return (
    <Card>
      <CardTitle>V12 Assessment</CardTitle>
      <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {items.map(([k, label, pillar]) => (
          <div key={k}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, lineHeight: 1 }}>
              {profile[k] ?? "—"}<span style={{ fontSize: 12, color: S.muted }}>/10</span>
            </div>
            <div style={{ height: 6, background: S.surface2, marginTop: 8, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${((profile[k] || 0) / 10) * 100}%`, height: "100%", background: S.accent }} />
            </div>
            <div style={{ fontSize: 10, color: S.muted, marginTop: 6 }}>{pillar}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClientProgram({ profile }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("exercises")
      .select("*")
      .eq("client_id", profile.id)
      .order("order_index")
      .then(({ data }) => {
        setExercises(data || []);
        setLoading(false);
      });
  }, [profile.id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  // Group by day; exercises with no day fall under "Unscheduled".
  const byDay = {};
  for (const ex of exercises) {
    const key = ex.day_of_week || "Unscheduled";
    (byDay[key] = byDay[key] || []).push(ex);
  }
  const days = Object.keys(byDay).sort((a, b) => {
    const ia = DAY_ORDER.indexOf(a), ib = DAY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div>
      <PageTitle title="Training Plan" sub="Your current weekly program" />
      <AssessmentBar profile={profile} />
      {exercises.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏋</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, marginBottom: 8 }}>No program yet</div>
          <div style={{ color: S.muted, fontSize: 13 }}>Your coach will generate your program soon.</div>
        </Card>
      ) : (
        days.map((day) => (
          <Card key={day}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>{day}</div>
              <div style={{ fontSize: 11, color: S.muted }}>{byDay[day][0]?.category || ""}</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Exercise", "Sets", "Reps", "Notes"].map((h) => (
                    <th key={h} style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, textAlign: "left", padding: "8px 14px", borderBottom: "1px solid " + S.border }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byDay[day].map((ex) => (
                  <tr key={ex.id}>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500, borderBottom: "1px solid " + S.border }}>
                      {ex.name}
                      {ex.is_bodyweight && <span style={{ marginLeft: 8, fontSize: 9, color: S.muted }}>BW</span>}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: S.muted, borderBottom: "1px solid " + S.border }}>{ex.sets ?? "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: S.muted, borderBottom: "1px solid " + S.border }}>{ex.reps ?? "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{ex.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLIENT — NUTRITION PLAN
// ---------------------------------------------------------------------------

function Nutrition({ profile }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("nutrition_plans")
      .select("*")
      .eq("client_id", profile.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setPlan(data);
        setLoading(false);
      });
  }, [profile.id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  if (!plan) {
    return (
      <div>
        <PageTitle title="Nutrition" sub="Your personalized fuel plan" />
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🥗</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, marginBottom: 8 }}>No nutrition plan yet</div>
          <div style={{ color: S.muted, fontSize: 13 }}>Your coach will generate your plan soon.</div>
        </Card>
      </div>
    );
  }

  const meals = Array.isArray(plan.meals) ? plan.meals : [];

  return (
    <div>
      <PageTitle title={plan.name || "Nutrition"} sub="Daily targets and sample meals" />
      <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 22 }}>
        <Stat label="Calories" value={plan.calories ?? "—"} unit=" kcal" />
        <Stat label="Protein" value={plan.protein_g ?? "—"} unit="g" />
        <Stat label="Carbs" value={plan.carbs_g ?? "—"} unit="g" />
        <Stat label="Fats" value={plan.fats_g ?? "—"} unit="g" />
      </div>

      {(plan.guidelines || plan.hydration) && (
        <Card>
          <CardTitle>Guidelines</CardTitle>
          {plan.guidelines && <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: plan.hydration ? 12 : 0 }}>{plan.guidelines}</div>}
          {plan.hydration && <div style={{ fontSize: 13, color: S.accent2 }}>💧 {plan.hydration}</div>}
        </Card>
      )}

      {meals.map((m, i) => (
        <Card key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20 }}>{m.meal || "Meal " + (i + 1)}</div>
            <div style={{ fontSize: 11, color: S.muted }}>{m.time || ""}</div>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: S.muted, marginBottom: 12, flexWrap: "wrap" }}>
            {m.calories != null && <span>{m.calories} kcal</span>}
            {m.protein_g != null && <span>P {m.protein_g}g</span>}
            {m.carbs_g != null && <span>C {m.carbs_g}g</span>}
            {m.fats_g != null && <span>F {m.fats_g}g</span>}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {(Array.isArray(m.items) ? m.items : []).map((it, j) => (
              <li key={j}>{typeof it === "string" ? it : it?.name || JSON.stringify(it)}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD SHELLS — top bar + sidebar nav + active page
// ---------------------------------------------------------------------------

function Shell({ profile, isCoach, logout, page, setPage, children }) {
  return (
    <div style={{ minHeight: "100vh", background: S.bg, color: S.text }}>
      <TopBar profile={profile} isCoach={isCoach} onLogout={logout} />
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <Sidebar isCoach={isCoach} page={page} setPage={setPage} />
        <main style={{ flex: 1, padding: "28px 32px", maxWidth: 1180, width: "100%" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function ClientDashboard({ profile, logout }) {
  const [page, setPage] = useState("dashboard");
  const [welcomed, setWelcomed] = useState(!!profile.welcome_seen);

  // One-time welcome gate on first login; marks the profile so it never reappears.
  const enterPortal = async () => {
    setWelcomed(true);
    await supabase.from("profiles").update({ welcome_seen: true }).eq("id", profile.id);
  };

  if (!welcomed) {
    return (
      <div style={{ minHeight: "100vh", background: S.bg, color: S.text }}>
        <TopBar profile={profile} isCoach={false} onLogout={logout} />
        <main style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
          <ClientWelcome profile={profile} onEnter={enterPortal} />
        </main>
      </div>
    );
  }

  return (
    <Shell profile={profile} isCoach={false} logout={logout} page={page} setPage={setPage}>
      {page === "dashboard" && <ClientHome profile={profile} setPage={setPage} />}
      {page === "program" && <ClientProgram profile={profile} />}
      {page === "daily" && <DailyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "weekly" && <WeeklyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "progress" && <Progress profile={profile} />}
      {page === "workouts" && <Workouts profile={profile} />}
      {page === "nutrition" && <Nutrition profile={profile} />}
    </Shell>
  );
}

function CoachDashboard({ profile, logout }) {
  const [page, setPage] = useState("dashboard");

  return (
    <Shell profile={profile} isCoach={true} logout={logout} page={page} setPage={setPage}>
      {page === "dashboard" && <CoachHome setPage={setPage} />}
      {page === "clients" && <ClientsPanel />}
      {page === "templates" && <TemplatesPanel />}
      {page === "progress" && <CoachProgress />}
    </Shell>
  );
}
