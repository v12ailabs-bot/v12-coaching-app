import { useState, useEffect, useRef, useCallback } from "react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";



import { supabase } from "./supabaseClient.js";
import { S, bS, TT, todayStr, useIsMobile, trainingOwnerId, avatarFrom, GlobalStyles } from "./theme.jsx";
import { Card, CardTitle, PageTitle, Stat, Fld, Inp, Sld, RG, Btn, CC, DayFolder, StatusBadge, CollapsibleSection, Alert } from "./components/ui/index.js";
import { ClientSelector } from "./components/ClientSelector.jsx";
import { DAY_ORDER, EX_TYPES, PHASES, groupByDay, PROGRAM_HABITS, streakBack, COACH_EMAIL, INTAKE_FIELDS, BLOCK_TYPE_LABEL, BLOCK_TYPE_SHORT } from "./lib/constants.js";
import { adherenceFrom, nutritionScoreFrom } from "./lib/scoring.js";
import { computeGoalScore } from "./lib/scoring/goalScoring.js";
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
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:S.accent,flexShrink:0}}>V12</div>
      <div style={{display:"flex",alignItems:"center",gap:14,minWidth:0}}>
        {!isCoach && profile?.dashboard_url && (
          <a href={profile.dashboard_url} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:S.accent2,textDecoration:"none",border:"1px solid "+S.border,padding:"7px 12px"}}>
            ↗ My Dashboard
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

