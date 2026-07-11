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

// On first login, pull any data the Notion migration staged for this person
// (matched by name) into their real tables. Runs once — the RPC flips
// profiles.staged_claimed so it won't repeat. Returns the (possibly refreshed)
// profile row. Failures are non-fatal: the app still loads.
async function claimStagedData(profileRow) {
  if (!profileRow?.id || profileRow.staged_claimed) return profileRow;
  try {
    const { data: result, error } = await supabase.rpc("claim_staged_data");
    if (error) { console.warn("claim_staged_data:", error.message); return profileRow; }
    if (result?.claimed) {
      console.log("Claimed staged data:", result);
      const { data: fresh } = await supabase.from("profiles").select("*").eq("id", profileRow.id).maybeSingle();
      return fresh || { ...profileRow, staged_claimed: true };
    }
    return { ...profileRow, staged_claimed: true };
  } catch (e) {
    console.warn("claim_staged_data exception:", e?.message || e);
    return profileRow;
  }
}



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
        .sidebar { display: flex; position: fixed; bottom: 0; left: 0; right: 0; top: auto; width: 100%; height: 60px; flex-direction: row; justify-content: space-around; align-items: center; padding: 0; overflow: visible; z-index: 999; border-top: 1px solid #333; border-right: none; }
        .sidebar nav { display: flex; flex-direction: row; width: 100%; justify-content: space-around; }
        .sidebar nav a, .sidebar nav button { display: flex; flex-direction: column; align-items: center; font-size: 10px; padding: 4px 2px; }
        .main-content { padding-bottom: 70px; }
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



        const claimedNew = await claimStagedData(newProfile);

        setProfile(claimedNew);

        return claimedNew;

      }



      console.log("PROFILE LOADED:", data);



      const claimed = await claimStagedData(data);

      setProfile(claimed);

      return claimed;

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
      </div>
    </div>
  );
}

function TopBar({ profile, isCoach, onLogout }) {
  return (
    <div style={{height:54,background:S.surface,borderBottom:"1px solid "+S.border,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",position:"sticky",top:0,zIndex:100}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:S.accent}}>V12</div>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        {!isCoach && profile?.dashboard_url && (
          <a href={profile.dashboard_url} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:S.accent2,textDecoration:"none",border:"1px solid "+S.border,padding:"7px 12px"}}>
            ↗ My Dashboard
          </a>
        )}
        <span style={{fontSize:13,color:S.muted}}>{profile?.name||profile?.email}</span>
        <div style={{width:32,height:32,borderRadius:"50%",background:isCoach?S.accent:S.accent2,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>
          {avatarFrom(profile?.name||profile?.email)}
        </div>
        <button onClick={onLogout} style={{...bS({}),background:"transparent",color:S.text,border:"1px solid "+S.border,padding:"7px 14px",fontSize:10}}>Sign out</button>
      </div>
    </div>
  );
}

