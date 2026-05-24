import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const supabase = createClient(
  "https://dbmkdrytjeppcbhuzkxh.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibWtkcnl0amVwcGNiaHV6a3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzU0ODEsImV4cCI6MjA5MjgxMTQ4MX0.D9UY3I0yEYDw8lpCwRHqwx2wSN39yUKvEM5PsQiQmlM"
);

const COACH_EMAIL = "coach@v12system.com";
const COLORS = ["#FF4D00","#00C9A7","#8B5CF6","#3B82F6","#F59E0B","#EC4899"];
const TT = { contentStyle: { background: "#111113", border: "1px solid #222228", fontSize: 12 } };
const todayStr = () => new Date().toISOString().split("T")[0];
const avatarFrom = (name) => (name || "").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";

const S = {
  bg: "#0A0A0B", surface: "#111113", surface2: "#18181C",
  border: "#222228", accent: "#FF4D00", accent2: "#00C9A7",
  text: "#F0EEE8", muted: "#666670"
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${S.bg};color:${S.text};font-family:'DM Sans',sans-serif}
  input,textarea,button,select{font-family:'DM Sans',sans-serif}
  .spinner{width:36px;height:36px;border:3px solid ${S.border};border-top-color:${S.accent};border-radius:50%;animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${S.bg}}::-webkit-scrollbar-thumb{background:${S.border}}
  input[type=range]{width:100%;-webkit-appearance:none;height:3px;background:${S.border};outline:none}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:${S.accent};cursor:pointer}
  @media(max-width:768px){.sidebar{display:none!important}.g2,.g3,.g4,.cg{grid-template-columns:1fr!important}.main{padding:16px!important}}