function Sidebar({ isCoach, programOnly, page, setPage }) {
  const isMobile = useIsMobile();
  // Program-only clients get the self-guided portal: their plan, nutrition,
  // workout logging, a solo habit tracker + progress view, and the resource hub —
  // no coach touchpoints and no check-in prompts.
  // `short` labels are used in the cramped mobile bottom bar (clients have 9 tabs;
  // the full labels overlap at that width).
  const clientNav = programOnly
    ? [{id:"program",icon:"📋",label:"Training Plan",short:"Plan"},{id:"nutrition",icon:"🥗",label:"Nutrition",short:"Meals"},{id:"progress",icon:"📈",label:"Progress",short:"Progress"},{id:"resources",icon:"📚",label:"Library",short:"Library"}]
    : [{id:"dashboard",icon:"⚡",label:"Dashboard",short:"Home"},{id:"program",icon:"📋",label:"Training Plan",short:"Plan"},{id:"nutrition",icon:"🥗",label:"Nutrition",short:"Meals"},{id:"daily",icon:"✅",label:"Daily Check-In",short:"Daily"},{id:"weekly",icon:"🔥",label:"Weekly Check-In",short:"Weekly"},{id:"progress",icon:"📈",label:"Progress",short:"Progress"},{id:"resources",icon:"📚",label:"Library",short:"Library"}];
  const nav = isCoach
    ? [{id:"dashboard",icon:"⚡",label:"Overview",short:"Home"},{id:"clients",icon:"👥",label:"Clients",short:"Clients"},{id:"crm",icon:"📇",label:"Leads / CRM",short:"Leads"},{id:"metrics",icon:"📊",label:"Business + Content",short:"Metrics"},{id:"assess",icon:"🧭",label:"Assessments",short:"Assess"},{id:"templates",icon:"📋",label:"Templates",short:"Plans"},{id:"library",icon:"📚",label:"Library",short:"Library"}]
    : clientNav;
  return (
    <nav className="sidebar" style={{width:216,background:S.surface,borderRight:"1px solid "+S.border,padding:"20px 0",flexShrink:0,position:"sticky",top:54,height:"calc(100vh - 54px)",overflowY:"auto"}}>
      <div className="sidebar-inner" style={{padding:"0 14px"}}>
        <div className="sidebar-heading" style={{fontSize:9,letterSpacing:"2.5px",textTransform:"uppercase",color:S.muted,padding:"0 10px",marginBottom:6}}>{isCoach?"Coach":"Training"}</div>
        {nav.map(item=>(
          <div key={item.id} className="sidebar-item" onClick={()=>setPage(item.id)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",fontSize:13,fontWeight:500,color:page===item.id?S.accent:S.muted,cursor:"pointer",borderRadius:3,marginBottom:1,background:page===item.id?"rgba(255,77,0,.12)":"transparent"}}>
            <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
            <span className="sidebar-label">{isMobile&&item.short?item.short:item.label}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}

// Client-visible coach messages (coach_messages table) with real history and
// read-state. The oldest unacknowledged message shows as a banner; clicking
// "Got it" acknowledges it (permanently — it never reappears) and reveals the
// next one, if any. Everything acknowledged lives in a collapsed history
// list below. Placed at the top of the Dashboard and the Training Plan.
function CoachMessage({ profile }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("coach_messages").select("*").eq("client_id", profile.id).order("created_at", { ascending: false });
    setMessages(data || []);
    setLoading(false);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return null;

  const unacknowledged = [...messages].filter(m => !m.acknowledged_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
  const history = messages.filter(m => m.id !== unacknowledged?.id);

  const acknowledge = async () => {
    if (!unacknowledged) return;
    setAcking(true);
    await supabase.from("coach_messages").update({ acknowledged_at: new Date().toISOString() }).eq("id", unacknowledged.id);
    setAcking(false);
    load();
  };

  if (!unacknowledged && history.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {unacknowledged && (
        <Card style={{ borderLeft: "3px solid " + S.accent2, marginBottom: history.length ? 10 : 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent2, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span>💬</span> Message from your coach
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: S.text, whiteSpace: "pre-wrap", marginBottom: 14 }}>{unacknowledged.body}</div>
          <Btn sm teal onClick={acknowledge} disabled={acking}>{acking ? "..." : "Got it"}</Btn>
        </Card>
      )}
      {history.length > 0 && (
        <>
          <button onClick={() => setShowHistory(v => !v)}
            style={{ background: "none", border: "none", color: S.muted, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}>
            {showHistory ? "Hide" : "View"} message history ({history.length})
          </button>
          {showHistory && history.map(m => (
            <div key={m.id} style={{ background: S.surface, border: "1px solid " + S.border, padding: "12px 14px", marginTop: 8 }}>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 6 }}>{(m.created_at || "").slice(0, 10)}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: S.text, whiteSpace: "pre-wrap" }}>{m.body}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Client-visible surface for a coach-generated AI goal insight
// (client_goal_insights) — same read-state pattern as CoachMessage above:
// the newest unacknowledged insight shows as a banner on Home with a "Got
// it" button, then never reappears here (it stays viewable under Progress ->
// Goals for as long as the goal is active).
function GoalInsightBanner({ profile }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("client_goal_insights").select("*").eq("client_id", profile.id)
      .is("acknowledged_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setInsight(data || null);
    setLoading(false);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !insight) return null;

  const acknowledge = async () => {
    setAcking(true);
    await supabase.from("client_goal_insights").update({ acknowledged_at: new Date().toISOString() }).eq("id", insight.id);
    setAcking(false);
    load();
  };

  return (
    <Card style={{ borderLeft: "3px solid " + S.accent, marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🎯</span> New Coaching Insight
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: S.text, whiteSpace: "pre-wrap", marginBottom: 14 }}>{insight.insight_text}</div>
      <Btn sm teal onClick={acknowledge} disabled={acking}>{acking ? "..." : "Got it"}</Btn>
    </Card>
  );
}

const SUMMARY_MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const summaryMonthLabel = (period) => { const [y,m] = (period||"").split("-"); return m ? `${SUMMARY_MONTH_NAMES[+m-1]} ${y}` : period; };

// Client-visible "new recap ready" banner for the AI monthly summary
// (client_summaries) — same read-state pattern as CoachMessage/
// GoalInsightBanner above: the newest unacknowledged recap shows as a banner
// on Home, and "View Recap" both acknowledges it and sends the client to
// Progress, where the full recap lives (read-only, in AISummarySection.jsx).
function NewSummaryBanner({ profile, setPage }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("client_summaries").select("id,period").eq("client_id", profile.id)
      .is("acknowledged_at", null).order("period", { ascending: false }).limit(1).maybeSingle();
    setSummary(data || null);
    setLoading(false);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !summary) return null;

  const view = async () => {
    setAcking(true);
    await supabase.from("client_summaries").update({ acknowledged_at: new Date().toISOString() }).eq("id", summary.id);
    setAcking(false);
    setPage("progress");
  };

  return (
    <Card style={{ borderLeft: "3px solid " + S.accent2, marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent2, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊</span> New Monthly Recap
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: S.text, marginBottom: 14 }}>Your recap for {summaryMonthLabel(summary.period)} is ready to view.</div>
      <Btn sm teal onClick={view} disabled={acking}>{acking ? "..." : "View Recap"}</Btn>
    </Card>
  );
}

// Client-side surface for the manual PayPal invoice link the coach pastes in
// after Accept (CRMPanel) -- shown until the coach marks the lead paid.
function InvoiceCard({ profile }) {
  const [lead, setLead] = useState(null);
  useEffect(() => {
    supabase.from("leads").select("invoice_link,paid").eq("client_id", profile.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLead(data));
  }, [profile.id]);
  if (!lead?.invoice_link || lead.paid) return null;
  return (
    <Card style={{ borderLeft: "3px solid " + S.accent }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent, marginBottom: 10 }}>Complete Your Enrollment</div>
      <div style={{ fontSize: 13, color: S.text, marginBottom: 12, lineHeight: 1.6 }}>Finish signing up by completing payment below.</div>
      <a href={lead.invoice_link} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
        <button style={{ ...bS({ padding: "10px 22px" }), background: S.accent, color: "white" }}>Pay Now →</button>
      </a>
    </Card>
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

function ClientHome({ profile, setPage }) {
  const [checkins, setCheckins] = useState([]);
  const [weeklyDone, setWeeklyDone] = useState(true);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      const {data:ci} = await supabase.from("daily_checkins").select("*").eq("client_id",profile.id).order("date");
      setCheckins(ci||[]);
      const ws = (()=>{const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().split("T")[0];})();
      const {data:wc} = await supabase.from("weekly_checkins").select("id").eq("client_id",profile.id).eq("date",ws).maybeSingle();
      setWeeklyDone(!!wc);
      const {data:g} = await supabase.from("client_goals").select("*").eq("client_id",profile.id).eq("status","active").eq("metric_key","bodyweight")
        .order("created_at",{ascending:false}).limit(1).maybeSingle();
      setGoal(g||null);
      setLoading(false);
    })();
  },[profile.id]);

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  const doneToday = checkins.some(c=>c.date===todayStr());
  const r7 = checkins.slice(-7);
  const avgE = r7.length?(r7.reduce((s,c)=>s+c.energy,0)/r7.length).toFixed(1):"—";
  const avgS = r7.length?(r7.reduce((s,c)=>s+c.sleep,0)/r7.length).toFixed(1):"—";
  const lastW = checkins.length?checkins[checkins.length-1].weight:"—";
  const streak = (()=>{let s=0;for(let i=checkins.length-1;i>=0;i--){if(checkins[i].workout==="completed")s++;else break;}return s;})();
  // Same computeGoalScore GoalsSection/Progress use — one source of truth.
  const weightSeries = checkins.filter(c=>c.weight!=null).map(c=>({date:c.date,value:c.weight}));
  const goalScore = goal ? computeGoalScore(goal, weightSeries, {}) : null;
  const daysRemaining = goal ? Math.max(0,Math.ceil((new Date(goal.target_date+"T00:00:00Z") - new Date()) / 86400000)) : null;
  const tickEvery = (n) => Math.max(1, Math.floor(n / 8));

  return (
    <div>
      <PageTitle title={"Welcome back, "+((profile.name||"").split(" ")[0]||"Athlete")+"."} sub={profile.goal||"Keep pushing."}/>
      <CoachMessage profile={profile} />
      <GoalInsightBanner profile={profile} />
      <NewSummaryBanner profile={profile} setPage={setPage} />
      <CollapsibleSection title="Habits">
        <Habits profile={profile} />
      </CollapsibleSection>
      <InvoiceCard profile={profile} />
      {!doneToday && (
        <div style={{background:"rgba(255,77,0,.09)",border:"1px solid rgba(255,77,0,.25)",padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontSize:13}}>Reminder: Daily check-in not done yet.</span>
          <Btn sm onClick={()=>setPage("daily")}>Do it now</Btn>
        </div>
      )}
      {!weeklyDone && (
        <div style={{background:"rgba(0,201,167,.10)",border:"1px solid rgba(0,201,167,.28)",padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:20,flexWrap:"wrap"}}>
          <span style={{fontSize:13}}>Your weekly check-in is due this week — it's how your coach adjusts your plan.</span>
          <Btn sm teal onClick={()=>setPage("weekly")}>Start weekly</Btn>
        </div>
      )}
      <div className="g4" style={{display:"grid",gridTemplateColumns:goal?"repeat(6,1fr)":"repeat(4,1fr)",gap:16,marginBottom:22}}>
        <Stat label="Current Weight" value={lastW} unit="lb"/>
        <Stat label="Workout Streak" value={streak} unit="days"/>
        <Stat label="Avg Sleep" value={avgS} unit="/10"/>
        <Stat label="Avg Energy" value={avgE} unit="/10"/>
        {goal && <Stat label="Goal Progress" value={goalScore?.overallScore??"—"} unit={goalScore?.overallScore!=null?"%":""}/>}
        {goal && <Stat label="Days Remaining" value={daysRemaining} unit="days"/>}
      </div>
      {checkins.length>1?(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <CC title="Bodyweight Trend" sub={goal?`Full history · target ${goal.target_value}${goal.unit}`:"Full history"}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={checkins}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={tickEvery(checkins.length)}/>
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT}/>
                {goal && <ReferenceLine y={goal.target_value} stroke={S.accent2} strokeDasharray="4 4" label={{value:"Goal",fontSize:9,fill:S.accent2,position:"insideTopRight"}}/>}
                <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </CC>
          <CC title="Energy and Sleep" sub="Full history">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={checkins}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={tickEvery(checkins.length)}/>
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
  const weekStart = (()=>{const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().split("T")[0];})();
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

function Workouts({ profile, readOnly, embedded }) {
  const [exercises, setExercises] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [logMode, setLogMode] = useState(false);
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
    if(data&&data.length>0&&!selected) setSelected(data[0].id);
  },[profile.id,profile.shared_program_owner_id]);

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
  const blockType = selectedEx?.block_type || "straight_set";
  const groupMembers = selectedEx
    ? exercises.filter((e) => e.day_of_week === selectedEx.day_of_week && e.group_id === selectedEx.group_id)
    : [];

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
    setSaving(false); setSaved(true); setLogMode(false);
    setTimeout(() => setSaved(false), 2000);
  };
  const chartData = logs.reduce((acc,log)=>{const ex=acc.find(a=>a.date===log.date);if(!ex)acc.push({date:log.date,weight:log.weight,reps:log.reps});return acc;},[]);

  // Group the program's exercises into sequential "Day 1..N" for the selector.
  const dayGroups = groupByDay(exercises);
  const dayLabelOf = {};
  dayGroups.forEach(g=>g.exercises.forEach(e=>{dayLabelOf[e.id]=g.label;}));

  return (
    <div>
      {embedded
        ? <div style={{fontSize:13,color:S.muted,marginBottom:18,lineHeight:1.6}}>Log the sets you complete for each day's exercises. Your progression graphs live under Progress → Strength.</div>
        : <PageTitle title="Workout Log" sub={readOnly?"Client's logged sessions":"Track your strength progression"}/>}
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
            {dayGroups.map(({day,exercises:dayExs,label})=>(
              <DayFolder key={day} title={label} meta={`${dayExs.length} exercise${dayExs.length>1?"s":""}`} defaultOpen={dayExs.some(e=>e.id===selected)}>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {dayExs.map(ex=>(
                    <button key={ex.id} onClick={()=>{setSelected(ex.id);setLogMode(false);}}
                      style={{padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid "+(selected===ex.id?S.accent:S.border),background:selected===ex.id?"rgba(255,77,0,.08)":"transparent",color:selected===ex.id?S.accent:S.muted}}>
                      {ex.name}{BLOCK_TYPE_SHORT[ex.block_type]&&<span style={{marginLeft:6,fontSize:9,color:S.accent2}}>{BLOCK_TYPE_SHORT[ex.block_type]}</span>}
                    </button>
                  ))}
                </div>
              </DayFolder>
            ))}
          </div>
          {selectedEx&&(
            <>
              <Card style={{marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22}}>{selectedEx.name}</div>
                    <div style={{fontSize:12,color:S.muted}}>{[dayLabelOf[selectedEx.id],selectedEx.category].filter(Boolean).join(" · ")||"Unscheduled"}{selectedEx.is_bodyweight?" · bodyweight":""}</div>
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
                  {!readOnly&&<Btn sm teal onClick={()=>{
                    const open=!logMode; setLogMode(open);
                    if(open){
                      if(blockType==="straight_set") setSets(freshSets(selectedEx.sets));
                      else setRounds(freshRounds(selectedEx.sets, groupMembers));
                    }
                  }}>{logMode?"Cancel":"+ Log Session"}</Btn>}
                </div>
                {!readOnly&&logMode&&blockType==="straight_set"&&(
                  <div style={{marginBottom:20,padding:16,background:S.surface2,border:"1px solid "+S.border}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14,flexWrap:"wrap",gap:8}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18}}>Log {selectedEx.name}</div>
                      <div style={{fontSize:11,color:S.muted}}>Target: {selectedEx.sets??"—"} × {selectedEx.reps??"—"}</div>
                    </div>
                    {sets.map((s,i)=>(
                      <div key={i} style={{display:"flex",gap:10,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
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
                {!readOnly&&logMode&&blockType!=="straight_set"&&(
                  <div style={{marginBottom:20,padding:16,background:S.surface2,border:"1px solid "+S.border}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14,flexWrap:"wrap",gap:8}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18}}>Log {groupMembers.map(m=>m.name).join(" + ")}</div>
                      <div style={{fontSize:11,color:S.muted}}>{BLOCK_TYPE_LABEL[blockType]}</div>
                    </div>
                    {rounds.map((round,i)=>(
                      <div key={i} style={{marginBottom:14,paddingBottom:14,borderBottom:i<rounds.length-1?"1px solid "+S.border:"none"}}>
                        <div style={{fontSize:11,color:S.muted,marginBottom:8}}>Round {i+1}</div>
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
                    ))}
                    <div style={{display:"flex",gap:10,marginTop:14,alignItems:"center"}}>
                      <Btn onClick={handleLogGroup} disabled={saving}>{saving?"Saving...":"Save Session"}</Btn>
                      <button onClick={()=>setRounds([...rounds,blankRound(groupMembers)])} style={{background:"none",border:"1px solid "+S.border,color:S.text,padding:"8px 14px",fontSize:10,fontWeight:600,cursor:"pointer",textTransform:"uppercase",letterSpacing:"1px"}}>+ Add Round</button>
                    </div>
                  </div>
                )}
                <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:420}}>
                  <thead><tr>{["Date","Weight","Reps","Round","Time","Rest"].map(h=><th key={h} style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,textAlign:"left",padding:"10px 14px",borderBottom:"1px solid "+S.border}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...logs].reverse().map((row,i)=>(
                      <tr key={i}>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.date}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.weight?row.weight+" lbs":"BW"}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.reps||"—"}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.sets}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.time||"—"}</td>
                        <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid "+S.border}}>{row.rest||"—"}</td>
                      </tr>
                    ))}
                    {logs.length===0&&<tr><td colSpan={6} style={{padding:"11px 14px",fontSize:13,color:S.muted,textAlign:"center"}}>No sessions logged yet</td></tr>}
                  </tbody>
                </table>
                </div>
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
function CoachHome({ setPage, openClient }) {
  const [clients, setClients] = useState([]);
  const [byClient, setByClient] = useState({});
  const [weeklyRecent, setWeeklyRecent] = useState([]);
  const [goalsByClient, setGoalsByClient] = useState({});
  const [upgrades, setUpgrades] = useState([]);
  const [loading, setLoading] = useState(true);
  // Session-only expand state — collapsed by default. Needs Attention itself
  // always stays visible (per the dashboard's whole purpose); only the
  // per-client rows inside it expand/collapse, tracked separately.
  const [expandedNeeds, setExpandedNeeds] = useState(() => new Set());
  const toggleNeeds = (id) => setExpandedNeeds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  useEffect(()=>{
    (async()=>{
      const {data:cl} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL).neq("archived",true);
      const list = cl||[];
      // Coaching signals (check-ins, goals) only ever apply to coaching
      // clients — program-only clients self-track outside any coach
      // relationship, so they're excluded from these fetches at the source
      // rather than relying on the per-client early-return below to ignore them.
      const coachedIds = list.filter(c=>c.client_type!=="program_only").map(c=>c.id);
      const grouped = {};
      let weeklies = [];
      // Pending upgrade requests from program-only clients.
      const {data:ur} = await supabase.from("upgrade_requests").select("*").eq("status","pending").order("created_at",{ascending:false});
      setUpgrades(ur||[]);
      if(coachedIds.length){
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-29);
        const cut = cutoff.toISOString().split("T")[0];
        const {data:ch} = await supabase.from("daily_checkins")
          .select("client_id,date,weight,workout,diet").in("client_id",coachedIds).gte("date",cut).order("date");
        (ch||[]).forEach(r=>{ (grouped[r.client_id]=grouped[r.client_id]||[]).push(r); });
        // Weekly check-ins over a 28-day window: the last 14 days feed the
        // "Client Messages & Flags" card (filtered further below), while the
        // full 28 gives the recovery-trend flag a prior-2-weeks baseline to
        // compare against.
        const wcutoff = new Date(); wcutoff.setDate(wcutoff.getDate()-27);
        const wcut = wcutoff.toISOString().split("T")[0];
        const {data:wc} = await supabase.from("weekly_checkins")
          .select("client_id,date,coach_questions,adjustments,confidence_level,felt_weaker,biggest_challenge,mental_blocks,sleep_quality,hydration_quality")
          .in("client_id",coachedIds).gte("date",wcut).order("date");
        weeklies = wc||[];
      }
      // Each coached client's active bodyweight goal — same client_goals rows
      // GoalsSection/Progress read, reused here instead of a duplicate signal.
      const {data:cg} = coachedIds.length ? await supabase.from("client_goals").select("*").in("client_id",coachedIds).eq("status","active").eq("metric_key","bodyweight") : {data:[]};
      const goalsMap = {}; (cg||[]).forEach(g=>{goalsMap[g.client_id]=g;});
      setClients(list); setByClient(grouped); setWeeklyRecent(weeklies); setGoalsByClient(goalsMap); setLoading(false);
    })();
  },[]);

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  const today = todayStr();
  const daysSinceDate = (d)=> Math.round((new Date(today) - new Date(d)) / 86400000);

  const assessed = clients.map(c=>{
    // Program-only clients have no coach and no check-ins, so the check-in-based
    // attention flags don't apply — never surface them here.
    if(c.client_type==="program_only") return {client:c, adh:{score:0}, last:null, since:null, flags:[], severity:0, riskLevel:"On Track", goalScore:null, programOnly:true};
    const ch = byClient[c.id] || [];
    const adh = adherenceFrom(ch, 30);
    const last = ch.length ? ch[ch.length-1].date : null;
    const since = last ? daysSinceDate(last) : null;
    // Each flag carries a `detail` sentence and an optional `action` suggestion
    // — the expanded per-client view in Needs Attention shows these instead of
    // the raw dataset, so it stays scoped to "where they're lacking" and "what
    // to do about it" rather than a full stats dump.
    const flags = [];
    if(since==null) flags.push({label:"No activity yet", tone:"red", detail:"This client has never logged a daily check-in.", action:"Reach out to help them log their first check-in."});
    else if(since>7) flags.push({label:`No activity ${since}d`, tone:"red", detail:`No daily check-in in ${since} days — worth reaching out to see what's going on.`, action:"Send a check-in message today."});
    else if(since>=3) flags.push({label:`${since}d since check-in`, tone:"amber", detail:`Last logged a daily check-in ${since} days ago.`, action:"A light nudge before this becomes a longer gap."});
    if(adh.score<50) flags.push({label:`Adherence ${adh.score}%`, tone:"amber", detail:`Only checked in on ${adh.score}% of the last 30 days (aim for 70%+).`, action:"Simplify the check-in ask and address any stated barriers."});
    const nut = nutritionScoreFrom(ch, 30);
    if(nut.score!=null && nut.n>=3 && nut.score<50) flags.push({label:`Nutrition ${nut.score}%`, tone:"amber", detail:`Self-rated diet quality has averaged ${nut.score}% across ${nut.n} check-ins in the last 30 days.`, action:"Revisit the nutrition plan for something more sustainable."});

    // Goal-based signals, all from the SAME computeGoalScore GoalsSection/Progress
    // use — no duplicate progress math. Falls back to the older free-text
    // goal-vs-weight-trend heuristic only when the client has no structured goal.
    const goal = goalsByClient[c.id] || null;
    const weights = ch.filter(r=>r.weight!=null);
    let goalScore = null;
    if(goal){
      goalScore = computeGoalScore(goal, weights.map(w=>({date:w.date,value:w.weight})), {nutrition:nut.score,training:adh.trainingRate});
      if(goalScore.classification==="Off Track") flags.push({label:"Goal off track", tone:"red", detail:`Goal score is ${goalScore.overallScore ?? "—"}/100 — trending the wrong way relative to the target.`, action:"Review the plan against this goal — the current approach isn't working."});
      else if(goalScore.classification==="Slightly Behind") flags.push({label:"Goal slightly behind", tone:"amber", detail:`Goal score is ${goalScore.overallScore ?? "—"}/100 — behind the pace needed to hit the target date.`, action:"A small adjustment now could get this back on pace."});
      if(goal.direction!=="maintain" && goalScore.velocity!=null && Math.abs(goalScore.velocity)<0.05)
        flags.push({label:"Plateaued", tone:"amber", detail:"No meaningful weight movement toward the goal in the last 30 days.", action:"Consider a deload/refeed and review the program phase."});
    } else {
      // No structured goal yet — fall back to the free-text goal vs. weight-trend heuristic.
      if(weights.length>=2){
        const delta = weights[weights.length-1].weight - weights[0].weight;
        const goalText = (c.goal||"").toLowerCase();
        const wantsLoss = /(loss|lean|cut|shred|fat)/.test(goalText);
        const wantsGain = /(gain|muscle|bulk|mass|size|strength)/.test(goalText);
        if(wantsLoss && delta>1) flags.push({label:`Weight ▲ ${delta.toFixed(1)}lb`, tone:"red", detail:`Weight is up ${delta.toFixed(1)}lb over the tracked period, working against a fat-loss goal.`, action:"Set a structured goal to track this properly, and review nutrition adherence."});
        else if(wantsGain && delta<-1) flags.push({label:`Weight ▼ ${Math.abs(delta).toFixed(1)}lb`, tone:"red", detail:`Weight is down ${Math.abs(delta).toFixed(1)}lb over the tracked period, working against a muscle-gain goal.`, action:"Set a structured goal to track this properly, and review nutrition adherence."});
      }
    }

    // Recovery trend: trailing 2-week avg of self-rated sleep/hydration vs. the
    // prior 2 weeks, from weekly_checkins (28-day window fetched above).
    const wk = weeklyRecent.filter(w=>w.client_id===c.id);
    const recoveryOf = (w)=> (w.sleep_quality!=null || w.hydration_quality!=null) ? ((w.sleep_quality||0)+(w.hydration_quality||0))/((w.sleep_quality!=null)+(w.hydration_quality!=null)) : null;
    const recentWk = wk.filter(w=>daysSinceDate(w.date)<=13).map(recoveryOf).filter(v=>v!=null);
    const priorWk = wk.filter(w=>daysSinceDate(w.date)>13 && daysSinceDate(w.date)<=27).map(recoveryOf).filter(v=>v!=null);
    if(recentWk.length && priorWk.length){
      const recentAvg = recentWk.reduce((s,v)=>s+v,0)/recentWk.length;
      const priorAvg = priorWk.reduce((s,v)=>s+v,0)/priorWk.length;
      if(priorAvg-recentAvg >= 1.5) flags.push({label:"Recovery down", tone:"amber", detail:`Self-rated sleep/hydration averaged ${recentAvg.toFixed(1)}/10 the last 2 weeks, down from ${priorAvg.toFixed(1)}/10 the 2 weeks before.`, action:"Check in on sleep and stress load."});
    }

    // Consistency trend: check-in frequency dropping off, even before it
    // triggers the blunter "days since last check-in" flag above.
    const last7 = ch.filter(r=>daysSinceDate(r.date)<=6).length;
    const prior7 = ch.filter(r=>daysSinceDate(r.date)>6 && daysSinceDate(r.date)<=13).length;
    if(prior7>=4 && last7<=prior7-3) flags.push({label:"Logging slowing down", tone:"amber", detail:`Checked in ${last7}/7 days this week, down from ${prior7}/7 the week before.`, action:"Worth a quick check-in before this turns into a gap."});

    const severity = flags.reduce((s,f)=>s+(f.tone==="red"?2:1),0);
    const riskLevel = severity>=4 ? "High" : severity>=2 ? "Medium" : severity>=1 ? "Low" : "On Track";
    return {client:c, adh, last, since, flags, severity, riskLevel, goalScore};
  });

  const needs = assessed.filter(a=>a.flags.length>0).sort((a,b)=>b.severity-a.severity);
  const coached = assessed.filter(a=>!a.programOnly);
  const avgAdh = coached.length ? Math.round(coached.reduce((s,a)=>s+a.adh.score,0)/coached.length) : 0;
  const withGoalScore = coached.filter(a=>a.goalScore?.overallScore!=null);
  const avgGoalProgress = withGoalScore.length ? Math.round(withGoalScore.reduce((s,a)=>s+a.goalScore.overallScore,0)/withGoalScore.length) : null;

  // Weekly check-in messages/flags the coach should respond to, newest first.
  const nameOf = (id)=>{ const c=clients.find(x=>x.id===id); return c?(c.name||c.email):"Client"; };
  const markHandled = async(id)=>{
    setUpgrades(prev=>prev.filter(u=>u.id!==id));
    await supabase.from("upgrade_requests").update({status:"handled"}).eq("id",id);
  };
  const messages = weeklyRecent.filter(w=>daysSinceDate(w.date)<=13).map(w=>{
    const items=[];
    if((w.coach_questions||"").trim()) items.push({label:"Question",tone:"red",text:w.coach_questions});
    if((w.adjustments||"").trim()) items.push({label:"Wants adjusted",tone:"amber",text:w.adjustments});
    if(w.confidence_level!=null && w.confidence_level<=4) items.push({label:`Low confidence ${w.confidence_level}/10`,tone:"amber",text:w.biggest_challenge||w.mental_blocks||""});
    if((w.felt_weaker||"").trim()) items.push({label:"Felt weaker",tone:"amber",text:w.felt_weaker});
    return items.length?{id:w.client_id,date:w.date,items}:null;
  }).filter(Boolean).sort((a,b)=>a.date<b.date?1:-1);

  return (
    <div>
      <PageTitle title="Coach Dashboard" sub="V12 System · Priority overview"/>

      <CollapsibleSection title="All Clients" summary={`${coached.length} total`}>
        <ClientSelector clients={coached.map(a=>a.client)} selectedId={null} onSelect={openClient} showArchivedToggle={false}/>
      </CollapsibleSection>

      {messages.length>0 && (
        <CollapsibleSection title="💬 Client Messages & Flags" summary={`${messages.length} this period`}>
          <Card>
            <div style={{fontSize:11,color:S.muted,marginBottom:14}}>From weekly check-ins in the last 14 days — questions, requested adjustments, and red flags worth a reply.</div>
            {messages.map((m,i)=>(
              <div key={i} onClick={()=>openClient(m.id)}
                style={{background:S.surface,border:"1px solid "+S.border,borderLeft:"3px solid "+(m.items.some(x=>x.tone==="red")?"#c0392b":"#f5a623"),padding:"14px 18px",cursor:"pointer",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:12,marginBottom:8}}>
                  <div style={{fontWeight:600,fontSize:14}}>{nameOf(m.id)}</div>
                  <div style={{fontSize:11,color:S.muted}}>Week of {m.date}</div>
                </div>
                {m.items.map((it,j)=>(
                  <div key={j} style={{marginBottom:6}}>
                    <span style={{padding:"2px 8px",fontSize:10,fontWeight:600,marginRight:8,background:it.tone==="red"?"rgba(192,57,43,.16)":"rgba(245,158,11,.14)",color:it.tone==="red"?"#ff6b5b":"#f5a623"}}>{it.label}</span>
                    {it.text && <span style={{fontSize:13,color:S.text}}>{it.text.length>160?it.text.slice(0,160)+"…":it.text}</span>}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </CollapsibleSection>
      )}

      <div className="g4" style={{display:"grid",gridTemplateColumns:avgGoalProgress!=null?"repeat(5,1fr)":"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <Stat label="Total Clients" value={coached.length} unit=""/>
        <Stat label="Need Attention" value={needs.length} unit=""/>
        <Stat label="On Track" value={coached.length-needs.length} unit=""/>
        <Stat label="Avg Adherence" value={avgAdh} unit="%"/>
        {avgGoalProgress!=null && <Stat label="Avg Goal Progress" value={avgGoalProgress} unit="%"/>}
      </div>

      {upgrades.length>0 && (
        <CollapsibleSection title="💎 Upgrade Requests" summary={`${upgrades.length} pending`}>
          <Card style={{borderLeft:"3px solid "+S.neon}}>
            <div style={{fontSize:11,color:S.muted,marginBottom:14}}>Program-only clients who want to move to full coaching. Reach out, then mark handled.</div>
            {upgrades.map(u=>(
              <div key={u.id} style={{background:S.surface,border:"1px solid "+S.border,padding:"14px 18px",display:"flex",alignItems:"center",gap:16,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:S.neon,color:"#0A0A0B",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>
                  {avatarFrom(nameOf(u.client_id))}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14}}>{nameOf(u.client_id)}</div>
                  <div style={{fontSize:12,color:S.muted}}>Wants to upgrade to coaching · {(u.created_at||"").slice(0,10)}</div>
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <Btn sm teal onClick={()=>openClient(u.client_id)}>Open Client</Btn>
                  <Btn sm onClick={()=>markHandled(u.id)}>Mark handled</Btn>
                </div>
              </div>
            ))}
          </Card>
        </CollapsibleSection>
      )}

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <CardTitle>⚠ Needs Attention</CardTitle>
          <Btn sm teal onClick={()=>setPage("clients")}>Manage Clients</Btn>
        </div>
        {coached.length===0 && <div style={{color:S.muted,fontSize:13,padding:"16px 0"}}>No coaching clients yet. Share the app URL with your clients.</div>}
        {coached.length>0 && needs.length===0 && <div style={{color:S.accent2,fontSize:13,padding:"8px 0"}}>All clients are on track. Nice work.</div>}
        {needs.map(a=>{
          const open = expandedNeeds.has(a.client.id);
          return (
            <div key={a.client.id} style={{background:S.surface,border:"1px solid "+S.border,borderLeft:"3px solid "+(a.severity>=2?"#c0392b":"#f5a623"),marginBottom:10,overflow:"hidden"}}>
              <div onClick={()=>toggleNeeds(a.client.id)}
                style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:16,cursor:"pointer"}}>
                <span style={{fontSize:11,color:S.accent,flexShrink:0,display:"inline-block",transition:"transform .15s",transform:open?"rotate(90deg)":"none"}}>▶</span>
                <div style={{width:44,height:44,borderRadius:"50%",background:S.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>
                  {avatarFrom(a.client.name||a.client.email)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14}}>{a.client.name||a.client.email}</div>
                  <div style={{fontSize:12,color:S.muted}}>{a.client.goal||"No goal set"} · {a.last?`last check-in ${a.last}`:"never checked in"}</div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:"55%"}}>
                  <StatusBadge label={`${a.riskLevel} Risk`} tone={a.riskLevel==="High"?"red":a.riskLevel==="Medium"?"amber":"neutral"}/>
                  {a.flags.map((f,i)=><StatusBadge key={i} label={f.label} tone={f.tone==="red"?"red":"amber"}/>)}
                </div>
              </div>
              {open && (
                <div style={{padding:"0 18px 16px 74px"}}>
                  {a.flags.map((f,i)=>(
                    <div key={i} style={{fontSize:12,color:S.text,padding:"6px 0",borderTop:i===0?"1px solid "+S.border:"none",paddingTop:i===0?12:6}}>
                      <div><span style={{fontWeight:600,color:f.tone==="red"?"#ff6b5b":"#f5a623"}}>{f.label}.</span> {f.detail}</div>
                      {f.action && <div style={{color:S.muted,marginTop:2}}>→ {f.action}</div>}
                    </div>
                  ))}
                  <div style={{marginTop:10}}><Btn sm teal onClick={()=>openClient(a.client.id)}>Open in Clients →</Btn></div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

    </div>
  );
}

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

function MetricsDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState({ dms_sent: "", sales_conversations: "", calls_booked: "", clients_closed: "", active_clients: "", revenue_today: "", content_posted: false, content_created: false, content_recorded: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dateStr = todayStr();

  // Refreshes the rollup/trend rows only — never touches `today`. saveToday()
  // relies on this: `today` already holds exactly what was just submitted, so
  // re-deriving it from a refetch after save would race any typing done into
  // the form right after clicking Save and silently wipe it out (same class
  // of bug fixed in 7f744a3 for the client check-in forms).
  const loadRows = useCallback(async () => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const { data } = await supabase.from("daily_metrics").select("*").gte("date", cutoff.toISOString().split("T")[0]).order("date");
    setRows(data || []);
    return data || [];
  }, []);
  useEffect(() => {
    (async () => {
      const data = await loadRows();
      const t = data.find((r) => r.date === dateStr);
      if (t) setToday({ ...t });
      setLoading(false);
    })();
  }, [loadRows, dateStr]);

  const setF = (k, v) => setToday((p) => ({ ...p, [k]: v }));

  const saveToday = async () => {
    setSaving(true);
    await supabase.from("daily_metrics").upsert({
      date: dateStr,
      dms_sent: parseInt(today.dms_sent) || 0,
      sales_conversations: parseInt(today.sales_conversations) || 0,
      calls_booked: parseInt(today.calls_booked) || 0,
      clients_closed: parseInt(today.clients_closed) || 0,
      active_clients: today.active_clients === "" ? null : parseInt(today.active_clients),
      revenue_today: parseFloat(today.revenue_today) || 0,
      content_posted: !!today.content_posted,
      content_created: !!today.content_created,
      content_recorded: !!today.content_recorded,
    }, { onConflict: "date" });
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
  const badge = (status) => !status ? null : (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "3px 8px", marginLeft: 6,
      background: status === "Ahead" ? "rgba(0,201,167,.14)" : status === "On Track" ? "rgba(198,255,0,.14)" : status === "Red Flag" ? "#ff6b5b" : "rgba(255,107,91,.14)",
      color: status === "Ahead" ? S.accent2 : status === "On Track" ? S.neon : status === "Red Flag" ? "white" : "#ff6b5b" }}>{status}</span>
  );

  return (
    <div>
      <PageTitle title="Business + Content" sub="Daily outreach and content metrics, rolled up weekly" />
      <Card>
        <CardTitle>Today · {dateStr}</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 16 }}>
          <Fld label="DMs Sent"><Inp type="number" value={today.dms_sent} onChange={(e) => setF("dms_sent", e.target.value)} /></Fld>
          <Fld label="Sales Conversations"><Inp type="number" value={today.sales_conversations} onChange={(e) => setF("sales_conversations", e.target.value)} /></Fld>
          <Fld label="Calls Booked"><Inp type="number" value={today.calls_booked} onChange={(e) => setF("calls_booked", e.target.value)} /></Fld>
          <Fld label="Clients Closed"><Inp type="number" value={today.clients_closed} onChange={(e) => setF("clients_closed", e.target.value)} /></Fld>
          <Fld label="Active Clients"><Inp type="number" value={today.active_clients} onChange={(e) => setF("active_clients", e.target.value)} /></Fld>
          <Fld label="Revenue Today ($)"><Inp type="number" value={today.revenue_today} onChange={(e) => setF("revenue_today", e.target.value)} /></Fld>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
          {[["content_posted", "Content Posted"], ["content_created", "Content Created"], ["content_recorded", "Content Recorded"]].map(([k, label]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={!!today[k]} onChange={(e) => setF(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Btn onClick={saveToday} disabled={saving}>{saving ? "Saving..." : "Save Today"}</Btn>
          {saved && <span style={{ color: S.accent2, fontSize: 12, fontWeight: 600 }}>Saved!</span>}
        </div>
      </Card>
      <Card>
        <CardTitle>Weekly Rollup</CardTitle>
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 12 }}>Ahead / On Track / Behind / Red Flag, based on pace toward the weekly target for each metric.</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 640, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, color: S.muted }}>Week Of</th>
                {METRIC_KEYS.map((k) => (<th key={k} style={{ padding: "6px 10px", fontSize: 10, color: S.muted }}>{METRIC_LABEL[k]}</th>))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((wk) => {
                const list = byWeek[wk];
                return (
                  <tr key={wk}>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: S.text }}>
                      {wk}{wk === currentWeekStart && <span style={{ fontSize: 9, color: S.muted, marginLeft: 6 }}>(in progress, day {daysElapsedThisWeek}/7)</span>}
                    </td>
                    {METRIC_KEYS.map((k) => {
                      const total = sum(list, k);
                      return (
                        <td key={k} style={{ padding: "8px 10px", fontSize: 12, color: S.text, whiteSpace: "nowrap" }}>
                          {k === "revenue_today" ? `$${total.toFixed(0)}` : total}{badge(weekStatus(total, WEEKLY_TARGETS[k], daysElapsedFor(wk)))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:0}}>
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
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // null | "new" | email
  const [form, setForm] = useState(BLANK_ASSESSMENT);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
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
      {msg && <div style={{marginBottom:16,padding:"10px 16px",fontSize:12,fontWeight:600,background:msg.ok?"rgba(0,201,167,.14)":"rgba(192,57,43,.16)",color:msg.ok?S.accent2:"#ff6b5b"}}>{msg.text}</div>}
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
      {items.map(a=>(
        <Card key={a.email}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>{nameFor(a.email)||a.email}</div>
                <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:signedUp(a.email)?S.accent2:S.muted}}>{signedUp(a.email)?"Signed up":"Awaiting signup"}</span>
              </div>
              <div style={{fontSize:12,color:S.muted,marginTop:4}}>NS {a.nervous_system_recruitment??"—"} · MD {a.muscular_density_to_size??"—"} · MC {a.metabolic_work_capacity??"—"}{signedUp(a.email)?"":` · ${a.email}`}</div>
              {a.strengths && <div style={{fontSize:12,color:S.muted,marginTop:6,lineHeight:1.6}}><b style={{color:S.text}}>Strengths:</b> {a.strengths}</div>}
              {a.weaknesses && <div style={{fontSize:12,color:S.muted,marginTop:4,lineHeight:1.6}}><b style={{color:S.text}}>Weaknesses:</b> {a.weaknesses}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              <Btn sm teal onClick={()=>startEdit(a)}>Edit</Btn>
              <Btn sm danger onClick={()=>remove(a)}>Delete</Btn>
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
          background:msg.ok?"rgba(0,201,167,.14)":"rgba(192,57,43,.16)",color:msg.ok?S.accent2:"#ff6b5b"}}>{msg.text}</div>
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
  const [exercises, setExercises] = useState([]);
  const [program, setProgram] = useState(null);
  const [phaseHistory, setPhaseHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("exercises")
      .select("*")
      .eq("client_id", trainingOwnerId(profile))
      .order("order_index")
      .then(({ data }) => {
        setExercises(data || []);
        setLoading(false);
      });
    supabase
      .from("programs")
      .select("name,phase,phase_note")
      .eq("client_id", trainingOwnerId(profile))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setProgram(data || null));
    supabase
      .from("program_phase_history")
      .select("*")
      .eq("client_id", trainingOwnerId(profile))
      .order("changed_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setPhaseHistory(data || []));
  }, [profile.id, profile.shared_program_owner_id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  // Group into sequential "Day 1..N" folders (see groupByDay).
  const dayGroups = groupByDay(exercises);

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
      {exercises.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏋</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, marginBottom: 8 }}>No program yet</div>
          <div style={{ color: S.muted, fontSize: 13 }}>{profile.client_type === "program_only" ? "Your program will appear here once it's ready." : "Your coach will generate your program soon."}</div>
        </Card>
      ) : (
        dayGroups.map(({ day, exercises: dayExs, label }) => (
          <DayFolder key={day} title={label} meta={`${dayExs.length} exercise${dayExs.length > 1 ? "s" : ""}${dayExs[0]?.category ? ` · ${dayExs[0].category}` : ""}`}>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead>
                <tr>
                  {["Exercise", "Section", "Sets", "Reps", "Notes"].map((h) => (
                    <th key={h} style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: S.muted, textAlign: "left", padding: "8px 14px", borderBottom: "1px solid " + S.border }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayExs.map((ex) => (
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
            </div>
          </DayFolder>
        ))
      )}
      {exercises.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, margin: "0 2px 12px" }}>Workout Logging</div>
          <DayFolder title="Log Your Workouts" meta="Record your sets">
            <Workouts profile={profile} embedded />
          </DayFolder>
        </div>
      )}
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

function Shell({ profile, isCoach, logout, page, setPage, children }) {
  const programOnly = !isCoach && profile?.client_type === "program_only";
  return (
    <div style={{ minHeight: "100vh", background: S.bg, color: S.text }}>
      <TopBar profile={profile} isCoach={isCoach} onLogout={logout} />
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <Sidebar isCoach={isCoach} programOnly={programOnly} page={page} setPage={setPage} />
        <main className="main-content" style={{ flex: 1, minWidth: 0, padding: "28px 32px", maxWidth: 1180, width: "100%" }}>
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
      {page === "dashboard" && !programOnly && <ClientHome profile={profile} setPage={setPage} />}
      {page === "program" && <ClientProgram profile={profile} />}
      {page === "daily" && !programOnly && <DailyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "weekly" && !programOnly && <WeeklyCheckin profile={profile} onDone={() => setPage("dashboard")} />}
      {page === "progress" && (programOnly ? <ProgramProgress profile={profile} /> : <Progress profile={profile} />)}
      {page === "workouts" && <Workouts profile={profile} />}
      {page === "nutrition" && <Nutrition profile={profile} />}
      {page === "resources" && <Resources />}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// COACH — LEADS / CRM (in-app system of record; replaces Notion Lead Pipeline
// CRM, one-time backfill only, no live sync) + accept/reject on applications.
// ---------------------------------------------------------------------------
const LEAD_STATUSES = ["new", "applied", "accepted", "closed_lost", "follow_up_later", "price_objection", "not_ready"];
const LEAD_STATUS_LABEL = { new: "New", applied: "Applied", accepted: "Accepted", closed_lost: "Closed Lost", follow_up_later: "Follow-up Later", price_objection: "Price Objection", not_ready: "Not Ready" };
const REJECT_STATUSES = ["closed_lost", "follow_up_later", "price_objection", "not_ready"];
// Select-option vocab copied exactly from the live Notion "V12 Lead Pipeline
// — CRM" database (confirmed via the API 2026-07-17), so a lead logged here
// and one logged in Notion read the same way.
const CRM_GOAL_OPTIONS = ["Fat Loss", "Muscle Build", "Both", "Unknown"];
const CRM_CHANNEL_OPTIONS = ["TikTok", "Instagram", "Facebook", "Referral", "WhatsApp Cold", "Other"];
const CRM_STAGE_OPTIONS = ["New DM", "Qualifying", "Application Sent", "WhatsApp Moved", "Call Booked", "Call Done", "Closed Won", "Closed Lost", "Ghost"];
const CRM_RESPONSE_RATE_OPTIONS = ["Replied", "No Response", "Ghosted After Interest"];
const BLANK_MANUAL_LEAD = {
  name: "", email: "", goal: "", channel: "", stage: "New DM", response_rate: "",
  deal_value: "", follow_up_date: "", last_contact_date: "", notes: "",
  dm_opener_sent: false, application_submitted: false, call_booked: false, moved_to_whatsapp: false,
};

function CRMPanel() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dueOnly, setDueOnly] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [addForm, setAddForm] = useState(BLANK_MANUAL_LEAD);
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState(null);
  const setAddField = (k, v) => setAddForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Fire-and-forget push to the lead's Notion CRM page (created if it doesn't
  // exist yet) — never blocks or fails the coach's save on a Notion hiccup,
  // same contract as the intake-form sync.
  const syncToNotionCrm = (email, patch) => {
    if (!email) return;
    supabase.auth.getSession().then(({ data: { session } }) =>
      fetch("/api/sync-lead-to-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ email, patch }),
      })
    ).catch(() => {});
  };

  const updateLead = async (id, patch) => {
    const lead = leads.find((l) => l.id === id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await supabase.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    syncToNotionCrm(lead?.email, patch);
  };

  // Log a lead met via cold outreach (DM/social) that never touched the
  // in-app intake form — mirrors the fields on the Notion Lead Pipeline CRM
  // exactly so nothing needs re-entering by hand in either place.
  const addLead = async () => {
    if (!addForm.name.trim() || !addForm.email.trim()) {
      setAddMsg({ ok: false, text: "Name and email are required." });
      return;
    }
    setAdding(true); setAddMsg(null);
    const payload = {
      name: addForm.name.trim(), email: addForm.email.trim().toLowerCase(),
      goal: addForm.goal || null, channel: addForm.channel || null, stage: addForm.stage || null,
      response_rate: addForm.response_rate || null,
      deal_value: addForm.deal_value === "" ? null : Number(addForm.deal_value),
      follow_up_date: addForm.follow_up_date || null, last_contact_date: addForm.last_contact_date || null,
      notes: addForm.notes.trim() || null,
      dm_opener_sent: addForm.dm_opener_sent, application_submitted: addForm.application_submitted,
      call_booked: addForm.call_booked, moved_to_whatsapp: addForm.moved_to_whatsapp,
      source: "manual", status: "new",
    };
    const { error } = await supabase.from("leads").insert(payload);
    setAdding(false);
    if (error) { setAddMsg({ ok: false, text: error.message }); return; }
    setAddMsg({ ok: true, text: `${payload.name} added.` });
    setAddForm(BLANK_MANUAL_LEAD);
    syncToNotionCrm(payload.email, payload);
    await load();
  };

  // Accept: mark accepted and auto-link to an existing profile by email if one
  // already exists (they may have signed up before or after applying). If not,
  // leave client_id null — the coach sees "awaiting signup".
  const accept = async (lead) => {
    const { data: match } = await supabase.from("profiles").select("id").ilike("email", lead.email).maybeSingle();
    await updateLead(lead.id, { status: "accepted", client_id: match?.id || null });
  };
  const reject = async (lead, status) => updateLead(lead.id, { status });

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const today = todayStr();
  const dueCount = leads.filter((l) => l.follow_up_date && l.follow_up_date <= today).length;
  let filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter);
  if (dueOnly) filtered = filtered.filter((l) => l.follow_up_date && l.follow_up_date <= today);
  filtered = [...filtered].sort((a, b) => (a.follow_up_date || "9999") < (b.follow_up_date || "9999") ? -1 : 1);

  return (
    <div>
      <PageTitle title="Leads / CRM" sub="Applications and prospects — migrated one-time from Notion, no live sync" />

      <CollapsibleSection title="+ Add Lead" summary="log a cold-outreach contact">
        <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <Fld label="Name *"><Inp type="text" value={addForm.name} onChange={(e) => setAddField("name", e.target.value)} placeholder="Full name" /></Fld>
          <Fld label="Email *"><Inp type="email" value={addForm.email} onChange={(e) => setAddField("email", e.target.value)} placeholder="name@email.com" /></Fld>
          <Fld label="Goal"><RG options={CRM_GOAL_OPTIONS} value={addForm.goal} onChange={(v) => setAddField("goal", v)} /></Fld>
          <Fld label="Source"><RG options={CRM_CHANNEL_OPTIONS} value={addForm.channel} onChange={(v) => setAddField("channel", v)} /></Fld>
          <Fld label="Stage"><RG options={CRM_STAGE_OPTIONS} value={addForm.stage} onChange={(v) => setAddField("stage", v)} /></Fld>
          <Fld label="Response Rate"><RG options={CRM_RESPONSE_RATE_OPTIONS} value={addForm.response_rate} onChange={(v) => setAddField("response_rate", v)} /></Fld>
          <Fld label="Deal Value ($)"><Inp type="number" value={addForm.deal_value} onChange={(e) => setAddField("deal_value", e.target.value)} placeholder="e.g. 1500" /></Fld>
          <Fld label="Follow-up Date"><Inp type="date" value={addForm.follow_up_date} onChange={(e) => setAddField("follow_up_date", e.target.value)} /></Fld>
          <Fld label="Last Contact Date"><Inp type="date" value={addForm.last_contact_date} onChange={(e) => setAddField("last_contact_date", e.target.value)} /></Fld>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "4px 0 16px" }}>
          {[["dm_opener_sent", "DM Opener Sent"], ["application_submitted", "Application Submitted"], ["call_booked", "Call Booked"], ["moved_to_whatsapp", "Moved to WhatsApp"]].map(([k, label]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={addForm[k]} onChange={(e) => setAddField(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <Fld label="Notes"><textarea rows={2} value={addForm.notes} onChange={(e) => setAddField("notes", e.target.value)}
          style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }} /></Fld>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Btn onClick={addLead} disabled={adding}>{adding ? "Adding..." : "Add Lead"}</Btn>
          <Alert variant={addMsg?.ok ? "success" : "error"}>{addMsg?.text}</Alert>
        </div>
      </CollapsibleSection>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {["all", ...LEAD_STATUSES].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + (filter === s ? S.accent : S.border), background: filter === s ? "rgba(255,77,0,.08)" : "transparent", color: filter === s ? S.accent : S.muted }}>
            {s === "all" ? "All" : LEAD_STATUS_LABEL[s]} {s !== "all" && `(${leads.filter((l) => l.status === s).length})`}
          </button>
        ))}
        <button onClick={() => setDueOnly((v) => !v)}
          style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + (dueOnly ? "#ff6b5b" : S.border), background: dueOnly ? "rgba(255,107,91,.1)" : "transparent", color: dueOnly ? "#ff6b5b" : S.muted }}>
          📅 Due for follow-up ({dueCount})
        </button>
      </div>
      {filtered.length === 0 ? <div style={{ color: S.muted, fontSize: 13 }}>No leads in this view.</div> : filtered.map((lead) => (
        <Card key={lead.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{lead.name || lead.email}</div>
              <div style={{ fontSize: 12, color: S.muted }}>{lead.email} · {lead.source} · {(lead.created_at || "").slice(0, 10)}</div>
              {lead.follow_up_date && (
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: lead.follow_up_date <= today ? "#ff6b5b" : S.neon }}>
                  📅 Follow up {lead.follow_up_date}{lead.follow_up_date <= today ? " · Due" : ""}
                </div>
              )}
            </div>
            <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, padding: "4px 10px", background: S.surface2, color: S.accent }}>{LEAD_STATUS_LABEL[lead.status] || lead.status}</span>
          </div>
          {expanded === lead.id && (
            <div style={{ marginTop: 16, borderTop: "1px solid " + S.border, paddingTop: 16 }}>
              {lead.height && <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>Height: {lead.height}</div>}
              {lead.intake_data?.packageInterest && <div style={{ fontSize: 12, color: S.text, marginBottom: 8 }}>Package: <strong>{lead.intake_data.packageInterest}</strong></div>}
              {lead.intake_data && (
                <details style={{ marginBottom: 12 }}>
                  <summary style={{ fontSize: 12, color: S.muted, cursor: "pointer" }}>Full intake data</summary>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {Object.entries(lead.intake_data)
                      .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
                      .map(([k, v]) => (
                        <div key={k} style={{ fontSize: 13, color: S.text, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ color: S.muted, minWidth: 180 }}>{INTAKE_FIELDS.find((f) => f.key === k)?.label || k}</span>
                          <span>{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                        </div>
                      ))}
                  </div>
                </details>
              )}
              {(lead.status === "new" || lead.status === "applied") && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <Btn onClick={() => { if (window.confirm(`Accept ${lead.name || lead.email}?`)) accept(lead); }}>Accept</Btn>
                  {REJECT_STATUSES.map((s) => (
                    <button key={s} onClick={() => { if (window.confirm(`Mark ${lead.name || lead.email} as "${LEAD_STATUS_LABEL[s]}"?`)) reject(lead, s); }}
                      style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}>
                      {LEAD_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
              {lead.status === "accepted" && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: lead.client_id ? S.accent2 : S.muted, marginBottom: 12 }}>
                    {lead.client_id ? "Linked to client record" : "Awaiting signup — links automatically once they sign up with this email"}
                  </div>
                  <Fld label="Manual PayPal invoice link">
                    <Inp defaultValue={lead.invoice_link || ""} placeholder="https://paypal.me/..."
                      onChange={(e) => setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, invoice_link: e.target.value } : l)))}
                      onBlur={(e) => updateLead(lead.id, { invoice_link: e.target.value })} />
                  </Fld>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <Btn onClick={() => updateLead(lead.id, { invoice_sent_at: new Date().toISOString() })}>{lead.invoice_sent_at ? "Invoice marked sent ✓" : "Mark invoice sent"}</Btn>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!lead.paid} onChange={(e) => updateLead(lead.id, { paid: e.target.checked })} /> Paid
                    </label>
                  </div>
                </div>
              )}
              <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 4 }}>
                <Fld label="Stage"><RG options={CRM_STAGE_OPTIONS} value={lead.stage || ""} onChange={(v) => updateLead(lead.id, { stage: v })} /></Fld>
                <Fld label="Source"><RG options={CRM_CHANNEL_OPTIONS} value={lead.channel || ""} onChange={(v) => updateLead(lead.id, { channel: v })} /></Fld>
                <Fld label="Response Rate"><RG options={CRM_RESPONSE_RATE_OPTIONS} value={lead.response_rate || ""} onChange={(v) => updateLead(lead.id, { response_rate: v })} /></Fld>
                <Fld label="Deal Value ($)">
                  <Inp type="number" defaultValue={lead.deal_value ?? ""} placeholder="e.g. 1500"
                    onBlur={(e) => updateLead(lead.id, { deal_value: e.target.value === "" ? null : Number(e.target.value) })} />
                </Fld>
                <Fld label="Follow-up Date">
                  <Inp type="date" value={lead.follow_up_date || ""} onChange={(e) => updateLead(lead.id, { follow_up_date: e.target.value || null })} />
                </Fld>
                <Fld label="Last Contact Date">
                  <Inp type="date" value={lead.last_contact_date || ""} onChange={(e) => updateLead(lead.id, { last_contact_date: e.target.value || null })} />
                </Fld>
              </div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "4px 0 16px" }}>
                {[["dm_opener_sent", "DM Opener Sent"], ["application_submitted", "Application Submitted"], ["call_booked", "Call Booked"], ["moved_to_whatsapp", "Moved to WhatsApp"]].map(([k, label]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!lead[k]} onChange={(e) => updateLead(lead.id, { [k]: e.target.checked })} /> {label}
                  </label>
                ))}
              </div>
              <Fld label="Notes">
                <textarea defaultValue={lead.notes || ""} rows={2}
                  onChange={(e) => setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, notes: e.target.value } : l)))}
                  onBlur={(e) => updateLead(lead.id, { notes: e.target.value })}
                  style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              </Fld>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function CoachDashboard({ profile, logout }) {
  const [page, setPage] = useState("dashboard");
  // Set right before switching to "clients" when the coach clicked a specific
  // client elsewhere (Home's client list, flags, messages, upgrade requests) —
  // ClientDetailPage consumes it once on mount so it opens straight to that
  // client instead of falling back to whichever is first in the roster.
  const [openClientId, setOpenClientId] = useState(null);
  const openClient = (id) => { setOpenClientId(id); setPage("clients"); };

  return (
    <Shell profile={profile} isCoach={true} logout={logout} page={page} setPage={setPage}>
      {page === "dashboard" && <CoachHome setPage={setPage} openClient={openClient} />}
      {page === "clients" && <ClientDetailPage initialClientId={openClientId} onInitialClientOpened={() => setOpenClientId(null)} />}
      {page === "crm" && <CRMPanel />}
      {page === "metrics" && <MetricsDashboard />}
      {page === "assess" && <AssessmentsPanel />}
      {page === "templates" && <TemplatesPanel />}
      {page === "library" && <ResourcesPanel />}
    </Shell>
  );
}