function Sidebar({ isCoach, programOnly, page, setPage }) {
  // Program-only clients get the self-guided portal: their plan, nutrition,
  // workout logging, and the resource hub — no check-in prompts or habit tracking.
  const clientNav = programOnly
    ? [{id:"program",icon:"📋",label:"Training Plan"},{id:"nutrition",icon:"🥗",label:"Nutrition"},{id:"workouts",icon:"🏋",label:"Workout Log"},{id:"resources",icon:"📚",label:"Library"}]
    : [{id:"dashboard",icon:"⚡",label:"Dashboard"},{id:"program",icon:"📋",label:"Training Plan"},{id:"nutrition",icon:"🥗",label:"Nutrition"},{id:"daily",icon:"✅",label:"Daily Check-In"},{id:"weekly",icon:"🔥",label:"Weekly Check-In"},{id:"habits",icon:"🎯",label:"Habits"},{id:"workouts",icon:"🏋",label:"Workout Log"},{id:"progress",icon:"📈",label:"Progress"},{id:"resources",icon:"📚",label:"Library"}];
  const nav = isCoach
    ? [{id:"dashboard",icon:"⚡",label:"Overview"},{id:"clients",icon:"👥",label:"Clients"},{id:"templates",icon:"📋",label:"Templates"},{id:"library",icon:"📚",label:"Library"},{id:"progress",icon:"📈",label:"Progress"}]
    : clientNav;
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

// Nutrition adherence: average self-reported diet quality across recent
// check-ins, scored 0-100. Returns null when there's nothing to score.
const DIET_SCORE = { "On track": 100, "Mostly clean": 75, "Struggled": 40, "Off plan": 10 };
function nutritionScoreFrom(checkins, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = cutoff.toISOString().split("T")[0];
  const recent = (checkins || []).filter((c) => c.date >= cut && c.diet != null);
  if (!recent.length) return { score: null, n: 0 };
  const total = recent.reduce((s, c) => s + (DIET_SCORE[c.diet] ?? 50), 0);
  return { score: Math.round(total / recent.length), n: recent.length };
}

const CHANNELS = ["call", "text", "email", "in-person", "other"];
const TEMPLATE_CATEGORIES = ["Hybrid", "Fat Loss", "Muscle", "Strength", "Athletic", "Beginner", "Home", "General"];
const RESOURCE_KINDS = ["recipe", "article", "video", "pdf"];

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
  const programOnly = profile.client_type === "program_only";
  const next = programOnly
    ? [
        ["📋", "Program incoming", "Your coach is building a hybrid program tailored to your V12 assessment."],
        ["🥗", "Nutrition plan", "Macro targets and meal guidance to fuel the work."],
        ["🏋", "Log your training", "Track your sets and lifts as you work through the program, plus a full resource library."],
      ]
    : [
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
  const [form, setForm] = useState({
    bodyweight:"", waist:"", week_number:"",
    training_days:"", workout_feel:"", pump:"", exercise_feedback:"", lifts_improved:"", felt_weaker:"", cardio_performance:"",
    nutrition_compliance:5, sleep_quality:5, hydration_quality:5, discipline_level:5, confidence_level:5, mental_blocks:"",
    what_went_well:"", lifestyle_wins:"", biggest_challenge:"", holding_back:"",
    adjustments:"", coach_questions:"",
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState(null);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  // Numeric columns — coerced to number|null on save so empty inputs don't
  // hit non-numeric Postgres columns.
  const NUMERIC = ["bodyweight","waist","week_number","training_days","nutrition_compliance","sleep_quality","hydration_quality","discipline_level","confidence_level"];

  useEffect(()=>{
    supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).eq("date",weekStart).maybeSingle()
      .then(({data})=>{if(data){setExisting(data);setForm(f=>{const next={...f};Object.keys(f).forEach(k=>{if(data[k]!=null)next[k]=data[k];});return next;});}});
  },[profile.id]);

  const submit = async () => {
    setLoading(true); setError("");
    const entry = {client_id:profile.id, date:weekStart, ...form};
    NUMERIC.forEach(k=>{const n=parseFloat(entry[k]);entry[k]=Number.isNaN(n)?null:n;});
    const { error } = existing
      ? await supabase.from("weekly_checkins").update(entry).eq("id",existing.id)
      : await supabase.from("weekly_checkins").insert(entry);
    setLoading(false);
    if(error){ setError(error.message); return; }
    setSaved(true); setTimeout(onDone,1400);
  };

  if(saved) return <div style={{textAlign:"center",paddingTop:80}}><div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"16px 32px",display:"inline-flex",fontSize:16,fontWeight:600}}>Weekly check-in logged!</div></div>;

  return (
    <div>
      <PageTitle title="Weekly Check-In" sub={"Week of "+weekStart}/>
      <Card>
        <CardTitle>Body Stats</CardTitle>
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <Fld label="Bodyweight (lbs)"><Inp type="number" step="0.1" value={form.bodyweight||""} onChange={e=>set("bodyweight",e.target.value)} placeholder="lbs"/></Fld>
          <Fld label="Waist (inches)"><Inp type="number" step="0.1" value={form.waist||""} onChange={e=>set("waist",e.target.value)} placeholder="inches"/></Fld>
        </div>
        <Fld label="Week #"><Inp type="number" value={form.week_number||""} onChange={e=>set("week_number",e.target.value)} placeholder="e.g. 4"/></Fld>
      </Card>
      <Card>
        <CardTitle>Training</CardTitle>
        <Fld label="Training days completed"><Inp type="number" min={0} max={7} value={form.training_days||""} onChange={e=>set("training_days",e.target.value)} placeholder="0-7"/></Fld>
        <Fld label="How did your workouts feel?"><textarea rows={2} value={form.workout_feel||""} onChange={e=>set("workout_feel",e.target.value)} placeholder="Strong, tired, inconsistent..." style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="How was your pump & muscle engagement?"><textarea rows={2} value={form.pump||""} onChange={e=>set("pump",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Any exercises feel especially bad or good?"><textarea rows={2} value={form.exercise_feedback||""} onChange={e=>set("exercise_feedback",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Did any lifts or movements improve?"><textarea rows={2} value={form.lifts_improved||""} onChange={e=>set("lifts_improved",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Did anything feel weaker than usual?"><textarea rows={2} value={form.felt_weaker||""} onChange={e=>set("felt_weaker",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Cardio performance vs last week">
          <select value={form.cardio_performance||""} onChange={e=>set("cardio_performance",e.target.value)} style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"10px 14px",fontSize:14,outline:"none"}}>
            <option value="">Select...</option><option>Better</option><option>Same</option><option>Worse</option>
          </select>
        </Fld>
      </Card>
      <Card>
        <CardTitle>Nutrition</CardTitle>
        <Sld label="Protein & calorie goal compliance" val={form.nutrition_compliance||5} min={1} max={10} sfx="/10" onChange={v=>set("nutrition_compliance",v)}/>
      </Card>
      <Card>
        <CardTitle>Recovery</CardTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Sld label="Sleep Quality" val={form.sleep_quality||5} min={1} max={10} sfx="/10" onChange={v=>set("sleep_quality",v)}/>
          <Sld label="Hydration Quality" val={form.hydration_quality||5} min={1} max={10} sfx="/10" onChange={v=>set("hydration_quality",v)}/>
          <Sld label="Discipline Level" val={form.discipline_level||5} min={1} max={10} sfx="/10" onChange={v=>set("discipline_level",v)}/>
          <Sld label="Confidence in Program" val={form.confidence_level||5} min={1} max={10} sfx="/10" onChange={v=>set("confidence_level",v)}/>
        </div>
        <Fld label="Emotional stress or mental blocks?"><textarea rows={2} value={form.mental_blocks||""} onChange={e=>set("mental_blocks",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
      </Card>
      <Card>
        <CardTitle>Wins & Challenges</CardTitle>
        <Fld label="What went well this week?"><textarea rows={2} value={form.what_went_well||""} onChange={e=>set("what_went_well",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Physical or lifestyle wins?"><textarea rows={2} value={form.lifestyle_wins||""} onChange={e=>set("lifestyle_wins",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Biggest challenge this week?"><textarea rows={2} value={form.biggest_challenge||""} onChange={e=>set("biggest_challenge",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Anything holding back progress?"><textarea rows={2} value={form.holding_back||""} onChange={e=>set("holding_back",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
      </Card>
      <Card>
        <CardTitle>For Your Coach</CardTitle>
        <Fld label="Anything you want adjusted?"><textarea rows={2} value={form.adjustments||""} onChange={e=>set("adjustments",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Questions for your coach?"><textarea rows={2} value={form.coach_questions||""} onChange={e=>set("coach_questions",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        {error && <div style={{color:S.accent,fontSize:13,marginBottom:8}}>Couldn't save: {error}</div>}
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
  const nut = nutritionScoreFrom(daily,30);
  const lastWeight = daily.length?daily[daily.length-1].weight:null;

  return (
    <div>
      <PageTitle title="Progress" sub="Your data over time"/>
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <Stat label="Adherence (30d)" value={adh.score} unit="%"/>
        <Stat label="Nutrition (30d)" value={nut.score??"—"} unit={nut.score!=null?"%":""}/>
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

// ---------------------------------------------------------------------------
// CLIENT — DAILY HABITS (coach defines them; client checks them off daily)
// ---------------------------------------------------------------------------
function Habits({ profile }) {
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = todayStr();

  const load = useCallback(async () => {
    const { data: hs } = await supabase.from("habits").select("*").eq("client_id", profile.id).eq("active", true).order("order_index");
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 13);
    const cut = cutoff.toISOString().split("T")[0];
    const { data: ls } = await supabase.from("habit_logs").select("*").eq("client_id", profile.id).gte("date", cut);
    setHabits(hs || []); setLogs(ls || []); setLoading(false);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  const doneOn = (habitId, date) => logs.some((l) => l.habit_id === habitId && l.date === date && l.done);

  const toggle = async (habit) => {
    const existing = logs.find((l) => l.habit_id === habit.id && l.date === today);
    if (existing) {
      setLogs((prev) => prev.filter((l) => l.id !== existing.id));
      await supabase.from("habit_logs").delete().eq("id", existing.id);
    } else {
      const row = { client_id: profile.id, habit_id: habit.id, date: today, done: true };
      const { data } = await supabase.from("habit_logs").insert(row).select().maybeSingle();
      setLogs((prev) => [...prev, data || { ...row, id: `tmp-${habit.id}` }]);
    }
  };

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const days14 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d.toISOString().split("T")[0]; });
  const doneToday = habits.filter((h) => doneOn(h.id, today)).length;
  const pct = habits.length ? Math.round((doneToday / habits.length) * 100) : 0;
  // Streak: consecutive days back from today where every habit was completed.
  const streak = (() => {
    if (!habits.length) return 0;
    let s = 0;
    for (let i = days14.length - 1; i >= 0; i--) {
      const all = habits.every((h) => doneOn(h.id, days14[i]));
      if (all) s++; else break;
    }
    return s;
  })();

  return (
    <div>
      <PageTitle title="Daily Habits" sub="Small wins, stacked daily" />
      {habits.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, marginBottom: 8 }}>No habits assigned yet</div>
          <div style={{ color: S.muted, fontSize: 13 }}>Your coach will set up daily habits for you. Check back soon.</div>
        </Card>
      ) : (
        <>
          <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 22 }}>
            <Stat label="Done Today" value={doneToday} unit={"/" + habits.length} />
            <Stat label="Today's Completion" value={pct} unit="%" />
            <Stat label="Perfect-Day Streak" value={streak} unit="days" />
          </div>
          <Card>
            <CardTitle>Today · {today}</CardTitle>
            {habits.map((h) => {
              const done = doneOn(h.id, today);
              return (
                <div key={h.id} onClick={() => toggle(h)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 4px", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, background: done ? S.neon : "transparent", color: done ? "#0A0A0B" : S.muted, border: done ? "none" : "1px solid " + S.border }}>
                    {done ? "✓" : ""}
                  </div>
                  <span style={{ fontSize: 14, color: done ? S.text : S.muted, textDecoration: done ? "none" : "none" }}>{h.name}</span>
                </div>
              );
            })}
          </Card>
          <Card>
            <CardTitle>Last 14 days</CardTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", minWidth: 540 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, color: S.muted }}></th>
                    {days14.map((d) => (
                      <th key={d} style={{ padding: "6px 4px", fontSize: 9, color: S.muted, fontWeight: 600 }}>{d.slice(5)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {habits.map((h) => (
                    <tr key={h.id}>
                      <td style={{ padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap", color: S.text }}>{h.name}</td>
                      {days14.map((d) => (
                        <td key={d} style={{ padding: "5px 4px", textAlign: "center" }}>
                          <div style={{ width: 16, height: 16, borderRadius: 3, margin: "0 auto", background: doneOn(h.id, d) ? S.neon : S.surface2, border: "1px solid " + S.border }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLIENT — RESOURCE / RECIPE LIBRARY (read-only browse)
// ---------------------------------------------------------------------------
function Resources({ readOnly = true }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("all");

  useEffect(() => {
    supabase.from("resources").select("*").eq("published", true).order("created_at", { ascending: false })
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  }, []);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;
  const shown = kind === "all" ? items : items.filter((r) => r.kind === kind);
  const tabs = ["all", ...RESOURCE_KINDS];

  return (
    <div>
      <PageTitle title="Library" sub="Recipes, guides, and resources from your coach" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        {tabs.map((k) => (
          <button key={k} onClick={() => setKind(k)}
            style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize", border: "1px solid " + (kind === k ? S.accent : S.border), background: kind === k ? "rgba(255,77,0,.08)" : "transparent", color: kind === k ? S.accent : S.muted }}>
            {k === "all" ? "All" : k}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40, color: S.muted }}>Nothing here yet. Your coach will add resources soon.</Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {shown.map((r) => (
            <Card key={r.id} style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 19, lineHeight: 1.1 }}>{r.title}</div>
                <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.neon, flexShrink: 0 }}>{r.category || r.kind}</span>
              </div>
              {r.kind === "recipe" && (r.calories != null || r.protein_g != null) && (
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: S.muted, marginBottom: 8, flexWrap: "wrap" }}>
                  {r.calories != null && <span>{r.calories} kcal</span>}
                  {r.protein_g != null && <span>P {r.protein_g}g</span>}
                  {r.carbs_g != null && <span>C {r.carbs_g}g</span>}
                  {r.fats_g != null && <span>F {r.fats_g}g</span>}
                </div>
              )}
              {r.body && <div style={{ fontSize: 13, color: S.text, opacity: 0.9, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.body}</div>}
              {r.url && (
                <a href={r.url} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 10, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: S.accent2, textDecoration: "none" }}>
                  Open {r.kind === "video" ? "video" : "link"} →
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Workouts({ profile, readOnly }) {
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
      <PageTitle title="Workout Log" sub={readOnly?"Client's logged sessions":"Track your strength progression"}/>
      {saved && <div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"10px 18px",fontSize:12,fontWeight:600,marginBottom:16,display:"inline-flex"}}>Session logged!</div>}
      {exercises.length===0?(
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:32,marginBottom:12}}>🏋</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,marginBottom:8}}>No exercises assigned yet</div>
          <div style={{color:S.muted,fontSize:13}}>{readOnly?"This client has no program assigned yet.":"Your coach will assign your program. Check back soon."}</div>
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
                  {!readOnly&&<Btn sm teal onClick={()=>{const open=!logMode; setLogMode(open); if(open) setSets(freshSets(selectedEx.sets));}}>{logMode?"Cancel":"+ Log Session"}</Btn>}
                </div>
                {!readOnly&&logMode&&(
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
      const {data:cl} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL).neq("archived",true);
      const list = cl||[];
      const ids = list.map(c=>c.id);
      const grouped = {};
      if(ids.length){
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-29);
        const cut = cutoff.toISOString().split("T")[0];
        const {data:ch} = await supabase.from("daily_checkins")
          .select("client_id,date,weight,workout,diet").in("client_id",ids).gte("date",cut).order("date");
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
    const nut = nutritionScoreFrom(ch, 30);
    if(nut.score!=null && nut.n>=3 && nut.score<50) flags.push({label:`Nutrition ${nut.score}%`, tone:"amber"});
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

// ---------------------------------------------------------------------------
// COACH — per-client modules embedded in the Clients panel
// ---------------------------------------------------------------------------

const PHASES = ["Onboarding", "Accumulation", "Intensification", "Peak", "Deload", "Maintenance"];

// Capture the client's current training plan (program metadata + exercises) as a
// new immutable version. Returns {error, version}.
async function createProgramVersion(clientId, label) {
  const { data: program } = await supabase.from("programs").select("*")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: exs } = await supabase.from("exercises").select("*").eq("client_id", clientId).order("order_index");
  const { data: last } = await supabase.from("program_versions").select("version")
    .eq("client_id", clientId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version || 0) + 1;
  const snapshot = {
    program: program ? { name: program.name, goal: program.goal, phase: program.phase, phase_note: program.phase_note } : null,
    exercises: (exs || []).map((e) => ({
      name: e.name, category: e.category, day_of_week: e.day_of_week, sets: e.sets,
      reps: e.reps, is_bodyweight: e.is_bodyweight, notes: e.notes, order_index: e.order_index, source: e.source,
    })),
  };
  const { error } = await supabase.from("program_versions").insert({ client_id: clientId, program_id: program?.id || null, version, label, snapshot });
  return { error, version };
}

// Roll the training plan back to a snapshot. Merge by name+day so exercises that
// survive the rollback keep their id (and their logged history); only exercises
// dropped from the snapshot are removed. Records the rollback as a new version.
async function restoreProgramVersion(clientId, v) {
  const target = v.snapshot?.exercises || [];
  const { data: current } = await supabase.from("exercises").select("*").eq("client_id", clientId);
  const key = (e) => `${(e.name || "").trim().toLowerCase()}|${e.day_of_week || ""}`;
  const curMap = new Map();
  (current || []).forEach((e) => { if (!curMap.has(key(e))) curMap.set(key(e), e); });
  const usedIds = new Set();
  for (const t of target) {
    const fields = {
      category: t.category ?? null, day_of_week: t.day_of_week ?? null, sets: t.sets ?? null,
      reps: t.reps ?? null, is_bodyweight: !!t.is_bodyweight, notes: t.notes ?? null,
      order_index: t.order_index ?? 0, source: t.source || "coach",
    };
    const match = curMap.get(key(t));
    if (match) { usedIds.add(match.id); await supabase.from("exercises").update(fields).eq("id", match.id); }
    else { await supabase.from("exercises").insert({ client_id: clientId, name: t.name, ...fields }); }
  }
  for (const e of (current || [])) {
    if (!usedIds.has(e.id)) await supabase.from("exercises").delete().eq("id", e.id);
  }
  const prog = v.snapshot?.program;
  if (prog) {
    const { data: latest } = await supabase.from("programs").select("id")
      .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest) await supabase.from("programs").update({ phase: prog.phase ?? null, phase_note: prog.phase_note ?? null, phase_updated_at: new Date().toISOString() }).eq("id", latest.id);
  }
  await createProgramVersion(clientId, `Restored from v${v.version}`);
}

// Program version history: list, manual snapshot, view, and restore.
function ProgramVersions({ clientId, refreshKey, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("program_versions").select("*").eq("client_id", clientId).order("version", { ascending: false });
    setVersions(data || []); setLoading(false);
  }, [clientId]);
  useEffect(() => { setLoading(true); load(); }, [load, refreshKey]);

  const snapshot = async () => {
    setBusy(true); setMsg(null);
    const { error, version } = await createProgramVersion(clientId, "Manual snapshot");
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Saved as v${version}.` });
    if (!error) load();
  };
  const restore = async (v) => {
    if (!window.confirm(`Restore v${v.version}? This rewrites the current training plan to match this version. Logged sessions for exercises that aren't in this version will be removed.`)) return;
    setBusy(true); setMsg(null);
    try { await restoreProgramVersion(clientId, v); setMsg({ ok: true, text: `Restored v${v.version}.` }); onRestored?.(); load(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  if (loading) return null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <CardTitle>Program Version History</CardTitle>
        <Btn sm teal onClick={snapshot} disabled={busy}>{busy ? "..." : "Snapshot current"}</Btn>
      </div>
      {msg && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: msg.ok ? S.accent2 : "#ff6b5b" }}>{msg.text}</div>}
      {versions.length === 0 && <div style={{ color: S.muted, fontSize: 13 }}>No versions yet. A snapshot is saved automatically when you generate a program — or save one now.</div>}
      {versions.map((v) => {
        const exs = v.snapshot?.exercises || [];
        const open = openId === v.id;
        return (
          <div key={v.id} style={{ border: "1px solid " + S.border, background: S.surface2, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, marginRight: 10 }}>v{v.version}</span>
                <span style={{ fontSize: 12, color: S.text }}>{v.label || "Snapshot"}</span>
                <span style={{ fontSize: 11, color: S.muted, marginLeft: 10 }}>{(v.created_at || "").slice(0, 10)} · {exs.length} exercises</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setOpenId(open ? null : v.id)} style={{ padding: "7px 12px", fontSize: 10, background: "transparent", color: S.text, border: "1px solid " + S.border, cursor: "pointer", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>{open ? "Hide" : "View"}</button>
                <Btn sm onClick={() => restore(v)} disabled={busy}>Restore</Btn>
              </div>
            </div>
            {open && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                <thead><tr>{["Exercise", "Day", "Sets", "Reps", "Notes"].map((h) => <th key={h} style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, textAlign: "left", padding: "6px 10px", borderBottom: "1px solid " + S.border }}>{h}</th>)}</tr></thead>
                <tbody>
                  {exs.map((e, i) => (
                    <tr key={i}>
                      <td style={{ padding: "6px 10px", fontSize: 12, borderBottom: "1px solid " + S.border }}>{e.name}</td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{e.day_of_week || "—"}</td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{e.sets ?? "—"}</td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{e.reps || "—"}</td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{e.notes || "—"}</td>
                    </tr>
                  ))}
                  {exs.length === 0 && <tr><td colSpan={5} style={{ padding: "6px 10px", fontSize: 12, color: S.muted }}>No exercises captured.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// Program phase / block adjustment for the client's most recent program.
function ProgramPhase({ clientId }) {
  const [program, setProgram] = useState(null);
  const [phase, setPhase] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("programs").select("*").eq("client_id", clientId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setProgram(data || null);
    setPhase(data?.phase || "");
    setNote(data?.phase_note || "");
    setLoading(false);
  }, [clientId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const save = async () => {
    if (!program) return;
    setSaving(true); setMsg(null);
    const { error } = await supabase.from("programs")
      .update({ phase: phase || null, phase_note: note.trim() || null, phase_updated_at: new Date().toISOString() })
      .eq("id", program.id);
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Phase updated." });
    if (!error) load();
  };

  if (loading) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Program Phase</CardTitle>
      {!program ? (
        <div style={{ fontSize: 13, color: S.muted }}>No program yet. Generate or assign a program first, then set its phase here.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
            {program.name || "Program"} · {program.phase_updated_at ? `phase set ${program.phase_updated_at.slice(0, 10)}` : "no phase set yet"}
          </div>
          <Fld label="Current Phase / Block"><RG options={PHASES} value={phase} onChange={setPhase} /></Fld>
          <Fld label="Phase Note (what's the focus right now?)">
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Week 3 of accumulation — push volume on the lower body, hold loads on upper."
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical" }} />
          </Fld>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Phase"}</Btn>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : "#ff6b5b" }}>{msg.text}</span>}
          </div>
        </>
      )}
    </Card>
  );
}

// Coach defines the client's daily habits; the client checks them off.
function CoachHabits({ clientId }) {
  const [habits, setHabits] = useState([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("habits").select("*").eq("client_id", clientId).eq("active", true).order("order_index");
    setHabits(data || []);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from("habits").insert({ client_id: clientId, name: name.trim(), order_index: habits.length });
    setName(""); setSaving(false); load();
  };
  const remove = async (h) => {
    await supabase.from("habits").update({ active: false }).eq("id", h.id);
    load();
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Daily Habits</CardTitle>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>These appear on the client's Habits page to check off each day.</div>
      {habits.length === 0 && <div style={{ color: S.muted, fontSize: 13, marginBottom: 12 }}>No habits set yet.</div>}
      {habits.map((h) => (
        <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid " + S.border }}>
          <span style={{ fontSize: 13 }}>{h.name}</span>
          <button onClick={() => remove(h)} style={{ background: "none", border: "none", color: "#ff6b5b", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Remove</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Inp type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 10k steps, 1 gallon water, sleep 8h"
          onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <Btn sm onClick={add} disabled={saving}>{saving ? "..." : "+ Add"}</Btn>
      </div>
    </Card>
  );
}

// Private coach notes on a client.
function CoachNotes({ clientId }) {
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("coach_notes").select("*").eq("client_id", clientId)
      .order("pinned", { ascending: false }).order("created_at", { ascending: false });
    setNotes(data || []);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await supabase.from("coach_notes").insert({ client_id: clientId, body: body.trim() });
    setBody(""); setSaving(false); load();
  };
  const togglePin = async (n) => { await supabase.from("coach_notes").update({ pinned: !n.pinned }).eq("id", n.id); load(); };
  const remove = async (n) => { await supabase.from("coach_notes").delete().eq("id", n.id); load(); };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Coach Notes (private)</CardTitle>
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a private note about this client..."
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 10 }} />
      <Btn sm onClick={add} disabled={saving}>{saving ? "Saving..." : "Add Note"}</Btn>
      <div style={{ marginTop: 16 }}>
        {notes.length === 0 && <div style={{ color: S.muted, fontSize: 13 }}>No notes yet.</div>}
        {notes.map((n) => (
          <div key={n.id} style={{ background: S.surface2, border: "1px solid " + S.border, borderLeft: n.pinned ? "3px solid " + S.neon : "1px solid " + S.border, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 8 }}>{n.body}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: S.muted }}>{(n.created_at || "").slice(0, 10)}</span>
              <div style={{ display: "flex", gap: 14 }}>
                <button onClick={() => togglePin(n)} style={{ background: "none", border: "none", color: n.pinned ? S.neon : S.muted, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{n.pinned ? "Unpin" : "Pin"}</button>
                <button onClick={() => remove(n)} style={{ background: "none", border: "none", color: "#ff6b5b", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Conversation / touchpoint log with the client.
function CoachConversations({ clientId }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ channel: "call", summary: "", occurred_on: todayStr(), follow_up_on: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    const { data } = await supabase.from("conversations").select("*").eq("client_id", clientId).order("occurred_on", { ascending: false });
    setItems(data || []);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.summary.trim()) return;
    setSaving(true);
    await supabase.from("conversations").insert({
      client_id: clientId, channel: form.channel, summary: form.summary.trim(),
      occurred_on: form.occurred_on || todayStr(), follow_up_on: form.follow_up_on || null,
    });
    setForm({ channel: "call", summary: "", occurred_on: todayStr(), follow_up_on: "" });
    setSaving(false); load();
  };
  const remove = async (c) => { await supabase.from("conversations").delete().eq("id", c.id); load(); };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Conversation Log</CardTitle>
      <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 12 }}>
        <Fld label="Channel"><RG options={CHANNELS} value={form.channel} onChange={(v) => set("channel", v)} cap /></Fld>
        <Fld label="Date"><Inp type="date" value={form.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} /></Fld>
        <Fld label="Follow-up (optional)"><Inp type="date" value={form.follow_up_on} onChange={(e) => set("follow_up_on", e.target.value)} /></Fld>
      </div>
      <textarea rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="What did you discuss? Decisions, adjustments, how they're feeling..."
        style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 10 }} />
      <Btn sm onClick={add} disabled={saving}>{saving ? "Saving..." : "Log Conversation"}</Btn>
      <div style={{ marginTop: 16 }}>
        {items.length === 0 && <div style={{ color: S.muted, fontSize: 13 }}>No conversations logged yet.</div>}
        {items.map((c) => (
          <div key={c.id} style={{ background: S.surface2, border: "1px solid " + S.border, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: S.accent }}>{c.channel}</span>
              <span style={{ fontSize: 11, color: S.muted }}>{c.occurred_on}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{c.summary}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 10, color: c.follow_up_on ? S.accent2 : S.muted }}>{c.follow_up_on ? `↻ Follow up ${c.follow_up_on}` : ""}</span>
              <button onClick={() => remove(c)} style={{ background: "none", border: "none", color: "#ff6b5b", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClientsPanel() {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEx, setNewEx] = useState({name:"",category:"",day_of_week:"",sets:"",reps:"",notes:"",is_bodyweight:false});
  const [editEx, setEditEx] = useState(null);   // {id, draft} | null
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [assess, setAssess] = useState({nervous_system_recruitment:5,muscular_density_to_size:5,metabolic_work_capacity:5});
  const [savingAssess, setSavingAssess] = useState(false);
  const [assessMsg, setAssessMsg] = useState(null);
  const [settings, setSettings] = useState({client_type:"coaching", dashboard_url:""});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [progTick, setProgTick] = useState(0);

  const loadClients = async()=>{
    const {data} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL);
    setClients(data||[]);
    setLoading(false);
  };

  const setArchived = async(client, archived)=>{
    if(archived && !window.confirm(`Archive ${client.name||client.email}? They'll be hidden from your active list (data is kept).`)) return;
    await supabase.from("profiles").update({archived}).eq("id",client.id);
    setSelected(null);
    await loadClients();
  };
  const loadEx = async(id)=>{
    const {data} = await supabase.from("exercises").select("*").eq("client_id",id).order("created_at");
    setExercises(data||[]);
  };

  useEffect(()=>{loadClients();},[]);
  // Keep the selected client valid as the archived filter / client list changes.
  useEffect(()=>{
    const vis = (clients||[]).filter(c=>showArchived?c.archived:!c.archived);
    if(!vis.length){ setSelected(s=>s?null:s); return; }
    setSelected(s=>(s && vis.some(c=>c.id===s)) ? s : vis[0].id);
  },[clients, showArchived]);
  // Program templates come from the Notion program library (via the API).
  useEffect(()=>{
    fetch("/api/list-templates")
      .then(r=>r.ok?r.json():{templates:[]})
      .then(d=>setTemplates(d.templates||[]))
      .catch(()=>setTemplates([]));
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
    if(c) setSettings({
      client_type: c.client_type || "coaching",
      dashboard_url: c.dashboard_url || "",
    });
    setAssessMsg(null);
    setSettingsMsg(null);
  },[selected, clients]);

  const saveSettings = async()=>{
    setSavingSettings(true); setSettingsMsg(null);
    const {error} = await supabase.from("profiles").update({
      client_type: settings.client_type,
      dashboard_url: settings.dashboard_url.trim() || null,
    }).eq("id",selected);
    setSavingSettings(false);
    if(error){ setSettingsMsg({ok:false,text:error.message}); return; }
    setSettingsMsg({ok:true,text:"Client settings saved."});
    await loadClients();
  };

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
    await supabase.from("exercises").insert({
      client_id:selected, name:newEx.name.trim(), category:newEx.category.trim()||null,
      day_of_week:newEx.day_of_week||null, sets:parseInt(newEx.sets)||null,
      reps:newEx.reps.trim()||null, notes:newEx.notes.trim()||null,
      is_bodyweight:newEx.is_bodyweight, source:"coach",
    });
    await loadEx(selected);
    setNewEx({name:"",category:"",day_of_week:"",sets:"",reps:"",notes:"",is_bodyweight:false});
    setShowAdd(false);setSaving(false);
  };
  const delEx = async(id)=>{
    await supabase.from("exercises").delete().eq("id",id);
    await loadEx(selected);
  };
  // Edit an assigned exercise in place — the coach's progression / customization knob.
  const startEditEx = (ex)=> setEditEx({id:ex.id, draft:{
    day_of_week:ex.day_of_week||"", sets:ex.sets??"", reps:ex.reps||"", notes:ex.notes||"",
  }});
  const saveEditEx = async()=>{
    const d = editEx.draft;
    await supabase.from("exercises").update({
      day_of_week:d.day_of_week||null, sets:parseInt(d.sets)||null,
      reps:String(d.reps).trim()||null, notes:String(d.notes).trim()||null,
    }).eq("id",editEx.id);
    setEditEx(null);
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
      await createProgramVersion(client.id, `AI generated${data.template?` · ${data.template}`:""}`);
      setProgTick(t=>t+1);
    }catch(e){
      setGenMsg({ok:false,text:e.message});
    }finally{
      setGenerating(false);
    }
  };

  const client = clients.find(c=>c.id===selected);
  const visible = clients.filter(c=>showArchived?c.archived:!c.archived);
  const archivedCount = clients.filter(c=>c.archived).length;
  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  return (
    <div>
      <PageTitle title="Clients" sub="Manage programs and view client data"/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {visible.map(c=>(
            <button key={c.id} onClick={()=>setSelected(c.id)}
              style={{padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid "+(selected===c.id?S.accent:S.border),background:selected===c.id?"rgba(255,77,0,.08)":"transparent",color:selected===c.id?S.accent:S.muted}}>
              {c.name||c.email}
            </button>
          ))}
          {visible.length===0&&<div style={{color:S.muted,fontSize:13}}>{showArchived?"No archived clients.":"No active clients. Share the app URL with your clients."}</div>}
        </div>
        <button onClick={()=>setShowArchived(v=>!v)}
          style={{padding:"6px 14px",fontSize:10,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",border:"1px solid "+S.border,background:"transparent",color:showArchived?S.accent:S.muted,whiteSpace:"nowrap"}}>
          {showArchived?"← Active clients":`Archived (${archivedCount})`}
        </button>
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
                    <option key={t.id} value={t.id}>
                      {t.name}{t.difficulty?` · ${t.difficulty}`:""}{t.duration?` · ${t.duration}`:""}
                    </option>
                  ))}
                </select>
                <Btn onClick={()=>generateProgram(client)} disabled={generating}>
                  {generating?"Generating...":"⚡ Generate AI Program"}
                </Btn>
                <button onClick={()=>setArchived(client, !client.archived)}
                  style={{padding:"8px 14px",fontSize:10,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",border:"1px solid "+S.border,background:"transparent",color:S.muted}}>
                  {client.archived?"Unarchive client":"Archive client"}
                </button>
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
            <CardTitle>Client Settings</CardTitle>
            <div style={{fontSize:11,color:S.muted,marginBottom:16}}>
              Coaching clients get the full portal (check-ins, habits, progress, coach notes). Program-only clients get a self-guided portal: their plan, nutrition, workout logging, and the resource hub — no check-in prompts.
            </div>
            <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              <Fld label="Client Type">
                <select value={settings.client_type} onChange={e=>setSettings(p=>({...p,client_type:e.target.value}))}
                  style={{width:"100%",background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                  <option value="coaching">Coaching (full portal)</option>
                  <option value="program_only">Program only (no check-ins)</option>
                </select>
              </Fld>
              <Fld label="Notion Dashboard URL">
                <Inp type="url" value={settings.dashboard_url} onChange={e=>setSettings(p=>({...p,dashboard_url:e.target.value}))} placeholder="https://notion.so/..."/>
              </Fld>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14,marginTop:18}}>
              <Btn onClick={saveSettings} disabled={savingSettings}>{savingSettings?"Saving...":"Save Settings"}</Btn>
              {settingsMsg && (
                <span style={{fontSize:12,fontWeight:600,color:settingsMsg.ok?S.accent2:"#ff6b5b"}}>{settingsMsg.text}</span>
              )}
            </div>
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
          <ProgramPhase clientId={client.id} />
          <ProgramVersions clientId={client.id} refreshKey={progTick} onRestored={()=>loadEx(selected)} />
          <CoachHabits clientId={client.id} />
          <CoachNotes clientId={client.id} />
          <CoachConversations clientId={client.id} />
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
                  <Fld label="Day">
                    <select value={newEx.day_of_week} onChange={e=>setNewEx(p=>({...p,day_of_week:e.target.value}))}
                      style={{width:"100%",background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                      <option value="">Unscheduled</option>
                      {DAY_ORDER.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </Fld>
                  <Fld label="Sets"><Inp type="number" value={newEx.sets} onChange={e=>setNewEx(p=>({...p,sets:e.target.value}))} placeholder="e.g. 4"/></Fld>
                  <Fld label="Reps"><Inp type="text" value={newEx.reps} onChange={e=>setNewEx(p=>({...p,reps:e.target.value}))} placeholder="e.g. 8-12"/></Fld>
                  <Fld label="Type">
                    <RG options={["Weighted","Bodyweight"]} value={newEx.is_bodyweight?"Bodyweight":"Weighted"} onChange={v=>setNewEx(p=>({...p,is_bodyweight:v==="Bodyweight"}))}/>
                  </Fld>
                </div>
                <Fld label="Notes / loading guidance"><Inp type="text" value={newEx.notes} onChange={e=>setNewEx(p=>({...p,notes:e.target.value}))} placeholder="e.g. @80% 1RM, RPE 8, 3s eccentric"/></Fld>
                <div style={{display:"flex",gap:10,marginTop:8}}>
                  <Btn sm onClick={addEx} disabled={saving}>{saving?"Saving...":"Add Exercise"}</Btn>
                  <button onClick={()=>setShowAdd(false)} style={{padding:"7px 14px",fontSize:10,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>Cancel</button>
                </div>
              </div>
            )}
            {exercises.length===0&&<div style={{color:S.muted,fontSize:13,padding:"16px 0"}}>No exercises assigned yet.</div>}
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Exercise","Day","Sets","Reps","Notes",""].map(h=><th key={h} style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,textAlign:"left",padding:"10px 14px",borderBottom:"1px solid "+S.border}}>{h}</th>)}</tr></thead>
              <tbody>
                {exercises.map(ex=>{
                  const editing = editEx?.id===ex.id;
                  const d = editEx?.draft || {};
                  const setD = (k,v)=>setEditEx(p=>({...p,draft:{...p.draft,[k]:v}}));
                  const cell = {padding:"9px 14px",fontSize:13,borderBottom:"1px solid "+S.border,verticalAlign:"top"};
                  const eInp = {background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"6px 8px",fontSize:13,outline:"none",width:"100%"};
                  return (
                    <tr key={ex.id}>
                      <td style={{...cell,fontWeight:500}}>{ex.name}{ex.is_bodyweight&&<span style={{marginLeft:6,fontSize:9,color:S.muted}}>BW</span>}</td>
                      {editing?(
                        <>
                          <td style={cell}><select value={d.day_of_week} onChange={e=>setD("day_of_week",e.target.value)} style={eInp}><option value="">—</option>{DAY_ORDER.map(x=><option key={x} value={x}>{x}</option>)}</select></td>
                          <td style={cell}><input type="number" value={d.sets} onChange={e=>setD("sets",e.target.value)} style={{...eInp,width:60}}/></td>
                          <td style={cell}><input type="text" value={d.reps} onChange={e=>setD("reps",e.target.value)} style={{...eInp,width:80}}/></td>
                          <td style={cell}><input type="text" value={d.notes} onChange={e=>setD("notes",e.target.value)} style={eInp}/></td>
                          <td style={cell}>
                            <div style={{display:"flex",gap:6}}>
                              <Btn sm teal onClick={saveEditEx}>Save</Btn>
                              <button onClick={()=>setEditEx(null)} style={{padding:"7px 10px",fontSize:10,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600}}>Cancel</button>
                            </div>
                          </td>
                        </>
                      ):(
                        <>
                          <td style={{...cell,color:S.muted}}>{ex.day_of_week||"—"}</td>
                          <td style={{...cell,color:S.muted}}>{ex.sets??"—"}</td>
                          <td style={{...cell,color:S.muted}}>{ex.reps||"—"}</td>
                          <td style={{...cell,color:S.muted,maxWidth:240}}>{ex.notes||"—"}</td>
                          <td style={cell}>
                            <div style={{display:"flex",gap:6}}>
                              <Btn sm teal onClick={()=>startEditEx(ex)}>Edit</Btn>
                              <Btn sm danger onClick={()=>delEx(ex.id)}>Remove</Btn>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
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
    supabase.from("profiles").select("*").neq("email",COACH_EMAIL).neq("archived",true)
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
      {selected&&<div style={{marginTop:8}}><Workouts profile={selected} readOnly/></div>}
      {clients.length===0&&<div style={{color:S.muted,fontSize:13}}>No clients yet.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COACH — TEMPLATE MANAGEMENT (create / edit / delete program templates)
// ---------------------------------------------------------------------------

const BLANK_TEMPLATE = { name:"", goal:"", category:"General", days_per_week:4, description:"", structure:"" };

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

  const [catFilter, setCatFilter] = useState("All");

  const startNew = ()=>{ setEditing("new"); setForm(BLANK_TEMPLATE); setMsg(null); };
  const startEdit = (t)=>{
    setEditing(t.id);
    setForm({name:t.name||"",goal:t.goal||"",category:t.category||"General",days_per_week:t.days_per_week||4,description:t.description||"",structure:t.structure||""});
    setMsg(null);
  };
  const cancel = ()=>{ setEditing(null); setForm(BLANK_TEMPLATE); };

  const save = async()=>{
    if(!form.name.trim()){ setMsg({ok:false,text:"Name is required."}); return; }
    setSaving(true); setMsg(null);
    const payload = {
      name:form.name.trim(), goal:form.goal.trim()||null, category:form.category||null,
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

  // Duplicate a template into a new editable copy (built-ins stay untouched).
  const duplicate = async(t)=>{
    setMsg(null);
    const existing = new Set(templates.map(x=>x.name));
    let name = `${t.name} (copy)`, i = 2;
    while(existing.has(name)){ name = `${t.name} (copy ${i++})`; }
    const { error } = await supabase.from("program_templates").insert({
      name, goal:t.goal, category:t.category, days_per_week:t.days_per_week,
      description:t.description, structure:t.structure, is_builtin:false,
    });
    if(error){ setMsg({ok:false,text:error.message}); return; }
    setMsg({ok:true,text:`Duplicated as "${name}".`});
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
          <Fld label="Category"><RG options={TEMPLATE_CATEGORIES} value={form.category} onChange={v=>set("category",v)}/></Fld>
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

      {templates.length>0 && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {["All",...TEMPLATE_CATEGORIES].map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)}
              style={{padding:"5px 12px",fontSize:10,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",border:"1px solid "+(catFilter===c?S.accent:S.border),background:catFilter===c?"rgba(255,77,0,.08)":"transparent",color:catFilter===c?S.accent:S.muted}}>
              {c}
            </button>
          ))}
        </div>
      )}

      {templates.filter(t=>catFilter==="All"||(t.category||"General")===catFilter).map(t=>(
        <Card key={t.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{t.name}</div>
                {t.category && <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.neon}}>{t.category}</span>}
                {t.is_builtin && <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted}}>· Built-in</span>}
              </div>
              <div style={{display:"flex",gap:14,fontSize:11,color:S.muted,margin:"4px 0 10px"}}>
                {t.goal && <span>{t.goal}</span>}
                {t.days_per_week && <span>{t.days_per_week} days/week</span>}
              </div>
              {t.description && <div style={{fontSize:13,marginBottom:8}}>{t.description}</div>}
              {t.structure && <div style={{fontSize:12,color:S.muted,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{t.structure}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
              <Btn sm teal onClick={()=>duplicate(t)}>Duplicate</Btn>
              {!t.is_builtin && <Btn sm teal onClick={()=>startEdit(t)}>Edit</Btn>}
              {!t.is_builtin && <Btn sm danger onClick={()=>remove(t)}>Delete</Btn>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COACH — RESOURCE / RECIPE LIBRARY MANAGEMENT
// ---------------------------------------------------------------------------

const BLANK_RESOURCE = { title:"", category:"", kind:"article", url:"", body:"", calories:"", protein_g:"", carbs_g:"", fats_g:"", published:true };

function ResourcesPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // null | "new" | id
  const [form, setForm] = useState(BLANK_RESOURCE);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async()=>{
    const {data} = await supabase.from("resources").select("*").order("created_at",{ascending:false});
    setItems(data||[]); setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const startNew = ()=>{ setEditing("new"); setForm(BLANK_RESOURCE); setMsg(null); };
  const startEdit = (r)=>{
    setEditing(r.id);
    setForm({title:r.title||"",category:r.category||"",kind:r.kind||"article",url:r.url||"",body:r.body||"",
      calories:r.calories??"",protein_g:r.protein_g??"",carbs_g:r.carbs_g??"",fats_g:r.fats_g??"",published:r.published});
    setMsg(null);
  };
  const cancel = ()=>{ setEditing(null); setForm(BLANK_RESOURCE); };
  const numOrNull = (v)=> v===""||v==null ? null : (parseInt(v)||null);

  const save = async()=>{
    if(!form.title.trim()){ setMsg({ok:false,text:"Title is required."}); return; }
    setSaving(true); setMsg(null);
    const payload = {
      title:form.title.trim(), category:form.category.trim()||null, kind:form.kind,
      url:form.url.trim()||null, body:form.body.trim()||null,
      calories:numOrNull(form.calories), protein_g:numOrNull(form.protein_g),
      carbs_g:numOrNull(form.carbs_g), fats_g:numOrNull(form.fats_g), published:form.published,
    };
    const {error} = editing==="new"
      ? await supabase.from("resources").insert(payload)
      : await supabase.from("resources").update(payload).eq("id",editing);
    setSaving(false);
    if(error){ setMsg({ok:false,text:error.message}); return; }
    setMsg({ok:true,text:editing==="new"?"Resource created.":"Resource updated."});
    setEditing(null); setForm(BLANK_RESOURCE); await load();
  };
  const remove = async(r)=>{
    if(!window.confirm(`Delete "${r.title}"?`)) return;
    const {error} = await supabase.from("resources").delete().eq("id",r.id);
    if(error){ setMsg({ok:false,text:error.message}); return; }
    if(editing===r.id) cancel();
    await load();
  };

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;
  const isRecipe = form.kind==="recipe";

  return (
    <div>
      <PageTitle title="Library" sub="Recipes, guides, and resources clients can browse"/>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <Btn teal onClick={startNew}>+ New Resource</Btn>
      </div>
      {msg && (
        <div style={{marginBottom:16,padding:"10px 16px",fontSize:12,fontWeight:600,
          background:msg.ok?"rgba(0,201,167,.14)":"rgba(192,57,43,.16)",color:msg.ok?S.accent2:"#ff6b5b"}}>{msg.text}</div>
      )}
      {editing && (
        <Card>
          <CardTitle>{editing==="new"?"New Resource":"Edit Resource"}</CardTitle>
          <div className="g3" style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
            <Fld label="Title"><Inp type="text" value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. High-Protein Overnight Oats"/></Fld>
            <Fld label="Category"><Inp type="text" value={form.category} onChange={e=>set("category",e.target.value)} placeholder="e.g. Recipe, Guide"/></Fld>
          </div>
          <Fld label="Type"><RG options={RESOURCE_KINDS} value={form.kind} onChange={v=>set("kind",v)} cap/></Fld>
          <Fld label="Link / URL (optional)"><Inp type="url" value={form.url} onChange={e=>set("url",e.target.value)} placeholder="https://..."/></Fld>
          {isRecipe && (
            <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
              {[["calories","Calories"],["protein_g","Protein (g)"],["carbs_g","Carbs (g)"],["fats_g","Fats (g)"]].map(([k,label])=>(
                <Fld key={k} label={label}><Inp type="number" value={form[k]} onChange={e=>set(k,e.target.value)} placeholder="0"/></Fld>
              ))}
            </div>
          )}
          <Fld label={isRecipe?"Recipe / Steps":"Body"}>
            <textarea rows={5} value={form.body} onChange={e=>set("body",e.target.value)} placeholder={isRecipe?"Ingredients and steps...":"Description / content..."}
              style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/>
          </Fld>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <input type="checkbox" checked={form.published} onChange={e=>set("published",e.target.checked)} style={{accentColor:S.accent}}/>
            <span style={{fontSize:12,color:S.muted}}>Published (visible to clients)</span>
          </div>
          <div style={{display:"flex",gap:10,marginTop:8}}>
            <Btn onClick={save} disabled={saving}>{saving?"Saving...":"Save Resource"}</Btn>
            <button onClick={cancel} style={{padding:"10px 20px",fontSize:12,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>Cancel</button>
          </div>
        </Card>
      )}
      {items.length===0 && !editing && (
        <Card style={{textAlign:"center",padding:40,color:S.muted}}>No resources yet. Create your first one.</Card>
      )}
      {items.map(r=>(
        <Card key={r.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{r.title}</div>
                <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.neon}}>{r.category||r.kind}</span>
                {!r.published && <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted}}>· Draft</span>}
              </div>
              {r.kind==="recipe" && (r.calories!=null||r.protein_g!=null) && (
                <div style={{display:"flex",gap:12,fontSize:11,color:S.muted,margin:"6px 0"}}>
                  {r.calories!=null&&<span>{r.calories} kcal</span>}
                  {r.protein_g!=null&&<span>P {r.protein_g}g</span>}
                  {r.carbs_g!=null&&<span>C {r.carbs_g}g</span>}
                  {r.fats_g!=null&&<span>F {r.fats_g}g</span>}
                </div>
              )}
              {r.body && <div style={{fontSize:12,color:S.muted,lineHeight:1.7,whiteSpace:"pre-wrap",marginTop:6}}>{r.body}</div>}
              {r.url && <div style={{fontSize:11,color:S.accent2,marginTop:6}}>{r.url}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              <Btn sm teal onClick={()=>startEdit(r)}>Edit</Btn>
              <Btn sm danger onClick={()=>remove(r)}>Delete</Btn>
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
  const [program, setProgram] = useState(null);
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
    supabase
      .from("programs")
      .select("name,phase,phase_note")
      .eq("client_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setProgram(data || null));
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
      {program?.phase && (
        <Card style={{ borderLeft: "3px solid " + S.neon }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted }}>Current Phase</span>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: S.neon }}>{program.phase}</span>
          </div>
          {program.phase_note && <div style={{ fontSize: 13, color: S.text, opacity: 0.9, lineHeight: 1.6, marginTop: 6 }}>{program.phase_note}</div>}
        </Card>
      )}
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
                  {["Exercise", "Section", "Sets", "Reps", "Notes"].map((h) => (
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
                    <td style={{ padding: "10px 14px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{ex.section || "—"}</td>
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
  const programOnly = !isCoach && profile?.client_type === "program_only";
  return (
    <div style={{ minHeight: "100vh", background: S.bg, color: S.text }}>
      <TopBar profile={profile} isCoach={isCoach} onLogout={logout} />
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <Sidebar isCoach={isCoach} programOnly={programOnly} page={page} setPage={setPage} />
        <main style={{ flex: 1, padding: "28px 32px", maxWidth: 1180, width: "100%" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function ClientDashboard({ profile, logout }) {
  const programOnly = profile.client_type === "program_only";
  const [page, setPage] = useState(programOnly ? "program" : "dashboard");
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
      {page === "dashboard" && !programOnly && <ClientHome profile={profile} setPage={setPage} />}
      {page === "program" && <ClientProgram profile={profile} />}
      {page === "daily" && !programOnly && <DailyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "weekly" && !programOnly && <WeeklyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "progress" && !programOnly && <Progress profile={profile} />}
      {page === "workouts" && <Workouts profile={profile} />}
      {page === "nutrition" && <Nutrition profile={profile} />}
      {page === "habits" && !programOnly && <Habits profile={profile} />}
      {page === "resources" && <Resources />}
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
      {page === "library" && <ResourcesPanel />}
      {page === "progress" && <CoachProgress />}
    </Shell>
  );
}
