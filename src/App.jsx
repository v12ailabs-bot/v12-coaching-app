import { useState, useEffect, useRef, useCallback } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";



import { supabase } from "./supabaseClient.js";
import { S, bS, TT, todayStr, localDateStr, useIsMobile, trainingOwnerId, avatarFrom, GlobalStyles } from "./theme.jsx";
import { Card, CardTitle, PageTitle, Stat, Fld, Inp, Sld, RG, Btn, CC, DayFolder, StatusBadge, CollapsibleSection, Alert, MetricCard, V12Logo } from "./components/ui/index.js";
import { CoachMessage, GoalInsightBanner, NewSummaryBanner, InvoiceCard } from "./components/ClientBanners.jsx";
import { ProgramRoadmap } from "./components/ProgramRoadmap.jsx";
import { WorkoutMannequin } from "./components/WorkoutMannequin.jsx";
import { RestTimer } from "./components/RestTimer.jsx";
import { WeightOverTimeChart, TopSetRepsChart, targetRepRange, topSetPerDay } from "./features/workouts/WorkoutCharts.jsx";
import { WorkoutScheduler } from "./features/scheduling/WorkoutScheduler.jsx";
import { ClientWorkoutReview } from "./features/workouts/ClientWorkoutReview.jsx";
import { ClientHome } from "./features/clientDashboard/ClientHome.jsx";
import { CoachHome } from "./features/coachDashboard/CoachHome.jsx";
import { CRMBoard } from "./features/crm/CRMBoard.jsx";
import { DAY_ORDER, EX_TYPES, PHASES, groupByDay, PROGRAM_HABITS, streakBack, COACH_EMAIL, INTAKE_FIELDS, BLOCK_TYPE_LABEL, BLOCK_TYPE_SHORT, groupIntoBlocks } from "./lib/constants.js";
import { Progress } from "./features/progress/ProgressPage.jsx";
import { ProgramProgress } from "./features/progress/ProgramProgressPage.jsx";
import { ClientDetailPage } from "./features/clientDetail/ClientDetailPage.jsx";
import { LoginScreen } from "./features/auth/LoginScreen.jsx";
import { ResetPasswordScreen } from "./features/auth/ResetPasswordScreen.jsx";



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



// Design tokens, shared style helpers, and the base UI primitives now live in
// src/theme.jsx and src/components/ui/ (extracted from this file so new
// features don't have to be built inside one monolithic component).