`;

const SpinScreen = () => (
  <div style={{minHeight:"100vh",background:S.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div className="spinner"/>
  </div>
);

const bS = (extra) => ({
  display:"inline-flex",alignItems:"center",justifyContent:"center",
  padding:"12px 24px",fontSize:12,fontWeight:600,letterSpacing:"1.5px",
  textTransform:"uppercase",cursor:"pointer",border:"none",transition:"all .2s",...extra
});

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [isReady, setIsReady] = useState(false);
  const [page, setPage] = useState("dashboard");
  const isInitializing = useRef(true);
  const authSubscription = useRef(null);

  const loadProfile = async (userId) => {
    if (!userId) { setProfile(null); return null; }
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) { console.error("Profile error:", error); setProfile(null); return null; }
      setProfile(data);
      return data;
    } catch (err) {
      console.error("Profile exception:", err);
      setProfile(null);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      isInitializing.current = true;
      const { data: { session } } = await supabase.auth.getSession();
      const initialUser = session?.user ?? null;
      if (!mounted) return;
      setUser(initialUser);
      if (initialUser) {
        await loadProfile(initialUser.id);
      } else {
        setProfile(null);
      }
      if (!mounted) return;
      isInitializing.current = false;
      setIsReady(true);

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (isInitializing.current) return;
        const newUser = session?.user ?? null;
        setUser(prev => {
          if (prev?.id === newUser?.id) return prev;
          return newUser;
        });
        if (newUser) {
          await loadProfile(newUser.id);
        } else {
          setProfile(null);
        }
      });

      authSubscription.current = subscription;
    };

    init();

    return () => {
      mounted = false;
      if (authSubscription.current) authSubscription.current.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setPage("dashboard");
  };

  if (!isReady || user === undefined || profile === undefined) return <><style>{css}</style><SpinScreen/></>;
  if (!user) return <><style>{css}</style><LoginScreen/></>;

  const isCoach = profile?.role === "coach" || profile?.email === COACH_EMAIL;

  return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh"}}>
        <TopBar profile={profile} isCoach={isCoach} onLogout={logout}/>
        <div style={{display:"flex",minHeight:"calc(100vh - 54px)"}}>
          <Sidebar isCoach={isCoach} page={page} setPage={setPage}/>
          <main className="main" style={{flex:1,padding:28,overflowY:"auto"}}>
            {isCoach ? (
              <>
                {page==="dashboard" && <CoachHome setPage={setPage}/>}
                {page==="clients" && <ClientsPanel/>}
                {page==="progress" && <CoachProgress/>}
              </>
            ) : (
              <>
                {page==="dashboard" && <ClientHome profile={profile} setPage={setPage}/>}
                {page==="daily" && <DailyCheckin profile={profile} onDone={()=>setPage("dashboard")}/>}
                {page==="weekly" && <WeeklyCheckin profile={profile} onDone={()=>setPage("dashboard")}/>}
                {page==="progress" && <Progress profile={profile}/>}
                {page==="workouts" && <Workouts profile={profile}/>}
              </>
            )}
          </main>
        </div>
      </div>
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
    ? [{id:"dashboard",icon:"⚡",label:"Overview"},{id:"clients",icon:"👥",label:"Clients"},{id:"progress",icon:"📈",label:"Progress"}]
    : [{id:"dashboard",icon:"⚡",label:"Dashboard"},{id:"daily",icon:"✅",label:"Daily Check-In"},{id:"weekly",icon:"🔥",label:"Weekly Check-In"},{id:"progress",icon:"📈",label:"Progress"},{id:"workouts",icon:"🏋",label:"Workout Log"}];
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

  return (
    <div>
      <PageTitle title="Progress" sub="Your data over time"/>
      <div style={{display:"flex",borderBottom:"1px solid "+S.border,marginBottom:24}}>
        {[["weight","Weight"],["wellness","Wellness"],["measurements","Measurements"],["goals","Goals"]].map(([id,label])=>(
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

function Workouts({ profile }) {
  const [exercises, setExercises] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [logMode, setLogMode] = useState(false);
  const [sets, setSets] = useState([{weight:"",reps:"",time:""},{weight:"",reps:"",time:""},{weight:"",reps:"",time:""},{weight:"",reps:"",time:""}]);
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
    setSets([{weight:"",reps:"",time:""},{weight:"",reps:"",time:""},{weight:"",reps:"",time:""},{weight:"",reps:"",time:""}]);
    setTimeout(()=>setSaved(false),2000);
  };

  const selectedEx = exercises.find(e=>e.id===selected);
  const chartData = logs.reduce((acc,log)=>{const ex=acc.find(a=>a.date===log.date);if(!ex)acc.push({date:log.date,weight:log.weight,reps:log.reps});return acc;},[]);

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
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:22}}>
            {exercises.map(ex=>(
              <button key={ex.id} onClick={()=>{setSelected(ex.id);setLogMode(false);}}
                style={{padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid "+(selected===ex.id?S.accent:S.border),background:selected===ex.id?"rgba(255,77,0,.08)":"transparent",color:selected===ex.id?S.accent:S.muted}}>
                {ex.name}
              </button>
            ))}
          </div>
          {selectedEx&&(
            <>
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
                  <Btn sm teal onClick={()=>setLogMode(!logMode)}>{logMode?"Cancel":"+ Log Session"}</Btn>
                </div>
                {logMode&&(
                  <div style={{marginBottom:20,padding:16,background:S.surface2,border:"1px solid "+S.border}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,marginBottom:14}}>Log {selectedEx.name}</div>
                    {sets.map((s,i)=>(
                      <div key={i} style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:11,color:S.muted,width:42}}>Set {i+1}</span>
                        {!selectedEx.is_bodyweight&&<input type="number" placeholder="lbs" value={s.weight} onChange={e=>{const n=[...sets];n[i].weight=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:80,outline:"none"}}/>}
                        <input type="number" placeholder="reps" value={s.reps} onChange={e=>{const n=[...sets];n[i].reps=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:80,outline:"none"}}/>
                        <input type="text" placeholder="time (opt)" value={s.time} onChange={e=>{const n=[...sets];n[i].time=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:100,outline:"none"}}/>
                      </div>
                    ))}
                    <div style={{marginTop:14}}><Btn onClick={handleLog} disabled={saving}>{saving?"Saving...":"Save Session"}</Btn></div>
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

function CoachHome({ setPage }) {
  const [clients, setClients] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const load = async()=>{
      const {data} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL);
      setClients(data||[]);
      const c={};
      for(const p of (data||[])){
        const {count} = await supabase.from("daily_checkins").select("*",{count:"exact",head:true}).eq("client_id",p.id);
        c[p.id]=count||0;
      }
      setCounts(c);setLoading(false);
    };
    load();
  },[]);

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  return (
    <div>
      <PageTitle title="Coach Dashboard" sub="V12 System · All Clients"/>
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <Stat label="Total Clients" value={clients.length} unit=""/>
        <Stat label="Total Check-ins" value={Object.values(counts).reduce((a,b)=>a+b,0)} unit=""/>
        <Stat label="Active Programs" value={clients.length} unit=""/>
        <Stat label="System" value="V12" unit=""/>
      </div>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <CardTitle>Client Roster</CardTitle>
          <Btn sm teal onClick={()=>setPage("clients")}>Manage Clients</Btn>
        </div>
        {clients.length===0&&<div style={{color:S.muted,fontSize:13,padding:"20px 0"}}>No clients yet. Share the app URL with your clients.</div>}
        {clients.map((c,i)=>(
          <div key={c.id} onClick={()=>setPage("clients")}
            style={{background:S.surface,border:"1px solid "+S.border,padding:"18px 20px",display:"flex",alignItems:"center",gap:16,cursor:"pointer",marginBottom:10}}>
            <div style={{width:46,height:46,borderRadius:"50%",background:COLORS[i%COLORS.length],color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>
              {avatarFrom(c.name||c.email)}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:14}}>{c.name||c.email}</div>
              <div style={{fontSize:12,color:S.muted}}>{c.goal||"No goal set"}</div>
            </div>
            <div style={{textAlign:"right",fontSize:12,color:S.muted}}>{counts[c.id]||0} check-ins</div>
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
  useEffect(()=>{if(selected)loadEx(selected);},[selected]);

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
              <div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22}}>{client.name||"—"}</div>
                <div style={{fontSize:12,color:S.muted}}>{client.email} · Joined {client.created_at?.split("T")[0]}</div>
                <div style={{fontSize:13,marginTop:4}}>{client.goal||"No goal set"}</div>
              </div>
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