export default function App() {

  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);

  // True while the user is following a password-reset link. Detected up front
  // from the recovery token Supabase puts in the URL hash, and reinforced by the
  // PASSWORD_RECOVERY auth event (which fires once detectSessionInUrl parses it).
  const [recovery, setRecovery] = useState(
    () => typeof window !== "undefined" && /type=recovery/.test(window.location.hash)
  );

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



            // PASSWORD RECOVERY - user clicked the reset link. Show the
            // set-new-password screen instead of dropping them into the app.
            if (event === "PASSWORD_RECOVERY") {

              setRecovery(true);

              setUser(authUser);

              setLoading(false);

              return;

            }



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



  // PASSWORD RECOVERY - takes priority over the normal login/app routing so the
  // client can set a new password after following the emailed reset link.
  if (recovery) {

    return (
      <>
        <GlobalStyles />
        <ResetPasswordScreen onDone={() => setRecovery(false)} />
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

function TopBar({ profile, isCoach, onLogout }) {
  return (
    <div className="topbar" style={{height:54,background:S.surface,borderBottom:"1px solid "+S.border,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",position:"sticky",top:0,zIndex:100}}>
      <V12Logo size={30}/>
      <div style={{display:"flex",alignItems:"center",gap:14,minWidth:0}}>
        {/* Coaching clients get this as one of the ReminderCircles on their
            Home page instead (folded in alongside Daily/Weekly) — only
            program-only clients (who don't land on that page) still need it
            here. Circular, not the old rectangular pill — small and easy to
            miss was the reported problem, but a bigger rectangle wasn't the
            fix; a properly sized icon button is. */}
        {!isCoach && profile?.client_type==="program_only" && profile?.dashboard_url && (
          <a href={profile.dashboard_url} target="_blank" rel="noopener noreferrer" title="Open your Notion dashboard"
            style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:"rgba(139,92,246,.16)",border:"2px solid #8B5CF6",color:"#8B5CF6",fontSize:14,textDecoration:"none"}}>
            📊
          </a>
        )}
        <span style={{fontSize:13,color:S.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{profile?.name||profile?.email}</span>
        <div style={{width:32,height:32,borderRadius:"50%",background:isCoach?S.accent:S.accent2,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>
          {avatarFrom(profile?.name||profile?.email)}
        </div>
        <button onClick={onLogout} style={{...bS({}),background:"transparent",color:S.text,border:"1px solid "+S.border,padding:"7px 14px",fontSize:10}}>Sign out</button>
      </div>
    </div>
  );
}

// Pages grouped behind the "Check-In" and "More" nav tabs — used only to
// decide which nav item highlights when the client is on one of the pages
// it groups (e.g. still highlight "More" while on the Nutrition page).
const CHECKIN_GROUP = ["checkin", "daily", "weekly"];
const MORE_GROUP = ["more", "program", "nutrition", "habits", "resources", "schedule"];

function Sidebar({ isCoach, programOnly, page, setPage }) {
  const isMobile = useIsMobile();
  // Client nav is deliberately short — 5 tabs (4 for program-only, who have
  // no check-in flow) so it fits a mobile bottom bar without crowding.
  // Everything else (Program, Nutrition, Habits, Library) lives behind
  // "More" (see MoreMenu); Daily/Weekly check-in live behind "Check-In"
  // (see CheckInHome). Both are reachable directly too (e.g. dashboard
  // reminders deep-link straight to "daily") — the nav is just the entry point.
  const clientNav = programOnly
    ? [{id:"program",icon:"📋",label:"Plan",short:"Plan"},{id:"workouts",icon:"🏋",label:"Workouts",short:"Workouts"},{id:"progress",icon:"📈",label:"Progress",short:"Progress"},{id:"more",icon:"☰",label:"More",short:"More"}]
    : [{id:"dashboard",icon:"⚡",label:"Home",short:"Home"},{id:"checkin",icon:"✅",label:"Check-In",short:"Check-In"},{id:"workouts",icon:"🏋",label:"Workouts",short:"Workouts"},{id:"progress",icon:"📈",label:"Progress",short:"Progress"},{id:"more",icon:"☰",label:"More",short:"More"}];
  const nav = isCoach
    ? [{id:"dashboard",icon:"⚡",label:"Overview",short:"Home"},{id:"clients",icon:"👥",label:"Clients",short:"Clients"},{id:"crm",icon:"📇",label:"Leads / CRM",short:"Leads"},{id:"metrics",icon:"📊",label:"Business + Content",short:"Metrics"},{id:"assess",icon:"🧭",label:"Assessments",short:"Assess"},{id:"templates",icon:"📋",label:"Templates",short:"Plans"},{id:"library",icon:"📚",label:"Library",short:"Library"}]
    : clientNav;
  const activeId = nav.some((n) => n.id === page) ? page
    : CHECKIN_GROUP.includes(page) ? "checkin"
    : MORE_GROUP.includes(page) ? "more"
    : page;
  return (
    <nav className="sidebar" style={{width:216,background:S.surface,borderRight:"1px solid "+S.border,padding:"20px 0",flexShrink:0,position:"sticky",top:54,height:"calc(100vh - 54px)",overflowY:"auto"}}>
      <div className="sidebar-inner" style={{padding:"0 14px"}}>
        <div className="sidebar-heading" style={{fontSize:9,letterSpacing:"2.5px",textTransform:"uppercase",color:S.muted,padding:"0 10px",marginBottom:6}}>{isCoach?"Coach":"Training"}</div>
        {nav.map(item=>(
          <div key={item.id} className="sidebar-item" onClick={()=>setPage(item.id)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",fontSize:13,fontWeight:500,color:activeId===item.id?S.accent:S.muted,cursor:"pointer",borderRadius:3,marginBottom:1,background:activeId===item.id?"rgba(255,106,0,.12)":"transparent"}}>
            <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
            <span className="sidebar-label">{isMobile&&item.short?item.short:item.label}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}

const TEMPLATE_CATEGORIES = ["Hybrid", "Fat Loss", "Muscle", "Strength", "Athletic", "Beginner", "Home", "General"];
const RESOURCE_KINDS = ["recipe", "article", "video", "pdf"];
// Library is organized into these fixed collapsible folders. The coach files each
// resource into one (resources.category); the client browses them as dropdowns.
const LIBRARY_FOLDERS = ["Getting Started", "Nutrition", "Training", "Progress", "FAQ"];
// What's coming to the app — shown as a teaser section at the bottom of the Library.
const ROADMAP_ITEMS = [
  ["🏅", "Achievement Badges", "Earn badges for streaks, PRs, and milestones."],
  ["📅", "Monthly Challenges", "Fresh community challenges to keep you pushing."],
  ["🥗", "More Nutrition Resources", "Expanded recipes, meal plans, and guides."],
  ["🏋", "Expanded Exercise Library", "Demo videos and a deeper movement catalog."],
  ["👥", "Community Features", "Connect, compare, and train alongside others."],
];

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
        .eq("client_id", trainingOwnerId(profile));
      const { data: nut } = await supabase
        .from("nutrition_plans")
        .select("id")
        .eq("client_id", profile.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      setStatus({ exercises: count || 0, nutrition: !!nut, loading: false });
    })();
  }, [profile.id, profile.shared_program_owner_id]);

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
        ["📋", "Program incoming", "A hybrid program tailored to your V12 assessment is on its way."],
        ["🥗", "Nutrition plan", "Macro targets and meal guidance to fuel the work."],
        ["🎯", "Track it yourself", "Log workouts, tick off daily habits, and watch your own progress — plus a full resource library."],
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
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 0%, rgba(198,255,0,.14) 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(255,106,0,.10) 0%, transparent 50%)" }} />
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

      {/* New-here directions → Library / Getting Started */}
      <Card style={{ borderLeft: "3px solid " + S.neon }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22 }}>New here? Start with Getting Started</div>
            <div style={{ fontSize: 13, color: S.muted, marginTop: 4, lineHeight: 1.6, maxWidth: 560 }}>
              Head to the Library and open the <span style={{ color: S.neon, fontWeight: 700 }}>Getting Started</span> folder — it walks you through how to use the app, log your training, and track progress.
            </div>
          </div>
          <Btn teal onClick={() => onEnter("resources")}>Open the Library →</Btn>
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

function DailyCheckin({ profile, onDone }) {
  const [form, setForm] = useState({weight:"",sleep:7,energy:7,mood:7,water:8,diet:"On track",workout:"completed",calories:"",protein_g:"",carbs_g:"",fats_g:""});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existing, setExisting] = useState(null);
  // Guards against the fetch below overwriting text the client already
  // started typing before it resolved — render nothing until it's settled.
  const [ready, setReady] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{
    supabase.from("daily_checkins").select("*").eq("client_id",profile.id).eq("date",todayStr()).maybeSingle()
      .then(({data})=>{if(data){setExisting(data);setForm({weight:data.weight||"",sleep:data.sleep,energy:data.energy,mood:data.mood,water:data.water,diet:data.diet,workout:data.workout,calories:data.calories??"",protein_g:data.protein_g??"",carbs_g:data.carbs_g??"",fats_g:data.fats_g??""});}setReady(true);});
  },[profile.id]);

  if(!ready) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const submit = async () => {
    setLoading(true);
    const num = (v)=>{const n=parseFloat(v);return Number.isNaN(n)?null:n;};
    const entry = {client_id:profile.id,date:todayStr(),...form,weight:parseFloat(form.weight)||null,
      calories:num(form.calories),protein_g:num(form.protein_g),carbs_g:num(form.carbs_g),fats_g:num(form.fats_g)};
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
          <Fld label="Calories"><Inp type="number" value={form.calories} onChange={e=>set("calories",e.target.value)} placeholder="e.g. 2200"/></Fld>
          <Fld label="Protein (g)"><Inp type="number" value={form.protein_g} onChange={e=>set("protein_g",e.target.value)} placeholder="e.g. 180"/></Fld>
          <Fld label="Carbs (g)"><Inp type="number" value={form.carbs_g} onChange={e=>set("carbs_g",e.target.value)} placeholder="e.g. 220"/></Fld>
          <Fld label="Fats (g)"><Inp type="number" value={form.fats_g} onChange={e=>set("fats_g",e.target.value)} placeholder="e.g. 70"/></Fld>
        </div>
        <div style={{marginTop:20}}><Btn onClick={submit} disabled={loading}>{loading?"Saving...":"Log Check-In"}</Btn></div>
      </Card>
    </div>
  );
}

function WeeklyCheckin({ profile, onDone }) {
  const weekStart = (()=>{const d=new Date();d.setDate(d.getDate()-d.getDay());return localDateStr(d);})();
  const [form, setForm] = useState({
    bodyweight:"", waist:"", chest:"", hips:"", arms:"", week_number:"",
    training_days:"", workout_feel:"", pump:"", exercise_feedback:"", lifts_improved:"", felt_weaker:"", cardio_performance:"",
    nutrition_compliance:5, sleep_quality:5, hydration_quality:5, discipline_level:5, confidence_level:5, mental_blocks:"",
    goal_progress:50, feeling:5,
    what_went_well:"", lifestyle_wins:"", biggest_challenge:"", holding_back:"",
    adjustments:"", coach_questions:"",
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState(null);
  // Guards against the fetches below overwriting text the client already
  // started typing before they resolved — render nothing until settled.
  const [ready, setReady] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  // Numeric columns — coerced to number|null on save so empty inputs don't
  // hit non-numeric Postgres columns.
  const NUMERIC = ["bodyweight","waist","chest","hips","arms","week_number","training_days","nutrition_compliance","sleep_quality","hydration_quality","discipline_level","confidence_level","goal_progress","feeling"];

  useEffect(()=>{
    (async()=>{
      const {data} = await supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).eq("date",weekStart).maybeSingle();
      if(data){ setExisting(data); setForm(f=>{const next={...f};Object.keys(f).forEach(k=>{if(data[k]!=null)next[k]=data[k];});return next;}); setReady(true); return; }
      // No entry yet this week — prefill the stable measurements from the most
      // recent prior check-in (and bump the week number) so the client only
      // updates what changed instead of re-typing everything.
      const {data:prev} = await supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).lt("date",weekStart).order("date",{ascending:false}).limit(1).maybeSingle();
      if(prev){ setForm(f=>({...f, bodyweight:prev.bodyweight??"", waist:prev.waist??"", chest:prev.chest??"", hips:prev.hips??"", arms:prev.arms??"", week_number:prev.week_number!=null?String(Number(prev.week_number)+1):""})); }
      setReady(true);
    })();
  },[profile.id]);

  if(!ready) return <div className="spinner" style={{ margin: "80px auto" }} />;

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
      <Card style={{borderLeft:"3px solid "+S.accent2,paddingTop:16,paddingBottom:16}}>
        <div style={{fontSize:13,color:S.text,lineHeight:1.6}}>Only the ratings are required — everything else is optional. Your measurements are pre-filled from last week, so just update what changed.</div>
      </Card>
      <Card>
        <CardTitle>Body Stats</CardTitle>
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <Fld label="Bodyweight (lbs)"><Inp type="number" step="0.1" value={form.bodyweight||""} onChange={e=>set("bodyweight",e.target.value)} placeholder="lbs"/></Fld>
          <Fld label="Waist (inches)"><Inp type="number" step="0.1" value={form.waist||""} onChange={e=>set("waist",e.target.value)} placeholder="inches"/></Fld>
          <Fld label="Chest (inches)"><Inp type="number" step="0.1" value={form.chest||""} onChange={e=>set("chest",e.target.value)} placeholder="inches"/></Fld>
          <Fld label="Hips (inches)"><Inp type="number" step="0.1" value={form.hips||""} onChange={e=>set("hips",e.target.value)} placeholder="inches"/></Fld>
          <Fld label="Arms (inches)"><Inp type="number" step="0.1" value={form.arms||""} onChange={e=>set("arms",e.target.value)} placeholder="inches"/></Fld>
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
        <CardTitle>Progress Toward Your Goal</CardTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Sld label="Progress toward your goal" val={form.goal_progress??50} min={0} max={100} sfx="%" onChange={v=>set("goal_progress",v)}/>
          <Sld label="How this week felt overall" val={form.feeling??5} min={1} max={10} sfx="/10" onChange={v=>set("feeling",v)}/>
        </div>
      </Card>
      <DayFolder title="Wins & Challenges" meta="Optional">
        <Fld label="What went well this week?"><textarea rows={2} value={form.what_went_well||""} onChange={e=>set("what_went_well",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Physical or lifestyle wins?"><textarea rows={2} value={form.lifestyle_wins||""} onChange={e=>set("lifestyle_wins",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Biggest challenge this week?"><textarea rows={2} value={form.biggest_challenge||""} onChange={e=>set("biggest_challenge",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
        <Fld label="Anything holding back progress?"><textarea rows={2} value={form.holding_back||""} onChange={e=>set("holding_back",e.target.value)} placeholder="" style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/></Fld>
      </DayFolder>
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
// PROGRAM-ONLY — SELF-GUIDED HABITS + PROGRESS (no coach, client-only)
// ---------------------------------------------------------------------------
// Program-only clients have no coach and no check-ins. Their daily habits and
// body metrics are stored on their own daily_checkins row (habit_flags jsonb +
// weight/waist), which they can read/write under existing RLS. Strength PRs and
// photos reuse the shared StrengthTab / ProgressPhotos components.
function ProgramHabits({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [savingBody, setSavingBody] = useState(false);
  const [savedBody, setSavedBody] = useState(false);
  const [bodyErr, setBodyErr] = useState(null);
  const [habitErr, setHabitErr] = useState(null);
  const today = todayStr();

  const load = useCallback(async () => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29);
    const cut = cutoff.toISOString().split("T")[0];
    const { data } = await supabase.from("daily_checkins")
      .select("date,habit_flags,weight,waist").eq("client_id", profile.id).gte("date", cut).order("date");
    const list = data || [];
    setRows(list);
    const t = list.find((r) => r.date === today);
    setWeight(t?.weight ?? "");
    setWaist(t?.waist ?? "");
    setLoading(false);
  }, [profile.id, today]);
  useEffect(() => { load(); }, [load]);

  const flagsFor = (date) => rows.find((r) => r.date === date)?.habit_flags || {};
  const todayFlags = flagsFor(today);

  const toggle = async (key) => {
    const next = { ...flagsFor(today), [key]: !flagsFor(today)[key] };
    setRows((prev) => {
      const i = prev.findIndex((r) => r.date === today);
      if (i === -1) return [...prev, { date: today, habit_flags: next }];
      const copy = [...prev]; copy[i] = { ...copy[i], habit_flags: next }; return copy;
    });
    setHabitErr(null);
    const { error } = await supabase.from("daily_checkins").upsert(
      { client_id: profile.id, date: today, habit_flags: next },
      { onConflict: "client_id,date" }
    );
    if (error) { setHabitErr(error.message); load(); }
  };

  const saveBody = async () => {
    setSavingBody(true); setBodyErr(null);
    const { error } = await supabase.from("daily_checkins").upsert(
      { client_id: profile.id, date: today,
        weight: weight === "" ? null : parseFloat(weight),
        waist: waist === "" ? null : parseFloat(waist) },
      { onConflict: "client_id,date" }
    );
    setSavingBody(false);
    if (error) { setBodyErr(error.message); return; }
    setSavedBody(true); setTimeout(() => setSavedBody(false), 2000);
    load();
  };

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const inS = { background: S.bg, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 13, width: 120, outline: "none" };
  const days14 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d.toISOString().split("T")[0]; });
  const doneOn = (key, date) => !!flagsFor(date)[key];
  const doneToday = PROGRAM_HABITS.filter((h) => todayFlags[h.key]).length;
  const pct = Math.round((doneToday / PROGRAM_HABITS.length) * 100);
  const streak = streakBack((date) => PROGRAM_HABITS.every((h) => doneOn(h.key, date)));

  return (
    <div>
      <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 22 }}>
        <Stat label="Done Today" value={doneToday} unit={"/" + PROGRAM_HABITS.length} />
        <Stat label="Today's Completion" value={pct} unit="%" />
        <Stat label="Perfect-Day Streak" value={streak} unit="days" />
      </div>
      <Card>
        <CardTitle>Today · {today}</CardTitle>
        <Alert variant="error">{habitErr}</Alert>
        {PROGRAM_HABITS.map((h) => {
          const done = !!todayFlags[h.key];
          return (
            <div key={h.key} onClick={() => toggle(h.key)}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 4px", borderBottom: "1px solid " + S.border, cursor: "pointer" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, background: done ? S.neon : "transparent", color: done ? "#0A0A0B" : S.muted, border: done ? "none" : "1px solid " + S.border }}>
                {done ? "✓" : ""}
              </div>
              <span style={{ fontSize: 14, color: done ? S.text : S.muted }}>{h.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: S.muted }}>{h.hint}</span>
            </div>
          );
        })}
      </Card>
      <Card>
        <CardTitle>Body Metrics · Today</CardTitle>
        <Alert variant="error">{bodyErr}</Alert>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Fld label="Bodyweight (lb)"><input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} style={inS} /></Fld>
          <Fld label="Waist (in)"><input type="number" value={waist} onChange={(e) => setWaist(e.target.value)} style={inS} /></Fld>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <Btn onClick={saveBody} disabled={savingBody}>{savingBody ? "Saving..." : "Save"}</Btn>
            {savedBody && <span style={{ color: S.accent2, fontSize: 12, fontWeight: 600 }}>Saved!</span>}
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle>Last 14 days</CardTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 540 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, color: S.muted }}></th>
                {days14.map((d) => (<th key={d} style={{ padding: "6px 4px", fontSize: 9, color: S.muted, fontWeight: 600 }}>{d.slice(5)}</th>))}
              </tr>
            </thead>
            <tbody>
              {PROGRAM_HABITS.map((h) => (
                <tr key={h.key}>
                  <td style={{ padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap", color: S.text }}>{h.label}</td>
                  {days14.map((d) => (
                    <td key={d} style={{ padding: "5px 4px", textAlign: "center" }}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, margin: "0 auto", background: doneOn(h.key, d) ? S.neon : S.surface2, border: "1px solid " + S.border }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Program-only clients can ask to move to full coaching. Files one pending
// upgrade_requests row (client-writable); the coach sees it on their dashboard.
// Reflects an existing pending request so it can't be sent twice.
function UpgradeCTA({ profile }) {
  const [state, setState] = useState("loading"); // loading | idle | sending | pending
  useEffect(() => {
    supabase.from("upgrade_requests").select("id").eq("client_id", profile.id).eq("status", "pending").limit(1).maybeSingle()
      .then(({ data }) => setState(data ? "pending" : "idle"));
  }, [profile.id]);

  const request = async () => {
    setState("sending");
    const { error } = await supabase.from("upgrade_requests").insert({ client_id: profile.id, status: "pending" });
    setState(error ? "idle" : "pending");
  };

  if (state === "loading") return null;
  const pending = state === "pending";
  return (
    <div style={{ background: "rgba(198,255,0,.08)", border: "1px solid rgba(198,255,0,.3)", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Want 1-on-1 coaching?</div>
        <div style={{ fontSize: 12, color: S.muted }}>{pending ? "Request received — your coach will reach out soon." : "Add check-ins, feedback, and a coach in your corner."}</div>
      </div>
      <Btn onClick={request} disabled={pending || state === "sending"}>{pending ? "Requested ✓" : state === "sending" ? "Sending..." : "Upgrade to Coaching"}</Btn>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLIENT — RESOURCE / RECIPE LIBRARY (read-only browse)
// ---------------------------------------------------------------------------
// Library resource card — shared by every folder in the client Library.
function ResourceCard({ r }) {
  return (
    <Card style={{ marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 19, lineHeight: 1.1 }}>{r.title}</div>
        <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.neon, flexShrink: 0 }}>{r.kind}</span>
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
  );
}

function Resources() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("resources").select("*").eq("published", true).order("created_at", { ascending: false })
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  }, []);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  // Always show the fixed folders (so structure — and Getting Started — is
  // visible even when empty); append an "Other" folder for anything filed under
  // a legacy/unknown category so nothing is hidden. All closed until clicked.
  const known = new Set(LIBRARY_FOLDERS);
  const inFolder = (folder) => items.filter((r) => (r.category || "").trim() === folder);
  const other = items.filter((r) => !known.has((r.category || "").trim()));
  const folders = [...LIBRARY_FOLDERS.map((f) => [f, inFolder(f)]), ...(other.length ? [["Other", other]] : [])];

  return (
    <div>
      <PageTitle title="Library" sub="Guides, recipes, and resources — organized into folders. New here? Open Getting Started." />
      {folders.map(([folder, list]) => (
        <DayFolder key={folder} title={folder} meta={`${list.length} item${list.length === 1 ? "" : "s"}`}>
          {list.length === 0 ? (
            <div style={{ color: S.muted, fontSize: 13 }}>Nothing here yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
              {list.map((r) => <ResourceCard key={r.id} r={r} />)}
            </div>
          )}
        </DayFolder>
      ))}

      <RoadmapSection />
    </div>
  );
}

// "Coming soon" teaser shown at the bottom of both the client Library and the
// coach Library so the coach previews exactly what clients see.
function RoadmapSection() {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, margin: "0 2px 12px" }}>🚀 On the Roadmap · Coming Soon</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
        {ROADMAP_ITEMS.map(([icon, title, body]) => (
          <Card key={title} style={{ marginBottom: 0, opacity: 0.92 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 22 }}>{icon}</div>
              <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted }}>Coming soon</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12.5, color: S.muted, lineHeight: 1.6 }}>{body}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Workouts({ profile, embedded, targetDay, onTargetConsumed, setPage }) {
  const isMobile = useIsMobile();
  const [exercises, setExercises] = useState([]);
  const [logs, setLogs] = useState([]);
  const [dayLoggedIds, setDayLoggedIds] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const blankRow = () => ({weight:"",reps:"",time:""});
  const freshSets = (n) => Array.from({length: Math.min(8, Math.max(1, parseInt(n)||4))}, blankRow);
  const [sets, setSets] = useState(freshSets(4));
  // Grouped-block logging (superset/circuit variants): one entry per member
  // exercise per round, plus one rest value per round (per Task 10 — rest is
  // logged once per completed group, not per exercise; circuit_for_time has
  // no rest concept at all).
  const blankRound = (members) => {
    const perExercise = {};
    members.forEach((m) => { perExercise[m.id] = { weight: "", reps: "", time: "" }; });
    return { perExercise, time: "", rest: "" };
  };
  const freshRounds = (n, members) => Array.from({ length: Math.min(8, Math.max(1, parseInt(n) || 4)) }, () => blankRound(members));
  const [rounds, setRounds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadEx = useCallback(async()=>{
    // No .order() here — groupByDay owns exercise ordering (by phase, then
    // order_index) once grouped by day.
    const {data} = await supabase.from("exercises").select("*").eq("client_id",trainingOwnerId(profile));
    setExercises(data||[]);
    if(data&&data.length>0&&!selected){
      // Default selection depends on how the client got here:
      //  - targetDay==="next" (Home's "Next Workout" row): always the next
      //    scheduled day after today, even if today itself has one — that's
      //    the whole point of "next".
      //  - targetDay==="today" (Home's "Today" card's "View Full Workout"),
      //    or no explicit intent at all (the bottom-nav Workouts tab): prefer
      //    today's own scheduled day, falling back to the next one if today
      //    is a rest day. Previously this always skipped to the next day
      //    regardless of intent, which is what sent "today" clicks to
      //    tomorrow's workout instead.
      const groups = groupByDay(data);
      const todayIdx = DAY_ORDER.indexOf(new Date().toLocaleDateString("en-US",{weekday:"long"}));
      let target = targetDay === "next" ? null : groups.find(g=>g.day===DAY_ORDER[todayIdx]);
      for(let i=1;i<=7&&!target;i++){
        target = groups.find(g=>g.day===DAY_ORDER[(todayIdx+i)%7]);
      }
      setSelected((target||groups[0]).exercises[0].id);
      onTargetConsumed?.();
    }
  },[profile.id,profile.shared_program_owner_id,targetDay]);

  useEffect(()=>{loadEx();},[loadEx]);

  const selectedEx = exercises.find(e=>e.id===selected);
  const blockType = selectedEx?.block_type || "straight_set";
  const groupMembers = selectedEx
    ? exercises.filter((e) => e.day_of_week === selectedEx.day_of_week && e.group_id === selectedEx.group_id)
    : [];
  // Grouped blocks need every member's logs (not just the currently-selected
  // one) so the combined card can show a per-round completion checkmark.
  const groupMemberIds = blockType==="straight_set" ? (selected?[selected]:[]) : groupMembers.map(m=>m.id);
  useEffect(()=>{
    if(!groupMemberIds.length) return;
    supabase.from("workout_logs").select("*").eq("client_id",profile.id).in("exercise_id",groupMemberIds).order("date")
      .then(({data})=>setLogs(data||[]));
  },[groupMemberIds.join(","),profile.id,saved]);

  // Group the program's exercises into sequential "Day 1..N" for the compact
  // day header + selector below — one day shown at a time (prev/next to
  // switch) instead of every day stacked as an accordion.
  const dayGroups = groupByDay(exercises);
  const dayLabelOf = {};
  dayGroups.forEach(g=>g.exercises.forEach(e=>{dayLabelOf[e.id]=g.label;}));
  const currentDay = dayGroups.find(g=>g.exercises.some(e=>e.id===selected)) || dayGroups[0] || null;
  const currentDayIndex = currentDay ? dayGroups.indexOf(currentDay) : -1;
  const goToDay = (delta) => {
    if(!dayGroups.length) return;
    const next = dayGroups[(currentDayIndex + delta + dayGroups.length) % dayGroups.length];
    if(next) setSelected(next.exercises[0].id);
  };

  // Collapse a superset/circuit's members into one navigable item — a
  // grouped block should be one pill to swipe to (and one combined card),
  // not one pill per exercise that happen to link to the same content.
  const dayItems = currentDay ? groupIntoBlocks(currentDay.exercises) : [];

  // Which of the current day's exercises already have a logged set today —
  // drives the compact day header's "X of Y exercises" + progress bar.
  useEffect(()=>{
    if(!currentDay || !currentDay.exercises.length){ setDayLoggedIds(new Set()); return; }
    const ids = currentDay.exercises.map(e=>e.id);
    supabase.from("workout_logs").select("exercise_id").eq("client_id",profile.id).eq("date",todayStr()).in("exercise_id",ids)
      .then(({data})=>setDayLoggedIds(new Set((data||[]).map(r=>r.exercise_id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[currentDay?.day, profile.id, saved]);

  // Size the set tracker to cover today's already-logged sets (so logging 5
  // when the target is 4 still shows a 5th row), but always leave the actual
  // weight/reps fields blank — the checkmark (driven by loggedSetNums, from
  // the DB) is what shows a set is done; the boxes are for entering the next
  // value, not for echoing back what was just saved.
  useEffect(()=>{
    if(!selectedEx || blockType!=="straight_set") return;
    const today = todayStr();
    const todayLogs = logs.filter(l=>l.date===today);
    const n = Math.min(8, Math.max(parseInt(selectedEx.sets)||4, todayLogs.length, 1));
    setSets(freshSets(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selected, logs]);
  useEffect(()=>{
    if(selectedEx && blockType!=="straight_set") setRounds(freshRounds(selectedEx.sets, groupMembers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selected]);

  const loggedSetNums = new Set(logs.filter(l=>l.date===todayStr()).map(l=>l.sets));

  // Only inserts rows for sets not already logged today — logging set 3 after
  // sets 1-2 are already saved (and still showing, prefilled, in the tracker)
  // must not re-insert duplicate rows for 1-2.
  const handleLog = async()=>{
    setSaving(true);
    const ex = exercises.find(e=>e.id===selected);
    const today = todayStr();
    const entries = sets.map((s,i)=>({...s,setNum:i+1}))
      .filter(s=>!loggedSetNums.has(s.setNum) && (s.reps||s.weight))
      .map(s=>({
        client_id:profile.id,exercise_id:selected,date:today,
        sets:s.setNum,reps:parseInt(s.reps)||null,
        weight:ex?.is_bodyweight?null:parseFloat(s.weight)||null,
        time:s.time||null
      }));
    if(entries.length>0) await supabase.from("workout_logs").insert(entries);
    setSaving(false);setSaved(true);setSets(sets.map(()=>blankRow()));
    setTimeout(()=>setSaved(false),2000);
  };

  const handleLogGroup = async () => {
    setSaving(true);
    const date = todayStr();
    const entries = [];
    rounds.forEach((round, i) => {
      if (blockType === "circuit_for_time") {
        if (!round.time) return;
        groupMembers.forEach((m) => entries.push({ client_id: profile.id, exercise_id: m.id, date, sets: i + 1, time: round.time }));
        return;
      }
      groupMembers.forEach((m) => {
        const v = round.perExercise[m.id] || {};
        if (!v.reps && !v.weight && !v.time) return;
        entries.push({
          client_id: profile.id, exercise_id: m.id, date, sets: i + 1,
          reps: v.reps ? parseInt(v.reps) : null,
          weight: (blockType === "timed_circuit" || m.is_bodyweight) ? null : (parseFloat(v.weight) || null),
          time: v.time || null,
          rest: round.rest || null,
        });
      });
    });
    if (entries.length > 0) await supabase.from("workout_logs").insert(entries);
    setSaving(false); setSaved(true); setRounds(freshRounds(selectedEx.sets, groupMembers));
    setTimeout(() => setSaved(false), 2000);
  };
  // All-time best (independent of the graphs' per-date reduction below): the
  // heaviest weight ever logged for this exercise, with its reps — or, for
  // bodyweight moves, the best rep count. Only moves when a new log actually
  // beats it, so it doesn't flicker with chart data.
  // Grouped blocks fetch every member's logs (for the round-completion
  // checkmark below); the chart preview + Best Lift stay scoped to whichever
  // single exercise is selected, same as before.
  const selectedExLogs = logs.filter(l=>l.exercise_id===selected);
  const bestSet = selectedExLogs.reduce((best, l) => {
    if (selectedEx?.is_bodyweight) {
      if (l.reps == null) return best;
      return (!best || l.reps > best.reps) ? { weight: null, reps: l.reps } : best;
    }
    if (l.weight == null) return best;
    return (!best || l.weight > best.weight) ? { weight: l.weight, reps: l.reps } : best;
  }, null);
  const chartData = topSetPerDay(selectedExLogs, selectedEx?.is_bodyweight);
  const targetRange = targetRepRange(selectedEx?.reps);
  // Which rounds (set numbers) already have every member's data logged today
  // — drives the per-round checkmark in the combined superset/circuit card.
  const loggedRoundNums = new Set();
  if (blockType!=="straight_set" && groupMembers.length) {
    const today = todayStr();
    const todayGroupLogs = logs.filter(l=>l.date===today);
    const roundsLogged = {};
    todayGroupLogs.forEach(l=>{ (roundsLogged[l.sets] = roundsLogged[l.sets] || new Set()).add(l.exercise_id); });
    Object.entries(roundsLogged).forEach(([num,ids])=>{ if(groupMembers.every(m=>ids.has(m.id))) loggedRoundNums.add(Number(num)); });
  }

  const setStepper = (i, field, delta) => {
    const n = [...sets];
    const cur = parseFloat(n[i][field]) || 0;
    const step = field === "weight" ? 5 : 1;
    n[i][field] = String(Math.max(0, cur + delta*step));
    setSets(n);
  };

  const dayDoneCount = currentDay ? currentDay.exercises.filter(e=>dayLoggedIds.has(e.id)).length : 0;
  const dayTotal = currentDay ? currentDay.exercises.length : 0;
  const dayPct = dayTotal ? Math.round((dayDoneCount/dayTotal)*100) : 0;

  return (
    <div>
      {embedded
        ? <div style={{fontSize:13,color:S.muted,marginBottom:18,lineHeight:1.6}}>Log the sets you complete for each day's exercises. Your progression graphs live under Progress → Strength.</div>
        : <PageTitle title="Workout" sub="Track your strength progression"/>}
      {saved && <div style={{background:"rgba(0,201,167,.14)",color:S.accent2,padding:"10px 18px",fontSize:12,fontWeight:600,marginBottom:16,display:"inline-flex"}}>Set logged!</div>}
      {exercises.length===0?(
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:32,marginBottom:12}}>🏋</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,marginBottom:8}}>No exercises assigned yet</div>
          <div style={{color:S.muted,fontSize:13}}>Your coach will assign your program. Check back soon.</div>
        </Card>
      ):(
        <>
          {/* Compact day header — one day at a time, prev/next to switch,
              replacing the old stacked-accordion-per-day list. */}
          {currentDay && (
            <Card style={{marginBottom:16,padding:"16px 20px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {dayGroups.length>1 && <button className="day-nav-arrow" onClick={()=>goToDay(-1)} style={{background:"none",border:"1px solid "+S.border,color:S.text,cursor:"pointer",width:30,height:30,borderRadius:"50%",fontSize:14}}>‹</button>}
                  <div key={currentDay.day} className="day-label-swap" style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22}}>{currentDay.label}</div>
                  {dayGroups.length>1 && <button className="day-nav-arrow" onClick={()=>goToDay(1)} style={{background:"none",border:"1px solid "+S.border,color:S.text,cursor:"pointer",width:30,height:30,borderRadius:"50%",fontSize:14}}>›</button>}
                </div>
                <div style={{fontSize:12,color:S.muted}}>{dayDoneCount} of {dayTotal} exercises · {dayPct}%</div>
              </div>
              <div style={{height:6,background:S.surface2,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:dayPct+"%",background:S.accent,transition:"width .3s"}}/>
              </div>
            </Card>
          )}

          {/* Horizontally scrollable exercise selector — numbered pills with
              a category mannequin icon, current one highlighted. */}
          {currentDay && (
            <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8,marginBottom:20}}>
              {dayItems.map((item,i)=>{
                const isSel = item.members.some(m=>m.id===selected);
                const isGroup = item.members.length>1;
                const label = item.members.map(m=>m.name).join(" + ");
                return (
                  <button key={item.id} onClick={()=>setSelected(item.id)}
                    style={{flexShrink:0,width:isGroup?110:84,display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"10px 8px",cursor:"pointer",position:"relative",
                      border:"1px solid "+(isSel?S.accent:S.border),background:isSel?"rgba(255,106,0,.08)":S.surface,borderRadius:10}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:isSel?S.accent:S.surface2,color:isSel?"white":S.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{i+1}</div>
                    {isGroup
                      ? <div style={{display:"flex",gap:2}}>
                          {item.members.slice(0,2).map(m=><WorkoutMannequin key={m.id} exerciseName={m.name} size={26} color={isSel?S.accent:S.muted}/>)}
                        </div>
                      : <WorkoutMannequin exerciseName={item.members[0].name} size={32} color={isSel?S.accent:S.muted}/>}
                    <div style={{fontSize:10,fontWeight:600,color:isSel?S.accent:S.text,textAlign:"center",lineHeight:1.2,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{label}</div>
                    {isGroup && <span style={{position:"absolute",top:4,right:4,fontSize:8,fontWeight:700,color:S.accent2}}>{BLOCK_TYPE_SHORT[item.blockType]}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {selectedEx&&(
            <div className="workout-main-grid" style={{display:"grid",gridTemplateColumns: isMobile?"1fr":"1fr 300px",gap:20,alignItems:"start",marginBottom:20}}>
              <div style={{minWidth:0}}>
                {/* Action-center exercise card: name, day/type, target
                    sets/reps + mannequin, then the always-visible set
                    tracker with a big "Log Set" action. */}
                <Card style={{marginBottom:20}}>
                  {blockType==="straight_set" ? (
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap",marginBottom:16}}>
                      <div style={{flex:1,minWidth:180}}>
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24}}>{selectedEx.name}</div>
                        <div style={{fontSize:12,color:S.muted}}>{[dayLabelOf[selectedEx.id],selectedEx.category].filter(Boolean).join(" · ")||"Unscheduled"}{selectedEx.is_bodyweight?" · bodyweight":""}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:20}}>
                        <div style={{display:"flex",gap:20}}>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:4}}>Target Sets</div>
                            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28}}>{selectedEx.sets??"—"}</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:4}}>Target Reps</div>
                            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28}}>{selectedEx.reps??"—"}</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:4}}>Best Lift</div>
                            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:bestSet?S.accent2:S.text}}>
                              {bestSet ? (selectedEx.is_bodyweight ? `${bestSet.reps} reps` : `${bestSet.weight}${bestSet.reps?` × ${bestSet.reps}`:""}`) : "—"}
                            </div>
                          </div>
                        </div>
                        <WorkoutMannequin exerciseName={selectedEx.name} size={64} color={S.accent}/>
                      </div>
                    </div>
                  ) : (
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap",marginBottom:16}}>
                      <div style={{flex:1,minWidth:180}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24}}>{groupMembers.map(m=>m.name).join(" + ")}</div>
                          <span style={{fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:S.accent2,border:"1px solid "+S.accent2,borderRadius:4,padding:"2px 6px"}}>{BLOCK_TYPE_LABEL[blockType]}</span>
                        </div>
                        <div style={{fontSize:12,color:S.muted}}>{dayLabelOf[selectedEx.id]||"Unscheduled"}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:16}}>
                        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                          {groupMembers.map(m=>(
                            <div key={m.id} style={{textAlign:"center"}}>
                              <div style={{fontSize:10,fontWeight:600,color:S.text,marginBottom:4,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{m.sets??"—"}<span style={{fontSize:12,color:S.muted}}> × </span>{m.reps??"—"}</div>
                            </div>
                          ))}
                        </div>
                        <WorkoutMannequin exerciseName={groupMembers[0]?.name} size={56} color={S.accent}/>
                      </div>
                    </div>
                  )}
                  {isMobile && selectedEx.notes && (
                    <div style={{fontSize:12,color:S.muted,marginBottom:16,lineHeight:1.6,background:S.surface2,border:"1px solid "+S.border,padding:"10px 14px"}}>
                      <span style={{color:S.accent,fontWeight:700,textTransform:"uppercase",fontSize:9,letterSpacing:1}}>Coaching Cue&nbsp;</span>{selectedEx.notes}
                    </div>
                  )}

                  {blockType==="straight_set" ? (
                    <>
                      <div style={{marginBottom:14}}>
                        {sets.map((s,i)=>{
                          const isLogged = loggedSetNums.has(i+1);
                          return (
                            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<sets.length-1?"1px solid "+S.border:"none",flexWrap:"wrap"}}>
                              <span style={{fontSize:12,color:S.muted,width:44}}>Set {i+1}</span>
                              {!selectedEx.is_bodyweight && (
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <button onClick={()=>setStepper(i,"weight",-1)} style={{width:26,height:26,background:S.surface2,border:"1px solid "+S.border,color:S.text,cursor:"pointer"}}>−</button>
                                  <input type="number" placeholder="lbs" value={s.weight} onChange={e=>{const n=[...sets];n[i].weight=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"7px 6px",fontSize:13,width:56,textAlign:"center",outline:"none"}}/>
                                  <button onClick={()=>setStepper(i,"weight",1)} style={{width:26,height:26,background:S.surface2,border:"1px solid "+S.border,color:S.text,cursor:"pointer"}}>+</button>
                                </div>
                              )}
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <button onClick={()=>setStepper(i,"reps",-1)} style={{width:26,height:26,background:S.surface2,border:"1px solid "+S.border,color:S.text,cursor:"pointer"}}>−</button>
                                <input type="number" placeholder="reps" value={s.reps} onChange={e=>{const n=[...sets];n[i].reps=e.target.value;setSets(n);}} style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"7px 6px",fontSize:13,width:56,textAlign:"center",outline:"none"}}/>
                                <button onClick={()=>setStepper(i,"reps",1)} style={{width:26,height:26,background:S.surface2,border:"1px solid "+S.border,color:S.text,cursor:"pointer"}}>+</button>
                              </div>
                              <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:"auto",
                                background:isLogged?S.accent2:"transparent",border:isLogged?"none":"1px solid "+S.border,color:isLogged?"#0B0B0D":S.border,fontSize:13,fontWeight:700}}>
                                {isLogged?"✓":""}
                              </div>
                              {sets.length>1&&<button onClick={()=>setSets(sets.filter((_,j)=>j!==i))} title="Remove set" style={{background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px"}}>×</button>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <Btn onClick={handleLog} disabled={saving}>{saving?"Saving...":"LOG SET"}</Btn>
                        <button onClick={()=>setSets([...sets,blankRow()])} style={{background:"none",border:"1px solid "+S.border,color:S.text,padding:"10px 14px",fontSize:10,fontWeight:600,cursor:"pointer",textTransform:"uppercase",letterSpacing:"1px"}}>+ Add Set</button>
                      </div>
                    </>
                  ) : (
                    <div style={{padding:16,background:S.surface2,border:"1px solid "+S.border}}>
                      <div style={{fontSize:11,color:S.muted,marginBottom:14}}>Log each round for both exercises below</div>
                      {rounds.map((round,i)=>{
                        const roundLogged = loggedRoundNums.has(i+1);
                        return (
                        <div key={i} style={{marginBottom:14,paddingBottom:14,borderBottom:i<rounds.length-1?"1px solid "+S.border:"none"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <span style={{fontSize:11,color:S.muted}}>Round {i+1}</span>
                            <div style={{width:18,height:18,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                              background:roundLogged?S.accent2:"transparent",border:roundLogged?"none":"1px solid "+S.border,color:roundLogged?"#0B0B0D":S.border,fontSize:11,fontWeight:700}}>
                              {roundLogged?"✓":""}
                            </div>
                          </div>
                          {blockType==="circuit_for_time" ? (
                            <input type="text" placeholder="total time (e.g. 8:45)" value={round.time}
                              onChange={e=>{const n=[...rounds];n[i]={...n[i],time:e.target.value};setRounds(n);}}
                              style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:180,outline:"none"}}/>
                          ) : (
                            <div style={{display:"flex",flexDirection:"column",gap:8}}>
                              {groupMembers.map(m=>(
                                <div key={m.id} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                                  <span style={{fontSize:12,color:S.text,width:140}}>{m.name}</span>
                                  {blockType!=="timed_circuit"&&!m.is_bodyweight&&(
                                    <input type="number" placeholder="lbs" value={round.perExercise[m.id]?.weight||""}
                                      onChange={e=>{const n=[...rounds];n[i]={...n[i],perExercise:{...n[i].perExercise,[m.id]:{...n[i].perExercise[m.id],weight:e.target.value}}};setRounds(n);}}
                                      style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:80,outline:"none"}}/>
                                  )}
                                  {blockType==="superset"&&(
                                    <input type="number" placeholder="reps" value={round.perExercise[m.id]?.reps||""}
                                      onChange={e=>{const n=[...rounds];n[i]={...n[i],perExercise:{...n[i].perExercise,[m.id]:{...n[i].perExercise[m.id],reps:e.target.value}}};setRounds(n);}}
                                      style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:80,outline:"none"}}/>
                                  )}
                                  {(blockType==="timed_circuit"||blockType==="weighted_circuit")&&(
                                    <input type="text" placeholder="time" value={round.perExercise[m.id]?.time||""}
                                      onChange={e=>{const n=[...rounds];n[i]={...n[i],perExercise:{...n[i].perExercise,[m.id]:{...n[i].perExercise[m.id],time:e.target.value}}};setRounds(n);}}
                                      style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:90,outline:"none"}}/>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {blockType!=="circuit_for_time"&&(
                            <div style={{marginTop:8}}>
                              <input type="text" placeholder="rest after this round (e.g. 90s)" value={round.rest}
                                onChange={e=>{const n=[...rounds];n[i]={...n[i],rest:e.target.value};setRounds(n);}}
                                style={{background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:13,width:240,outline:"none"}}/>
                            </div>
                          )}
                        </div>
                        );
                      })}
                      <div style={{display:"flex",gap:10,marginTop:14,alignItems:"center"}}>
                        <Btn onClick={handleLogGroup} disabled={saving}>{saving?"Saving...":"Save Session"}</Btn>
                        <button onClick={()=>setRounds([...rounds,blankRound(groupMembers)])} style={{background:"none",border:"1px solid "+S.border,color:S.text,padding:"8px 14px",fontSize:10,fontWeight:600,cursor:"pointer",textTransform:"uppercase",letterSpacing:"1px"}}>+ Add Round</button>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Compact progress preview — two small chart cards side by
                    side, with a "View full progress" link to the Progress →
                    Strength tab. Session-level history lives there, not here
                    — keeping the logging screen focused on entering today's
                    sets. */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:isMobile?10:20,marginBottom:12}}>
                  <WeightOverTimeChart chartData={chartData} isBodyweight={selectedEx.is_bodyweight} compact={isMobile}/>
                  <TopSetRepsChart chartData={chartData} targetRange={targetRange} compact={isMobile}/>
                </div>
                {setPage && (
                  <div onClick={()=>setPage("progress")} style={{textAlign:"center",fontSize:12,fontWeight:600,color:S.accent,cursor:"pointer",marginBottom:20}}>View full progress →</div>
                )}
              </div>

              {/* Desktop-only right column: Today's Workout, Rest Timer,
                  Coaching Cue — fills the space beside the exercise card
                  instead of leaving it empty. */}
              {!isMobile && (
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <Card style={{marginBottom:0}}>
                    <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:14}}>Today's Workout</div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}><span style={{color:S.muted}}>Exercises</span><span>{dayDoneCount} of {dayTotal} completed</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:S.muted}}>Sets Logged Today</span><span>{loggedSetNums.size} of {selectedEx.sets??"—"}</span></div>
                  </Card>
                  <RestTimer/>
                  {selectedEx.notes && (
                    <Card style={{marginBottom:0}}>
                      <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:12}}>Coaching Cue</div>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}>
                        <WorkoutMannequin exerciseName={selectedEx.name} size={40} color={S.muted}/>
                        <div style={{fontSize:13,color:S.text,lineHeight:1.6}}>{selectedEx.notes}</div>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Raw log review, separate from the trend graphs above (which
              stay scoped to whichever exercise is currently selected for
              logging) — a closed-by-default dropdown per day so the client
              can review any day's full history without it turning the page
              into a never-ending list. */}
          <ClientWorkoutReview profile={profile}/>
        </>
      )}
    </div>
  );
}

// CoachHome now lives in src/features/coachDashboard/CoachHome.jsx.
// ClientsPanel and CoachProgress were merged into ClientDetailPage
// (src/features/clientDetail/ClientDetailPage.jsx) — one unified page instead
// of two separate nav tabs with independent client-selection state.

// ---------------------------------------------------------------------------
// COACH — BUSINESS + CONTENT METRICS DASHBOARD (daily entry -> weekly rollup)
// In-app only, no live Notion pull (matches the CRM's one-time-backfill
// approach) -- excludes Fitness/Discipline by design (Business+Content only).
// ---------------------------------------------------------------------------
// Real weekly goals: DMs 120, Sales Conversations 15-20, Calls Booked 3-4,
// Revenue $500-1200 — the low end of each range is the target (hitting it
// reads "On Track"; anything above naturally reads "Ahead"). Clients Closed
// has no set goal yet, kept at the prior placeholder of 2/week.
const WEEKLY_TARGETS = { dms_sent: 120, sales_conversations: 15, calls_booked: 3, clients_closed: 2, revenue_today: 500 };
// `daysElapsed` scales the target down for a week still in progress (1-7) —
// without this, a week with only today's entry compares 1 day of activity
// against the FULL weekly target and always reads "Behind", even seconds
// after a perfectly-on-pace first entry. Completed weeks pass daysElapsed=7
// (the full target, unscaled).
function weekStatus(total, target, daysElapsed = 7) {
  if (!target) return null;
  const paceTarget = target * (clamp01(daysElapsed / 7));
  if (paceTarget <= 0) return null; // day 0 of a new week — nothing to compare yet
  const pct = total / paceTarget;
  return pct >= 1.1 ? "Ahead" : pct >= 0.9 ? "On Track" : pct >= 0.5 ? "Behind" : "Red Flag";
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function isoWeekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + ((day === 0 ? -6 : 1) - day));
  return d.toISOString().split("T")[0];
}

// Additive metrics: each save ADDS the entered amount to today's running
// total (not an absolute overwrite), then the input clears — so you log
// "sent 4 more DMs" as you go through the day instead of having to re-enter
// the full day's total each time. Active Clients + the content checkboxes
// are current-state snapshots, not activity counts, so they stay absolute.
const BLANK_ADDS = { dms_sent: "", sales_conversations: "", calls_booked: "", clients_closed: "", revenue_today: "" };

function MetricsDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayRow, setTodayRow] = useState(null);
  const [adds, setAdds] = useState(BLANK_ADDS);
  const [snapshot, setSnapshot] = useState({ active_clients: "", content_posted: false, content_created: false, content_recorded: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dateStr = todayStr();

  // Refreshes the rollup/trend rows only — never touches the add-inputs or
  // the snapshot fields. saveToday() relies on this: a refetch after save
  // racing further typing was the bug fixed here previously (same class as
  // 7f744a3 for the client check-in forms) — now there's nothing left for a
  // background refetch to clobber, since `adds` always resets to blank
  // right after its own save completes, not from a fetch.
  const loadRows = useCallback(async () => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const { data } = await supabase.from("daily_metrics").select("*").gte("date", cutoff.toISOString().split("T")[0]).order("date");
    setRows(data || []);
    return data || [];
  }, []);
  useEffect(() => {
    (async () => {
      const data = await loadRows();
      const t = data.find((r) => r.date === dateStr) || null;
      setTodayRow(t);
      setSnapshot({
        active_clients: t?.active_clients ?? "",
        content_posted: !!t?.content_posted,
        content_created: !!t?.content_created,
        content_recorded: !!t?.content_recorded,
      });
      setLoading(false);
    })();
  }, [loadRows, dateStr]);

  const setAdd = (k, v) => setAdds((p) => ({ ...p, [k]: v }));
  const setSnap = (k, v) => setSnapshot((p) => ({ ...p, [k]: v }));

  const saveToday = async () => {
    setSaving(true);
    const payload = {
      date: dateStr,
      dms_sent: (todayRow?.dms_sent || 0) + (parseInt(adds.dms_sent) || 0),
      sales_conversations: (todayRow?.sales_conversations || 0) + (parseInt(adds.sales_conversations) || 0),
      calls_booked: (todayRow?.calls_booked || 0) + (parseInt(adds.calls_booked) || 0),
      clients_closed: (todayRow?.clients_closed || 0) + (parseInt(adds.clients_closed) || 0),
      revenue_today: (todayRow?.revenue_today || 0) + (parseFloat(adds.revenue_today) || 0),
      active_clients: snapshot.active_clients === "" ? null : parseInt(snapshot.active_clients),
      content_posted: !!snapshot.content_posted,
      content_created: !!snapshot.content_created,
      content_recorded: !!snapshot.content_recorded,
    };
    const { data } = await supabase.from("daily_metrics").upsert(payload, { onConflict: "date" }).select().maybeSingle();
    setTodayRow(data || payload);
    setAdds(BLANK_ADDS);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    loadRows();
  };

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const byWeek = {};
  rows.forEach((r) => { const wk = isoWeekStart(r.date); (byWeek[wk] = byWeek[wk] || []).push(r); });
  const weeks = Object.keys(byWeek).sort().reverse().slice(0, 8);
  const sum = (list, key) => list.reduce((a, r) => a + (Number(r[key]) || 0), 0);
  const METRIC_KEYS = ["dms_sent", "sales_conversations", "calls_booked", "clients_closed", "revenue_today"];
  const METRIC_LABEL = { dms_sent: "DMs Sent", sales_conversations: "Sales Conversations", calls_booked: "Calls Booked", clients_closed: "Clients Closed", revenue_today: "Revenue" };
  const METRIC_ICON = { dms_sent: "💬", sales_conversations: "🗣", calls_booked: "📞", clients_closed: "🤝", revenue_today: "💰" };
  const METRIC_COLOR = { dms_sent: "#3B82F6", sales_conversations: "#8B5CF6", calls_booked: "#F59E0B", clients_closed: S.accent2, revenue_today: S.accent };
  const currentWeekStart = isoWeekStart(dateStr);
  // How many days of the current week have actually happened (Monday=1 .. Sunday=7),
  // so a week that just started isn't judged against the full 7-day target.
  const daysElapsedThisWeek = Math.floor((new Date(dateStr) - new Date(currentWeekStart)) / 86400000) + 1;
  const daysElapsedFor = (wk) => (wk === currentWeekStart ? daysElapsedThisWeek : 7);
  // Oldest -> newest for a left-to-right trend chart, matching the Progress page.
  const trendData = [...weeks].reverse().map((wk) => {
    const list = byWeek[wk];
    const point = { week: wk };
    METRIC_KEYS.forEach((k) => { point[k] = sum(list, k); });
    return point;
  });
  // "Behind" is a routine under-target week (50-90% of pace) — it used to
  // share the same coral/danger tint as "Red Flag" (just softer), which made
  // coral read as the default "not hitting the number" color instead of
  // something reserved for weeks that actually need attention. Only "Red
  // Flag" (under 50% of pace) keeps coral now; "Behind" gets the same
  // neutral amber treatment as every other lower-emphasis flag in the app.
  const badge = (status) => !status ? null : (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "3px 8px", marginLeft: 6,
      background: status === "Ahead" ? "rgba(0,201,167,.14)" : status === "On Track" ? "rgba(198,255,0,.14)" : status === "Red Flag" ? S.danger : "rgba(250,204,21,.14)",
      color: status === "Ahead" ? S.accent2 : status === "On Track" ? S.neon : status === "Red Flag" ? "white" : S.warning }}>{status}</span>
  );

  return (
    <div>
      <PageTitle title="Business + Content" sub="Daily outreach and content metrics, rolled up weekly" />
      <Card>
        <CardTitle>Today · {dateStr}</CardTitle>
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>Enter what you did since your last save — it adds to today's total below, then clears so you can log the next batch.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 16 }}>
          {METRIC_KEYS.map((k) => (
            <div key={k} style={{ border: "1px solid " + S.border, borderTop: "3px solid " + METRIC_COLOR[k], borderRadius: 10, padding: "12px 14px", background: S.surface }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>
                <span>{METRIC_ICON[k]}</span>{METRIC_LABEL[k]}
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: S.text, marginBottom: 8 }}>
                {k === "revenue_today" ? "$" + (todayRow?.[k] || 0) : (todayRow?.[k] || 0)}
                <span style={{ fontSize: 10, color: S.muted, fontFamily: "inherit", letterSpacing: 0.5, textTransform: "uppercase" }}> today</span>
              </div>
              <Inp type="number" value={adds[k]} onChange={(e) => setAdd(k, e.target.value)} placeholder="Add..." />
            </div>
          ))}
          <div style={{ border: "1px solid " + S.border, borderTop: "3px solid " + S.muted, borderRadius: 10, padding: "12px 14px", background: S.surface }}>
            <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>👥 Active Clients</div>
            <div style={{ fontSize: 11, color: S.muted, marginBottom: 8 }}>Current count, not an add</div>
            <Inp type="number" value={snapshot.active_clients} onChange={(e) => setSnap("active_clients", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
          {[["content_posted", "Content Posted"], ["content_created", "Content Created"], ["content_recorded", "Content Recorded"]].map(([k, label]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={!!snapshot[k]} onChange={(e) => setSnap(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Btn onClick={saveToday} disabled={saving}>{saving ? "Saving..." : "Add to Today"}</Btn>
          {saved && <span style={{ color: S.accent2, fontSize: 12, fontWeight: 600 }}>Saved!</span>}
        </div>
      </Card>
      <Card>
        <CardTitle>Weekly Rollup</CardTitle>
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 16 }}>Ahead / On Track / Behind / Red Flag, based on pace toward the weekly target for each metric.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {weeks.map((wk) => {
            const list = byWeek[wk];
            return (
              <div key={wk} style={{ border: "1px solid " + S.border, borderRadius: 10, padding: "14px 16px", background: wk === currentWeekStart ? "rgba(255,106,0,.04)" : S.surface }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: S.text, marginBottom: 10 }}>
                  Week of {wk}
                  {wk === currentWeekStart && <span style={{ fontSize: 10, fontWeight: 600, color: S.accent, marginLeft: 8 }}>IN PROGRESS · DAY {daysElapsedThisWeek}/7</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 14 }}>
                  {METRIC_KEYS.map((k) => {
                    const total = sum(list, k);
                    return (
                      <div key={k} style={{ borderLeft: "2px solid " + METRIC_COLOR[k], paddingLeft: 10 }}>
                        <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: S.muted, marginBottom: 3 }}>{METRIC_LABEL[k]}</div>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: S.text, whiteSpace: "nowrap" }}>
                          {k === "revenue_today" ? `$${total.toFixed(0)}` : total}
                        </div>
                        <div style={{ marginTop: 3 }}>{badge(weekStatus(total, WEEKLY_TARGETS[k], daysElapsedFor(wk)))}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <CollapsibleSection title="Trends" summary={`last ${trendData.length} weeks`}>
        <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {METRIC_KEYS.map((k) => (
            <CC key={k} title={METRIC_LABEL[k]} sub="Weekly total · dashed = target">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} />
                  <Tooltip {...TT} formatter={(v) => [k === "revenue_today" ? `$${v}` : v, METRIC_LABEL[k]]} />
                  <ReferenceLine y={WEEKLY_TARGETS[k]} stroke={S.muted} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey={k} stroke={S.accent} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CC>
          ))}
        </div>
      </CollapsibleSection>
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
          color:msg.ok?S.accent2:S.danger}}>
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
        <Card style={{textAlign:"center",padding:40,color:S.muted}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:S.text,marginBottom:6}}>No templates yet</div>
          <div style={{fontSize:13,marginBottom:16}}>Create your first template to standardize your training blueprints.</div>
          <Btn teal onClick={startNew}>+ New Template</Btn>
        </Card>
      )}

      {templates.length>0 && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {["All",...TEMPLATE_CATEGORIES].map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)}
              style={{padding:"5px 12px",fontSize:10,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",border:"1px solid "+(catFilter===c?S.accent:S.border),background:catFilter===c?"rgba(255,106,0,.08)":"transparent",color:catFilter===c?S.accent:S.muted}}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Grid instead of a stacked single-column list — the description +
          structure blueprint text (which can run long) is dropped from the
          card face; it's still fully editable via Edit, and duplicate/edit/
          delete no longer eat a whole column of vertical button stack. */}
      <div className="templates-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:18}}>
        {templates.filter(t=>catFilter==="All"||(t.category||"General")===catFilter).map(t=>(
          <TemplateCard key={t.id} t={t} onDuplicate={duplicate} onEdit={startEdit} onDelete={remove}/>
        ))}
      </div>
    </div>
  );
}

const TEMPLATE_CATEGORY_STYLE = {
  Hybrid: { icon: "⚡", color: "#F59E0B" }, "Fat Loss": { icon: "🔥", color: "#EF4444" },
  Muscle: { icon: "💪", color: "#8B5CF6" }, Strength: { icon: "🏋", color: "#3B82F6" },
  Athletic: { icon: "🏆", color: "#00C9A7" }, Beginner: { icon: "👑", color: "#FF6A00" },
  Home: { icon: "🏠", color: "#22C55E" }, General: { icon: "📋", color: "#A1A1AA" },
};

function TemplateCard({ t, onDuplicate, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const style = TEMPLATE_CATEGORY_STYLE[t.category] || TEMPLATE_CATEGORY_STYLE.General;
  return (
    <Card style={{ display:"flex", flexDirection:"column", height:"100%", position:"relative" }}>
      <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:12}}>
        <div style={{width:44,height:44,borderRadius:"50%",flexShrink:0,background:style.color+"26",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{style.icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,lineHeight:1.2}}>{t.name}</div>
          <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11,letterSpacing:1,textTransform:"uppercase",color:style.color,marginTop:4,flexWrap:"wrap"}}>
            <span>{t.category||"General"}</span>
            {t.days_per_week && <span style={{color:S.muted,textTransform:"none",letterSpacing:0}}>· {t.days_per_week} days/week</span>}
            {t.is_builtin && <span style={{color:S.muted,textTransform:"none",letterSpacing:0}}>· Built-in</span>}
          </div>
        </div>
        {!t.is_builtin && (
          <div style={{position:"relative",flexShrink:0}}>
            <button onClick={()=>setMenuOpen(o=>!o)} title="More actions" aria-label="More actions"
              style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:"transparent",border:"none",color:S.muted,fontSize:16}}>⋮</button>
            {menuOpen && (
              <div style={{position:"absolute",right:0,top:28,zIndex:10,background:S.surface,border:"1px solid "+S.border,borderRadius:8,overflow:"hidden",minWidth:110,boxShadow:"0 8px 20px rgba(0,0,0,.35)"}}>
                <button onClick={()=>{setMenuOpen(false);onEdit(t);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 14px",fontSize:12,fontWeight:600,background:"transparent",border:"none",color:S.text,cursor:"pointer"}}>Edit</button>
                <button onClick={()=>{setMenuOpen(false);onDelete(t);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 14px",fontSize:12,fontWeight:600,background:"transparent",border:"none",color:S.danger,cursor:"pointer"}}>Delete</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{fontSize:13.5,color:S.muted,lineHeight:1.6,flex:1,marginBottom:16}}>
        {t.description || (t.goal ? `Goal: ${t.goal}` : "No description yet.")}
      </div>
      <Btn sm teal onClick={()=>onDuplicate(t)}>📄 Duplicate</Btn>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// COACH — ONBOARDING ASSESSMENTS (pre-assess a client before building a program)
// ---------------------------------------------------------------------------
// Coach-only, keyed by email so it can be filled before the client signs up. On
// signup the coach matches it by email; the program generator folds it into the
// prompt. Never visible to the client.
const ASSESSMENT_TEXT = [
  ["strengths", "Strengths", "What they already do well — movement quality, work ethic, strong lifts, consistency."],
  ["weaknesses", "Weaknesses / Limitations", "Weak points, imbalances, mobility gaps, conditioning gaps."],
  ["injuries", "Injuries & Health Notes", "Current or past injuries, pain, medical flags to program around."],
  ["training_history", "Training History", "Experience, past programs, what's worked and what hasn't."],
  ["recovery_lifestyle", "Recovery & Lifestyle", "Sleep, stress, job demands, nutrition habits, schedule."],
  ["goal_focus", "Goal & Focus", "Primary goal, timeline, what success looks like for them."],
  ["notes", "Coach Notes", "Anything else worth capturing at onboarding."],
];
const BLANK_ASSESSMENT = { email:"", nervous_system_recruitment:5, muscular_density_to_size:5, metabolic_work_capacity:5, strengths:"", weaknesses:"", injuries:"", training_history:"", recovery_lifestyle:"", goal_focus:"", notes:"" };

function AssessmentsPanel() {
  const isMobile = useIsMobile();
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // null | "new" | email
  const [form, setForm] = useState(BLANK_ASSESSMENT);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async()=>{
    const [{data:a},{data:p}] = await Promise.all([
      supabase.from("client_assessments").select("*").order("updated_at",{ascending:false}),
      supabase.from("profiles").select("email,name").neq("role","coach"),
    ]);
    setItems(a||[]); setProfiles(p||[]); setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const startNew = ()=>{ setEditing("new"); setForm(BLANK_ASSESSMENT); setMsg(null); };
  const startEdit = (a)=>{ setEditing(a.email); setForm({...BLANK_ASSESSMENT,...a}); setMsg(null); };
  const cancel = ()=>{ setEditing(null); setForm(BLANK_ASSESSMENT); };

  const save = async()=>{
    const email = form.email.trim().toLowerCase();
    if(!email){ setMsg({ok:false,text:"Client email is required."}); return; }
    setSaving(true); setMsg(null);
    const payload = {
      email,
      nervous_system_recruitment: form.nervous_system_recruitment,
      muscular_density_to_size: form.muscular_density_to_size,
      metabolic_work_capacity: form.metabolic_work_capacity,
      updated_at: new Date().toISOString(),
    };
    ASSESSMENT_TEXT.forEach(([k])=>{ payload[k] = (form[k]||"").trim() || null; });
    const {error} = await supabase.from("client_assessments").upsert(payload,{onConflict:"email"});
    setSaving(false);
    if(error){ setMsg({ok:false,text:error.message}); return; }
    setMsg({ok:true,text:"Assessment saved."}); setEditing(null); setForm(BLANK_ASSESSMENT); await load();
  };
  const remove = async(a)=>{
    if(!window.confirm(`Delete assessment for ${a.email}?`)) return;
    await supabase.from("client_assessments").delete().eq("email",a.email);
    if(editing===a.email) cancel();
    await load();
  };

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;
  const nameFor = (email)=> profiles.find(p=>(p.email||"").toLowerCase()===(email||"").toLowerCase())?.name;
  const signedUp = (email)=> profiles.some(p=>(p.email||"").toLowerCase()===(email||"").toLowerCase());
  const taStyle = {width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"10px 12px",fontSize:14,outline:"none",resize:"vertical"};

  return (
    <div>
      <PageTitle title="Assessments" sub="Pre-assess a client before you build their program — coach-only, saved by email"/>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <Btn teal onClick={startNew}>+ New Assessment</Btn>
      </div>
      {msg && <div style={{marginBottom:16,padding:"10px 16px",fontSize:12,fontWeight:600,background:msg.ok?"rgba(0,201,167,.14)":"rgba(192,57,43,.16)",color:msg.ok?S.accent2:S.danger}}>{msg.text}</div>}
      {editing && (
        <Card>
          <CardTitle>{editing==="new"?"New Assessment":"Edit Assessment"}</CardTitle>
          <Fld label="Client Email"><Inp type="email" value={form.email} disabled={editing!=="new"} onChange={e=>set("email",e.target.value)} placeholder="client@email.com"/></Fld>
          <div style={{fontSize:11,color:S.muted,marginBottom:16}}>Use the email they'll sign up with. Once they join, this shows on their client page and feeds the AI program generator.</div>
          <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,margin:"6px 2px 10px"}}>V12 Three-System Scores</div>
          <Sld label="Nervous System Recruitment" val={form.nervous_system_recruitment} min={1} max={10} onChange={v=>set("nervous_system_recruitment",v)}/>
          <Sld label="Muscular Density-to-Size" val={form.muscular_density_to_size} min={1} max={10} onChange={v=>set("muscular_density_to_size",v)}/>
          <Sld label="Metabolic Work Capacity" val={form.metabolic_work_capacity} min={1} max={10} onChange={v=>set("metabolic_work_capacity",v)}/>
          <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,margin:"16px 2px 10px"}}>Onboarding Notes</div>
          {ASSESSMENT_TEXT.map(([k,label,ph])=>(
            <Fld key={k} label={label}><textarea rows={2} value={form[k]||""} onChange={e=>set(k,e.target.value)} placeholder={ph} style={taStyle}/></Fld>
          ))}
          <div style={{display:"flex",gap:10,marginTop:8}}>
            <Btn onClick={save} disabled={saving}>{saving?"Saving...":"Save Assessment"}</Btn>
            <button onClick={cancel} style={{padding:"10px 20px",fontSize:12,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>Cancel</button>
          </div>
        </Card>
      )}
      {items.length===0 && !editing && <Card style={{textAlign:"center",padding:40,color:S.muted}}>No assessments yet. Create one before you generate a program.</Card>}
      {items.length>0 && (()=>{
        const draftCount = items.filter(a=>!signedUp(a.email)).length;
        const signedCount = items.length - draftCount;
        const pct = (n) => items.length ? Math.round((n/items.length)*100) : 0;
        const filtered = items.filter(a=>{
          if(statusFilter==="signed_up" && !signedUp(a.email)) return false;
          if(statusFilter==="draft" && signedUp(a.email)) return false;
          const q = query.trim().toLowerCase();
          if(!q) return true;
          return (nameFor(a.email)||"").toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
        });
        return (
          <>
            <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
              <MetricCard icon="📋" label="Total Assessments" value={items.length} unit=""/>
              <MetricCard icon="👥" label="Signed Up" value={signedCount} unit="" trend={{text:`${pct(signedCount)}% of total`,tone:"neutral"}}/>
              <MetricCard icon="✎" label="Drafts" value={draftCount} unit="" trend={{text:`${pct(draftCount)}% of total`,tone:"neutral"}}/>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search clients..."
                style={{flex:1,minWidth:200,background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"10px 14px",fontSize:13,outline:"none",borderRadius:8}}/>
              <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                style={{background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"10px 14px",fontSize:13,outline:"none",borderRadius:8}}>
                <option value="all">All Status</option>
                <option value="signed_up">Signed Up</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            {filtered.length===0 ? (
              <Card style={{textAlign:"center",padding:32,color:S.muted}}>No assessments match.</Card>
            ) : isMobile ? (
              filtered.map(a=>(
                <Card key={a.email}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18}}>{nameFor(a.email)||a.email}</div>
                    <StatusBadge label={signedUp(a.email)?"Signed Up":"Draft"} tone={signedUp(a.email)?"green":"accent"}/>
                  </div>
                  <div style={{fontSize:12,color:S.muted,marginBottom:8}}>NS {a.nervous_system_recruitment??"—"} · MD {a.muscular_density_to_size??"—"} · MC {a.metabolic_work_capacity??"—"}</div>
                  {a.strengths && <div style={{fontSize:12,color:S.muted,marginBottom:4,lineHeight:1.6}}><b style={{color:S.text}}>Strengths:</b> {a.strengths}</div>}
                  {a.weaknesses && <div style={{fontSize:12,color:S.muted,marginBottom:10,lineHeight:1.6}}><b style={{color:S.text}}>Weaknesses:</b> {a.weaknesses}</div>}
                  <div style={{display:"flex",gap:8}}>
                    <Btn sm teal onClick={()=>startEdit(a)}>Edit</Btn>
                    <Btn sm danger onClick={()=>remove(a)}>Delete</Btn>
                  </div>
                </Card>
              ))
            ) : (
              <Card>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}>
                    <thead>
                      <tr>
                        {["Client","Status","Score Summary","Strengths","Weaknesses","Actions"].map(h=>(
                          <th key={h} style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,textAlign:"left",padding:"8px 12px",borderBottom:"1px solid "+S.border}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(a=>(
                        <tr key={a.email}>
                          <td style={{padding:"16px",borderBottom:"1px solid "+S.border}}>
                            <div style={{fontSize:14,fontWeight:600,color:S.text}}>{nameFor(a.email)||a.email}</div>
                            <div style={{fontSize:12,color:S.muted}}>{a.email}</div>
                          </td>
                          <td style={{padding:"16px",borderBottom:"1px solid "+S.border}}>
                            <StatusBadge label={signedUp(a.email)?"Signed Up":"Draft"} tone={signedUp(a.email)?"green":"accent"}/>
                          </td>
                          <td style={{padding:"16px",fontSize:13,color:S.muted,borderBottom:"1px solid "+S.border,whiteSpace:"nowrap"}}>
                            NS {a.nervous_system_recruitment??"—"} · MD {a.muscular_density_to_size??"—"} · MC {a.metabolic_work_capacity??"—"}
                          </td>
                          <td style={{padding:"16px",fontSize:13,color:S.muted,borderBottom:"1px solid "+S.border,maxWidth:280}}>{a.strengths||"—"}</td>
                          <td style={{padding:"16px",fontSize:13,color:S.muted,borderBottom:"1px solid "+S.border,maxWidth:280}}>{a.weaknesses||"—"}</td>
                          <td style={{padding:"16px",borderBottom:"1px solid "+S.border,whiteSpace:"nowrap"}}>
                            <Btn sm teal onClick={()=>startEdit(a)}>Edit</Btn>{" "}
                            <Btn sm danger onClick={()=>remove(a)}>Delete</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COACH — RESOURCE / RECIPE LIBRARY MANAGEMENT
// ---------------------------------------------------------------------------

const BLANK_RESOURCE = { title:"", category:LIBRARY_FOLDERS[0], kind:"article", url:"", body:"", calories:"", protein_g:"", carbs_g:"", fats_g:"", published:true };

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
    setForm({title:r.title||"",category:r.category||LIBRARY_FOLDERS[0],kind:r.kind||"article",url:r.url||"",body:r.body||"",
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
          background:msg.ok?"rgba(0,201,167,.14)":"rgba(192,57,43,.16)",color:msg.ok?S.accent2:S.danger}}>{msg.text}</div>
      )}
      {editing && (
        <Card>
          <CardTitle>{editing==="new"?"New Resource":"Edit Resource"}</CardTitle>
          <Fld label="Title"><Inp type="text" value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. High-Protein Overnight Oats"/></Fld>
          <Fld label="Folder"><RG options={LIBRARY_FOLDERS} value={form.category} onChange={v=>set("category",v)}/></Fld>
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
      {(() => {
        // Group by folder so the coach sees the same structure clients browse.
        const known = new Set(LIBRARY_FOLDERS);
        const bucket = (folder) => items.filter(r=>(r.category||"").trim()===folder);
        const other = items.filter(r=>!known.has((r.category||"").trim()));
        const folders = [...LIBRARY_FOLDERS.map(f=>[f,bucket(f)]), ...(other.length?[["Other",other]]:[])];
        return folders.map(([folder,list])=>(
          <DayFolder key={folder} title={folder} meta={`${list.length} item${list.length===1?"":"s"}`}>
            {list.length===0 ? <div style={{color:S.muted,fontSize:13}}>Nothing filed here yet.</div> : list.map(r=>(
              <Card key={r.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{r.title}</div>
                      <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.neon}}>{r.kind}</span>
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
          </DayFolder>
        ));
      })()}
      <RoadmapSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLIENT — TRAINING PLAN (read-only weekly split)
// ---------------------------------------------------------------------------

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
  const [program, setProgram] = useState(null);
  const [phaseHistory, setPhaseHistory] = useState([]);
  const [roadmap, setRoadmap] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("programs")
      .select("id,name,phase,phase_note")
      .eq("client_id", trainingOwnerId(profile))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setProgram(data || null);
        setLoading(false);
        if (data) supabase.from("program_phases").select("*").eq("program_id", data.id).order("order_index")
          .then(({ data: planned }) => setRoadmap(planned || []));
      });
    supabase
      .from("program_phase_history")
      .select("*")
      .eq("client_id", trainingOwnerId(profile))
      .order("changed_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setPhaseHistory(data || []));
  }, [profile.id, profile.shared_program_owner_id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  return (
    <div>
      <PageTitle title="Training Plan" sub="Your current weekly program" />
      {profile.client_type === "program_only"
        ? <UpgradeCTA profile={profile} />
        : <CoachMessage profile={profile} />}
      {profile.client_type === "program_only" && (
        <CollapsibleSection title="Habits">
          <ProgramHabits profile={profile} />
        </CollapsibleSection>
      )}
      <InvoiceCard profile={profile} />
      {program?.phase && (
        <Card style={{ borderLeft: "3px solid " + S.neon }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted }}>Current Phase</span>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: S.neon }}>{program.phase}</span>
          </div>
          {program.phase_note && <div style={{ fontSize: 13, color: S.text, opacity: 0.9, lineHeight: 1.6, marginTop: 6 }}>{program.phase_note}</div>}
          {roadmap.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <ProgramRoadmap phases={roadmap} currentPhase={program.phase} />
            </div>
          )}
          {phaseHistory.length > 0 && (
            <CollapsibleSection title="Phase History" summary={`${phaseHistory.length} change${phaseHistory.length > 1 ? "s" : ""}`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {phaseHistory.map((h) => (
                  <div key={h.id} style={{ fontSize: 12, color: S.text, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ color: S.muted, minWidth: 130 }}>{(h.changed_at || "").slice(0, 16).replace("T", " ")}</span>
                    <span style={{ fontWeight: 600 }}>{h.phase}</span>
                    {h.phase_note && <span style={{ color: S.muted }}>— {h.phase_note}</span>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </Card>
      )}
      <AssessmentBar profile={profile} />
      {/* Same day/exercise navigation coaching clients get on the Workouts
          tab — a swipeable pill selector, not a click-to-expand day table.
          Program-only clients used to see both: this read-only per-day
          table AND the swipeable Workouts UI wrapped in its own "Log Your
          Workouts" accordion below it — two navigation systems stacked on
          one page. Rendering Workouts directly here replaces both. */}
      <Workouts profile={profile} embedded />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLIENT — NUTRITION PLAN
// ---------------------------------------------------------------------------

// Generic goal-based nutrition guide for program-only clients (no coach, no
// personalized AI plan) — including clients who downgraded from coaching.
// Gated purely on client_type, so a downgrade (coach flips the dropdown)
// reverts them to this automatically instead of their old personalized plan.
const GENERIC_NUTRITION_GUIDES = {
  fat_loss: {
    title: "Fat Loss Nutrition Guide",
    body: "Eat in a moderate calorie deficit — roughly 300-500 kcal below maintenance. Prioritize protein at every meal (0.8-1g per lb of bodyweight) to protect muscle while you cut. Fill the rest of your plate with vegetables and whole-food carbs; keep added sugar and liquid calories low. Consistency beats precision here — stay disciplined, and the scale will move.",
  },
  muscle_gain: {
    title: "Muscle Gain Nutrition Guide",
    body: "Eat in a slight calorie surplus — roughly 200-300 kcal above maintenance. Hit 0.8-1g of protein per lb of bodyweight daily, spread across meals. Carbs fuel your training — don't cut them short. Weight gain should be slow and steady; a pound or two a month is the target, not a sprint. Stay disciplined with your intake and the size will follow.",
  },
  general: {
    title: "General Nutrition Guide",
    body: "Eat at roughly your maintenance calories, built around a protein source, a vegetable, and a whole-food carb at each meal. Hit 0.7-0.8g of protein per lb of bodyweight daily. Hydrate consistently and keep processed food to a minimum. This isn't about being perfect — it's about staying disciplined day after day.",
  },
};
function genericGuideFor(goal) {
  const g = (goal || "").toLowerCase();
  if (g.includes("fat") || g.includes("loss") || g.includes("lean") || g.includes("cut")) return GENERIC_NUTRITION_GUIDES.fat_loss;
  if (g.includes("muscle") || g.includes("hypertrophy") || g.includes("gain") || g.includes("bulk")) return GENERIC_NUTRITION_GUIDES.muscle_gain;
  return GENERIC_NUTRITION_GUIDES.general;
}
function GenericNutritionGuide({ profile }) {
  const guide = genericGuideFor(profile.goal);
  return (
    <div>
      <PageTitle title={guide.title} sub="A general guide matched to your goal" />
      <Card>
        <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>{guide.body}</div>
      </Card>
      {/* Logging what you actually ate isn't gated on having a personalized
          plan — program-only clients get this fixed slot list same as
          coaching clients with a plan, just with no calorie target to
          compare against. */}
      <TodaysMealsCard profile={profile} calorieTarget={null} />
    </div>
  );
}

// Fixed universal slots (per the approved mockup), independent of whatever
// meals a coach's AI-generated plan happens to name/count — so logging still
// works with no active plan, or for program-only clients who never get one.
const MEAL_SLOTS = ["Breakfast", "Lunch", "Pre/Post-Workout", "Dinner", "Evening Snack"];

// Shared "Today's Actuals" + "Today's Meals" logging block — used by both the
// coaching Nutrition page (with a real calorie target) and the program-only
// generic guide (no target, just logging). Self-fetching so either caller
// can drop it in without threading meal-log state through.
function TodaysMealsCard({ profile, calorieTarget }) {
  const [mealLogs, setMealLogs] = useState([]);
  const [todayCheckin, setTodayCheckin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = todayStr();
    Promise.all([
      supabase.from("meal_logs").select("*").eq("client_id", profile.id).eq("date", today),
      supabase.from("daily_checkins").select("calories,protein_g,carbs_g,fats_g").eq("client_id", profile.id).eq("date", today).maybeSingle(),
    ]).then(([{ data: logs }, { data: checkin }]) => {
      setMealLogs(logs || []);
      setTodayCheckin(checkin || null);
      setLoading(false);
    });
  }, [profile.id]);

  if (loading) return null;

  // Independent contributions to the same daily total, per Section 12:
  // per-meal logs sum across meals, the daily check-in's whole-day nutrition
  // fields are a separate number, and neither overwrites the other.
  const sumField = (k) => mealLogs.reduce((s, m) => s + (Number(m[k]) || 0), 0) + (Number(todayCheckin?.[k]) || 0);
  const hasAnyLogged = mealLogs.length > 0 || (todayCheckin && Object.values(todayCheckin).some((v) => v != null));

  return (
    <>
      <Card style={{ borderLeft: "3px solid " + S.accent2 }}>
        <CardTitle>Today's Actuals</CardTitle>
        {hasAnyLogged ? (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
            <span><strong style={{ color: S.text }}>{sumField("calories")}</strong> <span style={{ color: S.muted }}>{calorieTarget != null ? `/ ${calorieTarget} kcal` : "kcal"}</span></span>
            <span><strong style={{ color: S.text }}>{sumField("protein_g")}</strong><span style={{ color: S.muted }}>g protein</span></span>
            <span><strong style={{ color: S.text }}>{sumField("carbs_g")}</strong><span style={{ color: S.muted }}>g carbs</span></span>
            <span><strong style={{ color: S.text }}>{sumField("fats_g")}</strong><span style={{ color: S.muted }}>g fats</span></span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: S.muted }}>Nothing logged yet today — log a meal below or fill in nutrition on your daily check-in.</div>
        )}
      </Card>
      <Card>
        <CardTitle>Today's Meals</CardTitle>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {MEAL_SLOTS.map((label, i) => {
            const existing = mealLogs.find((l) => l.meal === label) || null;
            return (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "12px 4px", borderBottom: i < MEAL_SLOTS.length - 1 ? "1px solid " + S.border : "none" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{label}</span>
                <MealLogEntry profile={profile} mealLabel={label} existing={existing}
                  onSaved={(row) => setMealLogs((prev) => [...prev.filter((l) => l.meal !== label), row])} />
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

// Quick manual macro entry for one meal slot — a number the client already
// has from wherever they track (MyFitnessPal, a label, memory), not a
// food-item search/database. Upserts on (client_id, date, meal), so
// re-logging the same meal the same day updates it instead of double-
// counting a second row when summed into the day's actuals.
function MealLogEntry({ profile, mealLabel, existing, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ calories: existing?.calories ?? "", protein_g: existing?.protein_g ?? "", carbs_g: existing?.carbs_g ?? "", fats_g: existing?.fats_g ?? "" });
  const [saving, setSaving] = useState(false);
  const num = (v) => (v === "" || v == null ? null : Number(v));

  const save = async () => {
    setSaving(true);
    const { data } = await supabase.from("meal_logs").upsert({
      client_id: profile.id, date: todayStr(), meal: mealLabel,
      calories: num(form.calories), protein_g: num(form.protein_g), carbs_g: num(form.carbs_g), fats_g: num(form.fats_g),
    }, { onConflict: "client_id,date,meal" }).select().maybeSingle();
    setSaving(false); setOpen(false);
    onSaved(data);
  };

  if (!open) {
    return (
      <Btn sm teal onClick={() => setOpen(true)}>
        {existing ? `Logged: ${existing.calories ?? "—"} kcal · Edit` : "+ Log"}
      </Btn>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
      {[["calories", "Calories"], ["protein_g", "Protein (g)"], ["carbs_g", "Carbs (g)"], ["fats_g", "Fats (g)"]].map(([k, label]) => (
        <Fld key={k} label={label}>
          <Inp type="number" value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} placeholder="0" />
        </Fld>
      ))}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Btn sm onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Btn>
        <button onClick={() => setOpen(false)} style={{ padding: "8px 14px", fontSize: 11, background: "transparent", color: S.muted, border: "1px solid " + S.border, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function Nutrition({ profile }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile.client_type === "program_only") { setLoading(false); return; }
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
  }, [profile.id, profile.client_type]);

  if (profile.client_type === "program_only") return <GenericNutritionGuide profile={profile} />;

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
        {/* Logging isn't blocked on having a plan — the fixed meal slots
            below work whether or not a personalized target exists yet. */}
        <TodaysMealsCard profile={profile} calorieTarget={null} />
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

      <TodaysMealsCard profile={profile} calorieTarget={plan.calories} />

      {(plan.guidelines || plan.hydration) && (
        <Card>
          <CardTitle>Guidelines</CardTitle>
          {plan.guidelines && <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: plan.hydration ? 12 : 0 }}>{plan.guidelines}</div>}
          {plan.hydration && <div style={{ fontSize: 13, color: S.accent2 }}>💧 {plan.hydration}</div>}
        </Card>
      )}

      {meals.map((m, i) => (
        <DayFolder key={i} title={m.meal || "Meal " + (i + 1)} meta={[m.time, m.calories != null ? `${m.calories} kcal` : null].filter(Boolean).join(" · ")}>
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
        </DayFolder>
      ))}

      {Array.isArray(plan.supplements) && plan.supplements.length > 0 && (
        <Card>
          <CardTitle>Supplements</CardTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {plan.supplements.map((s, i) => (
              <li key={i}>
                <strong>{s.name}</strong>{s.dose ? ` — ${s.dose}` : ""}{s.timing ? ` · ${s.timing}` : ""}
                {s.note && <div style={{ fontSize: 12, color: S.muted }}>{s.note}</div>}
              </li>
            ))}
          </ul>
          {plan.supplements_disclaimer && <div style={{ fontSize: 11, color: S.muted, marginTop: 10, fontStyle: "italic" }}>{plan.supplements_disclaimer}</div>}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD SHELLS — top bar + sidebar nav + active page
// ---------------------------------------------------------------------------

function Shell({ profile, isCoach, logout, page, setPage, children, wide }) {
  const programOnly = !isCoach && profile?.client_type === "program_only";
  return (
    <div style={{ minHeight: "100vh", background: S.bg, color: S.text }}>
      <TopBar profile={profile} isCoach={isCoach} onLogout={logout} />
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <Sidebar isCoach={isCoach} programOnly={programOnly} page={page} setPage={setPage} />
        {/* `wide` (Coach Overview only) uses the full available width instead
            of the app's standard 1180px column — that page's grid/tile
            panels were reading cramped with a lot of unused whitespace past
            it on larger screens. Every other page keeps the standard width. */}
        <main className="main-content" style={{ flex: 1, minWidth: 0, padding: "28px 32px", maxWidth: wide ? 1760 : 1180, width: "100%" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// Unified "Check-In" tab: a small landing that shows today's daily status
// and this week's weekly status side by side, then drills into the existing
// DailyCheckin/WeeklyCheckin forms unchanged — the two flows aren't merged
// into one form, just reachable from one nav destination instead of two.
function CheckInHome({ profile, setPage }) {
  const [view, setView] = useState("menu");
  const [doneToday, setDoneToday] = useState(null);
  const [weeklyDone, setWeeklyDone] = useState(null);

  useEffect(() => {
    supabase.from("daily_checkins").select("id").eq("client_id", profile.id).eq("date", todayStr()).maybeSingle()
      .then(({ data }) => setDoneToday(!!data));
    const ws = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return localDateStr(d); })();
    supabase.from("weekly_checkins").select("id").eq("client_id", profile.id).eq("date", ws).maybeSingle()
      .then(({ data }) => setWeeklyDone(!!data));
  }, [profile.id]);

  if (view === "daily") return <DailyCheckin profile={profile} onDone={() => setView("menu")} />;
  if (view === "weekly") return <WeeklyCheckin profile={profile} onDone={() => setView("menu")} />;

  return (
    <div>
      <PageTitle title="Check-In" sub="Daily and weekly check-ins" />
      <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <CardTitle>Daily Check-In</CardTitle>
          <div style={{ fontSize: 13, color: S.text, marginBottom: 14 }}>
            {doneToday == null ? "Loading..." : doneToday ? "Completed today. Nice work." : "Not done yet today."}
          </div>
          <Btn onClick={() => setView("daily")}>{doneToday ? "Update Today's Check-In" : "Complete Check-In"}</Btn>
        </Card>
        <Card>
          <CardTitle>Weekly Check-In</CardTitle>
          <div style={{ fontSize: 13, color: S.text, marginBottom: 14 }}>
            {weeklyDone == null ? "Loading..." : weeklyDone ? "Completed this week." : "Due this week — it's how your coach adjusts your plan."}
          </div>
          <Btn teal onClick={() => setView("weekly")}>{weeklyDone ? "Update Weekly Check-In" : "Start Weekly Check-In"}</Btn>
        </Card>
      </div>
    </div>
  );
}

// "More" landing for everything that doesn't fit the primary bottom-nav/
// sidebar tabs. Each row just navigates to an existing page — no new pages
// were invented to fill this out (Messages/Settings aren't listed because
// there's no dedicated route for either yet).
function MoreMenu({ programOnly, setPage }) {
  const items = programOnly
    ? [
        { id: "nutrition", icon: "🥗", label: "Nutrition", sub: "Your fuel plan" },
        { id: "schedule", icon: "🗓", label: "Schedule", sub: "Build your workout pattern" },
        { id: "resources", icon: "📚", label: "Library", sub: "Guides and documents" },
      ]
    : [
        { id: "program", icon: "📋", label: "Program", sub: "Training plan and roadmap" },
        { id: "nutrition", icon: "🥗", label: "Nutrition", sub: "Track meals and macros" },
        { id: "schedule", icon: "🗓", label: "Schedule", sub: "Build your workout pattern" },
        { id: "habits", icon: "✅", label: "Habits", sub: "Daily habit tracker" },
        { id: "resources", icon: "📚", label: "Library", sub: "Guides and documents" },
      ];
  return (
    <div>
      <PageTitle title="More" />
      <Card style={{ padding: 0 }}>
        {items.map((it, i) => (
          <div key={it.id} onClick={() => setPage(it.id)}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer", borderBottom: i < items.length - 1 ? "1px solid " + S.border : "none" }}>
            <span style={{ fontSize: 20 }}>{it.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{it.label}</div>
              <div style={{ fontSize: 11, color: S.muted }}>{it.sub}</div>
            </div>
            <span style={{ color: S.muted }}>›</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ClientDashboard({ profile, logout }) {
  const programOnly = profile.client_type === "program_only";
  const [page, setPage] = useState(programOnly ? "program" : "dashboard");
  const [welcomed, setWelcomed] = useState(!!profile.welcome_seen);
  // "today" (Today card's "View Full Workout") vs "next" (Upcoming card's
  // "Next Workout") — the Workouts page's default exercise selection needs
  // to know which one the client actually clicked, not guess from neither.
  const [workoutsTarget, setWorkoutsTarget] = useState(null);
  const goToWorkouts = (target) => { setWorkoutsTarget(target); setPage("workouts"); };

  // Sold-access enforcement: once access_until has passed, the client is locked
  // out of the portal (their data is preserved) until the coach extends it.
  if (profile.access_until && profile.access_until < todayStr()) {
    return (
      <div style={{ minHeight: "100vh", background: S.bg, color: S.text }}>
        <TopBar profile={profile} isCoach={false} onLogout={logout} />
        <main className="main-content" style={{ padding: "28px 32px", maxWidth: 680, margin: "0 auto" }}>
          <Card style={{ textAlign: "center", padding: 48, marginTop: 40 }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🔒</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, marginBottom: 10 }}>Your access has ended</div>
            <div style={{ color: S.muted, fontSize: 14, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 22px" }}>Your access ended on {profile.access_until}. Reach out to renew and pick up right where you left off — all your history is saved.</div>
            <Btn onClick={logout}>Log out</Btn>
          </Card>
        </main>
      </div>
    );
  }

  // One-time welcome gate on first login; marks the profile so it never reappears.
  // An optional target page lets the welcome drop the user straight into the
  // Library (Getting Started). Guard the type — the plain "Enter" Btn passes a
  // click event, which must not be treated as a page id.
  const enterPortal = async (target) => {
    setWelcomed(true);
    if (typeof target === "string") setPage(target);
    await supabase.from("profiles").update({ welcome_seen: true }).eq("id", profile.id);
  };

  if (!welcomed) {
    return (
      <div style={{ minHeight: "100vh", background: S.bg, color: S.text }}>
        <TopBar profile={profile} isCoach={false} onLogout={logout} />
        <main className="main-content" style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
          <ClientWelcome profile={profile} onEnter={enterPortal} />
        </main>
      </div>
    );
  }

  return (
    <Shell profile={profile} isCoach={false} logout={logout} page={page} setPage={setPage}>
      {page === "dashboard" && !programOnly && <ClientHome profile={profile} setPage={setPage} goToWorkouts={goToWorkouts} />}
      {page === "program" && <ClientProgram profile={profile} />}
      {page === "checkin" && !programOnly && <CheckInHome profile={profile} setPage={setPage} />}
      {page === "daily" && !programOnly && <DailyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "weekly" && !programOnly && <WeeklyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "progress" && (programOnly ? <ProgramProgress profile={profile} /> : <Progress profile={profile} />)}
      {page === "workouts" && <Workouts profile={profile} targetDay={workoutsTarget} onTargetConsumed={() => setWorkoutsTarget(null)} setPage={setPage} />}
      {page === "nutrition" && <Nutrition profile={profile} />}
      {page === "habits" && !programOnly && (
        <div><PageTitle title="Habits" sub="Your daily habit tracker" /><Habits profile={profile} /></div>
      )}
      {page === "resources" && <Resources />}
      {page === "schedule" && (
        <div><PageTitle title="Schedule" sub="Build your own workout pattern — not locked to a fixed weekly structure" /><WorkoutScheduler clientId={profile.id} trainOwnerId={trainingOwnerId(profile)}/></div>
      )}
      {page === "more" && <MoreMenu programOnly={programOnly} setPage={setPage} />}
    </Shell>
  );
}

// CRMPanel now lives in src/features/crm/CRMBoard.jsx.


function CoachDashboard({ profile, logout }) {
  const [page, setPage] = useState("dashboard");
  // Set right before switching to "clients" when the coach clicked a specific
  // client elsewhere (Home's client list, flags, messages, upgrade requests) —
  // ClientDetailPage consumes it once on mount so it opens straight to that
  // client instead of falling back to whichever is first in the roster.
  const [openClientId, setOpenClientId] = useState(null);
  // Optional target section key (e.g. "program-roadmap") to auto-expand once
  // ClientDetailPage opens this client — lets other pages (the Overview's
  // Client Overview table) jump straight to a specific accordion section
  // instead of always landing on the collapsed default.
  const [openSectionKey, setOpenSectionKey] = useState(null);
  const openClient = (id, opts) => { setOpenClientId(id); setOpenSectionKey(opts?.section || null); setPage("clients"); };

  return (
    <Shell profile={profile} isCoach={true} logout={logout} page={page} setPage={setPage} wide={page === "dashboard" || page === "clients" || page === "crm" || page === "templates" || page === "assess"}>
      {page === "dashboard" && <CoachHome setPage={setPage} openClient={openClient} />}
      {page === "clients" && <ClientDetailPage initialClientId={openClientId} onInitialClientOpened={() => setOpenClientId(null)}
        initialSectionKey={openSectionKey} onInitialSectionOpened={() => setOpenSectionKey(null)} />}
      {page === "crm" && <CRMBoard />}
      {page === "metrics" && <MetricsDashboard />}
      {page === "assess" && <AssessmentsPanel />}
      {page === "templates" && <TemplatesPanel />}
      {page === "library" && <ResourcesPanel />}
    </Shell>
  );
}
