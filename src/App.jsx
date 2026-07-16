import { useState, useEffect, useRef, useCallback } from "react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";



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

// True when the viewport is at the mobile breakpoint, so components can swap a
// dense desktop table for a stacked card layout. Mirrors the 720px CSS query.
function useIsMobile() {
  const query = "(max-width: 720px)";
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  return mobile;
}

// TRAINING (programs + exercises + program_versions) can be SHARED between
// linked training partners: a client's `shared_program_owner_id` points at the
// partner who owns the shared training rows. Pass a profile/client row and get
// back the id whose training rows it should read/write. Nutrition, workout
// logs, check-ins, and photos always use the client's OWN id — never this.
const trainingOwnerId = (p) => p?.shared_program_owner_id || p?.id;

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
      /* Portrait-first: never let content force a horizontal scroll. */
      html, body { max-width: 100%; overflow-x: hidden; }
      body { margin: 0; background: ${S.bg}; color: ${S.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      img { max-width: 100%; }
      .spinner { width: 32px; height: 32px; border-radius: 50%;
        border: 3px solid ${S.border}; border-top-color: ${S.accent};
        animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      input[type="range"] { width: 100%; accent-color: ${S.accent}; }
      @media (max-width: 720px) {
        /* Collapse the left sidebar into a fixed bottom tab bar. These need
           !important: the <nav> and its items carry inline styles, which
           otherwise beat plain stylesheet rules even inside a media query. */
        .sidebar { position: fixed !important; bottom: 0; left: 0; right: 0; top: auto !important;
          width: 100% !important; height: 58px !important; flex-shrink: 0;
          padding: 0 !important; border-right: none !important; border-top: 1px solid #333;
          overflow-x: auto !important; overflow-y: hidden !important; z-index: 999; }
        .sidebar-inner { display: flex !important; flex-direction: row; width: 100%;
          align-items: stretch; padding: 0 !important; }
        .sidebar-heading { display: none !important; }
        /* flex:1 1 0 + min-width:0 lets all tabs share the width evenly and shrink
           to fit (no horizontal scroll); the label truncates instead of spilling
           into its neighbour, which is what made the client's 9 tabs overlap. */
        .sidebar-item { flex: 1 1 0; min-width: 0; flex-direction: column !important;
          justify-content: center; gap: 3px !important; font-size: 9px !important;
          padding: 7px 3px !important; margin-bottom: 0 !important; text-align: center;
          white-space: nowrap; border-radius: 0 !important; overflow: hidden; }
        /* display:block is required — an inline <span> ignores max-width/overflow,
           so without it the label text spills past its column and overlaps the
           neighbouring tabs. */
        .sidebar-label { display: block; width: 100%; max-width: 100%; overflow: hidden;
          text-overflow: ellipsis; line-height: 1.1; }
        .main-content { padding: 18px 16px 84px !important; }
        .topbar { padding: 0 14px !important; }
        .card { padding: 16px !important; }
        .g4 { grid-template-columns: repeat(2, 1fr) !important; }
        .g2, .g3, .cg { grid-template-columns: 1fr !important; }
        table { font-size: 12px; }
      }
    `}</style>
  );
}



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


// Field list mirrors the Notion Applications Database (api/_lib/notion.js PROP
// map) plus the new required height field. Config-driven so adding/removing a
// field doesn't require new JSX per field.
const INTAKE_FIELDS = [
  { key: "name", label: "Full Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "height", label: "Height", type: "text", ph: "e.g. 5'10\"", required: true },
  { key: "packageInterest", label: "Which package are you interested in?", type: "select", options: ["1-on-1 Coaching", "Program Only (self-guided)", "Not sure yet"] },
  { key: "budget", label: "What's your monthly budget range?", type: "select", options: ["Under $100", "$100-$250", "$250-$500", "$500+", "Not sure yet"] },
  { key: "goal", label: "Primary Goal", type: "text" },
  { key: "daysAvailable", label: "Days Available / Week", type: "text" },
  { key: "experienceLevel", label: "Training Experience", type: "text" },
  { key: "equipment", label: "Where will you primarily train?", type: "text" },
  { key: "homeEquipment", label: "If you train at home, what equipment do you have?", type: "text" },
  { key: "sessionLength", label: "Time available per session", type: "text" },
  { key: "age", label: "Age", type: "number" },
  { key: "currentWeight", label: "Current Weight (lb)", type: "number" },
  { key: "targetChange", label: "Target Change (lb)", type: "number" },
  { key: "activityLevel", label: "Daily Activity Level", type: "text" },
  { key: "sleepHours", label: "Average Sleep (hrs/night)", type: "number" },
  { key: "trainingTenure", label: "How long have you trained consistently?", type: "text" },
  { key: "nutritionConsistency", label: "Nutrition Consistency", type: "text" },
  { key: "coachingStyle", label: "Coaching Style Preference", type: "text" },
  { key: "commitmentLevel", label: "Commitment Level (1-10)", type: "number" },
  { key: "confidence", label: "Confidence in following a 12-week program (1-10)", type: "number" },
  { key: "pastBarriers", label: "What has prevented you from reaching your goal before?", type: "textarea" },
  { key: "pastStruggles", label: "Past Struggles", type: "textarea" },
  { key: "whyNow", label: "Why Now?", type: "textarea" },
  { key: "dietaryPreference", label: "Dietary Preference", type: "text" },
  { key: "allergies", label: "Allergies", type: "text" },
  { key: "calorieTarget", label: "Calorie Target (optional)", type: "number" },
  { key: "injuryFlags", label: "Injuries / Limitations (comma-separated)", type: "text" },
  { key: "healthFlags", label: "Health Conditions (comma-separated)", type: "text" },
];

// Seeded from the Task-1 audit of the Assessment Form Database (sparse: None /
// Knee / Deep squats) plus common categories — adjustable later, low-risk.
const INJURY_MULTISELECT_OPTIONS = {
  currentInjuries: ["None", "Knee", "Shoulder", "Back/Spine", "Hip", "Ankle", "Wrist/Elbow", "Other"],
  previousInjuries: ["None", "Knee", "Shoulder", "Back/Spine", "Hip", "Ankle", "Wrist/Elbow", "Other"],
  painTriggers: ["None", "Deep squats", "Overhead movements", "Running/Impact", "Prolonged sitting", "Heavy loading", "Other"],
};

function MultiSelectChips({ label, options, values, onChange }) {
  const toggle = (opt) => onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid " + (values.includes(opt) ? S.accent : S.border), background: values.includes(opt) ? "rgba(255,77,0,.1)" : "transparent", color: values.includes(opt) ? S.accent : S.muted }}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// Public intake application — reachable from LoginScreen without an account.
// Writes to the `leads` table (shared with the in-app CRM + accept/reject flow)
// with source="intake_form", status="applied".
function IntakeForm({ onDone }) {
  const [form, setForm] = useState({});
  const [currentInjuries, setCurrentInjuries] = useState([]);
  const [previousInjuries, setPreviousInjuries] = useState([]);
  const [painTriggers, setPainTriggers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setError("");
    if (!form.name || !form.email || !form.height) { setError("Name, email, and height are required."); return; }
    setSaving(true);
    const { error } = await supabase.from("leads").insert({
      email: form.email.toLowerCase(),
      name: form.name,
      height: form.height,
      source: "intake_form",
      status: "applied",
      intake_data: { ...form, currentInjuries, previousInjuries, painTriggers },
    });
    setSaving(false);
    if (error) setError(error.message); else setDone(true);
  };

  if (done) return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, marginBottom: 8 }}>Application received</div>
      <div style={{ color: S.muted, fontSize: 13, marginBottom: 16 }}>We'll review it and follow up soon.</div>
      <button onClick={onDone} style={{ ...bS({ padding: "10px 20px" }), background: "transparent", border: "1px solid " + S.border, color: S.text }}>Back to sign in</button>
    </div>
  );

  return (
    <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
      {INTAKE_FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.muted, marginBottom: 6 }}>{f.label}{f.required ? " *" : ""}</div>
          {f.type === "textarea" ? (
            <textarea value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} rows={2}
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          ) : f.type === "select" ? (
            <select value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }}>
              <option value="">— Select —</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type} value={form[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.ph || ""}
              style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "12px 14px", fontSize: 14, outline: "none" }} />
          )}
        </div>
      ))}
      <MultiSelectChips label="Current Injuries" options={INJURY_MULTISELECT_OPTIONS.currentInjuries} values={currentInjuries} onChange={setCurrentInjuries} />
      <MultiSelectChips label="Previous Injuries" options={INJURY_MULTISELECT_OPTIONS.previousInjuries} values={previousInjuries} onChange={setPreviousInjuries} />
      <MultiSelectChips label="Pain Triggers" options={INJURY_MULTISELECT_OPTIONS.painTriggers} values={painTriggers} onChange={setPainTriggers} />
      {error && <div style={{ color: S.accent, fontSize: 12, marginBottom: 12 }}>{error}</div>}
      <button onClick={submit} disabled={saving}
        style={{ ...bS({ width: "100%", padding: 14 }), background: S.accent, color: "white", opacity: saving ? 0.5 : 1 }}>
        {saving ? "Submitting..." : "Submit Application"}
      </button>
    </div>
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, client_id: data.user.id }),
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
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 25% 50%,rgba(255,77,0,.13) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(0,201,167,.07) 0%,transparent 50%)"}}/>
      <div style={{position:"relative",zIndex:1,background:S.surface,border:"1px solid "+S.border,padding:"48px 40px",width:420,maxWidth:"95vw"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:56,color:S.accent,lineHeight:1}}>V12</div>
        <div style={{fontSize:11,letterSpacing:3,color:S.muted,textTransform:"uppercase",marginBottom:36,marginTop:2}}>System · Client Portal</div>
        <div style={{display:"flex",border:"1px solid "+S.border,marginBottom:28}}>
          {["signin","signup","apply"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);setError("");setSuccess("");}}
              style={{flex:1,padding:10,fontSize:12,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",cursor:"pointer",border:"none",background:tab===t?S.accent:"transparent",color:tab===t?"white":S.muted}}>
              {t==="signin"?"Sign In":t==="signup"?"Create Account":"Apply"}
            </button>
          ))}
        </div>
        {tab==="apply" ? (
          <IntakeForm onDone={()=>setTab("signin")} />
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

// Shown after the client follows the emailed password-reset link. Supabase has
// already established a short-lived recovery session, so updateUser is all that's
// needed to set the new password; on success we drop them into the app.
function ResetPasswordScreen({ onDone }) {
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
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 25% 50%,rgba(255,77,0,.13) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(0,201,167,.07) 0%,transparent 50%)"}}/>
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
    ? [{id:"program",icon:"📋",label:"Training Plan",short:"Plan"},{id:"nutrition",icon:"🥗",label:"Nutrition",short:"Meals"},{id:"habits",icon:"🎯",label:"Daily Habits",short:"Habits"},{id:"progress",icon:"📈",label:"Progress",short:"Progress"},{id:"resources",icon:"📚",label:"Library",short:"Library"}]
    : [{id:"dashboard",icon:"⚡",label:"Dashboard",short:"Home"},{id:"program",icon:"📋",label:"Training Plan",short:"Plan"},{id:"nutrition",icon:"🥗",label:"Nutrition",short:"Meals"},{id:"daily",icon:"✅",label:"Daily Check-In",short:"Daily"},{id:"weekly",icon:"🔥",label:"Weekly Check-In",short:"Weekly"},{id:"habits",icon:"🎯",label:"Habits",short:"Habits"},{id:"progress",icon:"📈",label:"Progress",short:"Progress"},{id:"resources",icon:"📚",label:"Library",short:"Library"}];
  const nav = isCoach
    ? [{id:"dashboard",icon:"⚡",label:"Overview",short:"Home"},{id:"clients",icon:"👥",label:"Clients",short:"Clients"},{id:"crm",icon:"📇",label:"Leads / CRM",short:"Leads"},{id:"metrics",icon:"📊",label:"Business + Content",short:"Metrics"},{id:"assess",icon:"🧭",label:"Assessments",short:"Assess"},{id:"templates",icon:"📋",label:"Templates",short:"Plans"},{id:"library",icon:"📚",label:"Library",short:"Library"},{id:"progress",icon:"📈",label:"Progress",short:"Progress"}]
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

const Card = ({children,style}) => <div className="card" style={{background:S.surface,border:"1px solid "+S.border,padding:24,marginBottom:20,...style}}>{children}</div>;
const CardTitle = ({children}) => <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:16}}>{children}</div>;
const PageTitle = ({title,sub}) => <><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:38,lineHeight:1,marginBottom:4}}>{title}</div><div style={{fontSize:13,color:S.muted,marginBottom:28}}>{sub}</div></>;
const Stat = ({label,value,unit}) => (
  <div style={{background:S.surface,border:"1px solid "+S.border,padding:20}}>
    <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:6}}>{label}</div>
    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,lineHeight:1}}>{value}<span style={{fontSize:13,color:S.muted}}>{unit}</span></div>
  </div>
);
const Fld = ({label,children}) => <div style={{marginBottom:16}}><label style={{display:"block",fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:6}}>{label}</label>{children}</div>;

// Client-visible message from the coach (profiles.coach_message). Read-only for
// the client; edited by the coach in ClientsPanel. Fetches the latest value so
// a coach edit shows without the client re-logging in. Renders nothing when the
// field is blank. Placed at the top of the Dashboard and the Training Plan.
function CoachMessage({ profile }) {
  const [msg, setMsg] = useState(profile?.coach_message || "");
  useEffect(() => {
    let alive = true;
    supabase.from("profiles").select("coach_message").eq("id", profile.id).maybeSingle()
      .then(({ data }) => { if (alive) setMsg(data?.coach_message || ""); });
    return () => { alive = false; };
  }, [profile.id]);
  if (!msg.trim()) return null;
  return (
    <Card style={{ borderLeft: "3px solid " + S.accent2, marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: S.accent2, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span>💬</span> Message from your coach
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: S.text, whiteSpace: "pre-wrap" }}>{msg}</div>
    </Card>
  );
}
const Inp = (props) => <input {...props} style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",...props.style}}/>;

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

// Collapsible "folder" for grouping content by training day. Closed by default;
// clicking the header row toggles it. Shared by the client Training Plan and the
// coach exercise editor so a multi-day program reads as folders, not one long list.
function DayFolder({ title, meta, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: S.surface, border: "1px solid " + S.border, marginBottom: 12 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: open ? S.surface2 : "transparent", border: "none", cursor: "pointer", padding: "15px 18px", textAlign: "left", color: S.text }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: S.accent, flexShrink: 0, display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          {meta && <span style={{ fontSize: 11, color: S.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{meta}</span>}
        </span>
        <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.muted, flexShrink: 0 }}>{open ? "Hide" : "Open"}</span>
      </button>
      {open && <div style={{ padding: "16px 18px 18px" }}>{children}</div>}
    </div>
  );
}

// Group exercises by training day, returned as {day, exercises, label} ordered
// Monday→Sunday with "Unscheduled" last. `label` is a schedule-agnostic sequential
// "Day 1..N" (positional, so a Mon/Wed/Fri plan reads Day 1/2/3, not 1/3/5); the
// underlying day_of_week is untouched. Shared by the client plan + coach editor.
function groupByDay(list) {
  const byDay = {};
  for (const ex of list) {
    const k = ex.day_of_week || "Unscheduled";
    (byDay[k] = byDay[k] || []).push(ex);
  }
  let n = 0;
  return Object.keys(byDay)
    .sort((a, b) => {
      const ia = DAY_ORDER.indexOf(a), ib = DAY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((day) => ({ day, exercises: byDay[day], label: day === "Unscheduled" ? "Unscheduled" : `Day ${++n}` }));
}

// Strength-progress grouping. The coach-set exercise_type wins; otherwise the
// group is auto-detected from the free-text section/category/name. Warm-ups are
// surfaced so the Strength tab can exclude them (they belong in the workout log).
const EX_TYPES = ["Compound", "Accessory", "Circuit", "Warmup"];
function strengthGroupOf(ex) {
  const explicit = (ex?.exercise_type || "").trim().toLowerCase();
  if (explicit) {
    const m = EX_TYPES.find((t) => t.toLowerCase() === explicit);
    if (m) return m;
  }
  const hay = `${ex?.section || ""} ${ex?.category || ""} ${ex?.name || ""}`.toLowerCase();
  if (/warm|mobility|activation|stretch/.test(hay)) return "Warmup";
  if (/condition|circuit|finish|metcon|interval|cardio|amrap|emom|sprint/.test(hay)) return "Circuit";
  if (/primary|main|compound|strength|powerlifting/.test(hay)) return "Compound";
  return "Accessory";
}

// Parse a free-text time entry ("1:30", "90", "45s") to seconds, for graphing.
function parseTimeSec(t) {
  if (t == null) return null;
  const s = String(t).trim();
  if (!s) return null;
  if (s.includes(":")) return s.split(":").reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}
// Seconds -> "m:ss" (or "45s" under a minute).
function fmtSec(sec) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

// Adherence over a trailing window: % of days with a daily check-in, plus the
// training-completion rate among those check-ins. Shared by client + coach views.
// The denominator scales to how long the client has actually been active (from
// their first check-in), capped at the window — so a client one day in who
// checked in reads 100%, not 1/30 (≈3%).
function adherenceFrom(checkins, days = 30) {
  const all = checkins || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cut = cutoff.toISOString().split("T")[0];
  const recent = all.filter((c) => c.date >= cut);
  const checkinDays = new Set(recent.map((c) => c.date)).size;
  const completed = recent.filter((c) => c.workout === "completed").length;
  const today = todayStr();
  const firstEver = all.length ? all.reduce((m, c) => (c.date < m ? c.date : m), today) : today;
  const elapsed = Math.floor((new Date(today) - new Date(firstEver)) / 86400000) + 1;
  const denom = Math.max(1, Math.min(days, elapsed));
  return {
    score: Math.min(100, Math.round((checkinDays / denom) * 100)),
    checkinDays,
    days: denom,
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
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      const {data:ci} = await supabase.from("daily_checkins").select("*").eq("client_id",profile.id).order("date");
      setCheckins(ci||[]);
      const ws = (()=>{const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().split("T")[0];})();
      const {data:wc} = await supabase.from("weekly_checkins").select("id").eq("client_id",profile.id).eq("date",ws).maybeSingle();
      setWeeklyDone(!!wc);
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

  return (
    <div>
      <PageTitle title={"Welcome back, "+((profile.name||"").split(" ")[0]||"Athlete")+"."} sub={profile.goal||"Keep pushing."}/>
      <CoachMessage profile={profile} />
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
  const [form, setForm] = useState({weight:"",sleep:7,energy:7,mood:7,water:8,diet:"On track",workout:"completed",calories:"",protein_g:"",carbs_g:"",fats_g:""});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existing, setExisting] = useState(null);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(()=>{
    supabase.from("daily_checkins").select("*").eq("client_id",profile.id).eq("date",todayStr()).maybeSingle()
      .then(({data})=>{if(data){setExisting(data);setForm({weight:data.weight||"",sleep:data.sleep,energy:data.energy,mood:data.mood,water:data.water,diet:data.diet,workout:data.workout,calories:data.calories??"",protein_g:data.protein_g??"",carbs_g:data.carbs_g??"",fats_g:data.fats_g??""});}});
  },[profile.id]);

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
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  // Numeric columns — coerced to number|null on save so empty inputs don't
  // hit non-numeric Postgres columns.
  const NUMERIC = ["bodyweight","waist","chest","hips","arms","week_number","training_days","nutrition_compliance","sleep_quality","hydration_quality","discipline_level","confidence_level","goal_progress","feeling"];

  useEffect(()=>{
    (async()=>{
      const {data} = await supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).eq("date",weekStart).maybeSingle();
      if(data){ setExisting(data); setForm(f=>{const next={...f};Object.keys(f).forEach(k=>{if(data[k]!=null)next[k]=data[k];});return next;}); return; }
      // No entry yet this week — prefill the stable measurements from the most
      // recent prior check-in (and bump the week number) so the client only
      // updates what changed instead of re-typing everything.
      const {data:prev} = await supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).lt("date",weekStart).order("date",{ascending:false}).limit(1).maybeSingle();
      if(prev){ setForm(f=>({...f, bodyweight:prev.bodyweight??"", waist:prev.waist??"", chest:prev.chest??"", hips:prev.hips??"", arms:prev.arms??"", week_number:prev.week_number!=null?String(Number(prev.week_number)+1):""})); }
    })();
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

function Progress({ profile, coachView }) {
  const [tab, setTab] = useState("weight");
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [target, setTarget] = useState(null);

  useEffect(()=>{
    supabase.from("daily_checkins").select("*").eq("client_id",profile.id).order("date").then(({data})=>setDaily(data||[]));
    supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).order("date").then(({data})=>setWeekly((data||[]).map((w,i)=>({...w,week:"Wk"+(i+1)}))));
    supabase.from("habits").select("*").eq("client_id",profile.id).eq("active",true).order("order_index").then(({data})=>setHabits(data||[]));
    // Active nutrition-plan macro targets, for the calorie/macro reference lines.
    supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id",profile.id).eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data})=>setTarget(data||null));
    // Last 30 days of habit completions, for the coach-visible adherence grid.
    const cut = (()=>{const d=new Date();d.setDate(d.getDate()-29);return d.toISOString().split("T")[0];})();
    supabase.from("habit_logs").select("*").eq("client_id",profile.id).gte("date",cut).then(({data})=>setHabitLogs(data||[]));
  },[profile.id]);

  const empty = <Card style={{textAlign:"center",padding:40,color:S.muted}}>No data yet. Complete check-ins to see charts.</Card>;
  const emptyWeekly = <Card style={{textAlign:"center",padding:40,color:S.muted}}>No weekly check-ins yet. Submit a Weekly Check-In to see this chart.</Card>;
  const ts = (id) => ({padding:"10px 20px",fontSize:11,letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:600,cursor:"pointer",color:tab===id?S.accent:S.muted,background:"none",border:"none",borderBottom:tab===id?"2px solid "+S.accent:"2px solid transparent"});
  const adh = adherenceFrom(daily,30);
  const nut = nutritionScoreFrom(daily,30);
  // Bodyweight comes from either the daily check-in (weight) or the weekly
  // check-in (bodyweight); merge both into one series by date so neither source
  // is lost. Daily wins when both exist on the same date.
  const weightSeries = (()=>{
    const byDate = {};
    daily.forEach(d=>{ if(d.weight!=null) byDate[d.date]={date:d.date,weight:d.weight}; });
    weekly.forEach(w=>{ if(w.bodyweight!=null && byDate[w.date]==null) byDate[w.date]={date:w.date,weight:w.bodyweight}; });
    return Object.values(byDate).sort((a,b)=>a.date<b.date?-1:1);
  })();
  const lastWeight = weightSeries.length?weightSeries[weightSeries.length-1].weight:null;

  return (
    <div>
      <PageTitle title="Progress" sub="Your data over time"/>
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <Stat label="Adherence (30d)" value={adh.score} unit="%"/>
        <Stat label="Nutrition (30d)" value={nut.score??"—"} unit={nut.score!=null?"%":""}/>
        <Stat label="Training Completion" value={adh.trainingRate} unit="%"/>
        <Stat label="Current Weight" value={lastWeight??"—"} unit={lastWeight?"lb":""}/>
      </div>
      {coachView && <ClientSummaries profile={profile}/>}
      <div style={{display:"flex",borderBottom:"1px solid "+S.border,marginBottom:24,flexWrap:"wrap"}}>
        {[["weight","Weight"],["wellness","Wellness"],["measurements","Measurements"],["strength","Strength"],["habits","Habits"],...(coachView?[["notes","Check-in Notes"]]:[]),["photos","Photos"],["goals","Goals"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={ts(id)}>{label}</button>
        ))}
      </div>

      {tab==="weight" && (daily.length===0&&weightSeries.length===0?empty:(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <CC title="Bodyweight Trend" sub="Daily + weekly check-ins">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightSeries.slice(-30)}>
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

      {tab==="wellness" && (daily.length===0?empty:(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {[["energy",S.accent,"Energy"],["sleep",S.accent2,"Sleep Quality"],["mood","#8B5CF6","Mood"],["water","#3B82F6","Water (glasses)"]].map(([key,color,label])=>(
            <CC key={key} title={label} sub="14-day trend">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={3}/>
                  <YAxis domain={[0,key==="water"?16:10]} tick={{fontSize:10,fill:"#666"}}/>
                  <Tooltip {...TT}/>
                  <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{r:2}}/>
                </LineChart>
              </ResponsiveContainer>
            </CC>
          ))}
          {daily.some(d=>d.calories!=null) && (
            <CC title="Calories" sub={target?.calories!=null?`14-day trend · target ${target.calories} kcal`:"14-day trend"}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={3}/>
                  <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                  <Tooltip {...TT}/>
                  {target?.calories!=null && <ReferenceLine y={target.calories} stroke={S.muted} strokeDasharray="4 4" label={{value:"Target",fontSize:9,fill:S.muted,position:"insideTopRight"}}/>}
                  <Line type="monotone" dataKey="calories" stroke={S.accent} strokeWidth={2} dot={{r:2}} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
            </CC>
          )}
          {daily.some(d=>d.protein_g!=null||d.carbs_g!=null||d.fats_g!=null) && (
            <CC title="Macros (g)" sub="14-day trend · dashed = target">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={3}/>
                  <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                  <Tooltip {...TT}/>
                  <Legend wrapperStyle={{fontSize:11}}/>
                  {target?.protein_g!=null && <ReferenceLine y={target.protein_g} stroke={S.accent2} strokeDasharray="4 4"/>}
                  {target?.carbs_g!=null && <ReferenceLine y={target.carbs_g} stroke="#3B82F6" strokeDasharray="4 4"/>}
                  {target?.fats_g!=null && <ReferenceLine y={target.fats_g} stroke="#8B5CF6" strokeDasharray="4 4"/>}
                  <Line type="monotone" dataKey="protein_g" name="Protein" stroke={S.accent2} strokeWidth={2} dot={{r:2}} connectNulls/>
                  <Line type="monotone" dataKey="carbs_g" name="Carbs" stroke="#3B82F6" strokeWidth={2} dot={{r:2}} connectNulls/>
                  <Line type="monotone" dataKey="fats_g" name="Fats" stroke="#8B5CF6" strokeWidth={2} dot={{r:2}} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
            </CC>
          )}
        </div>
      ))}

      {tab==="measurements" && (weekly.length===0?emptyWeekly:(
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

      {tab==="habits" && <HabitsProgress habits={habits} logs={habitLogs}/>}

      {tab==="notes" && coachView && <CheckinNotes weekly={weekly}/>}

      {tab==="photos" && <ProgressPhotos profile={profile}/>}

      {tab==="goals" && (weekly.length===0?emptyWeekly:(
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
          <CC title="Weekly Self-Ratings" sub="1–10 · discipline / confidence / sleep / nutrition / hydration">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="week" tick={{fontSize:10,fill:"#666"}}/>
                <YAxis domain={[0,10]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Line type="monotone" dataKey="discipline_level" name="Discipline" stroke={S.accent} strokeWidth={2} dot={{r:2}} connectNulls/>
                <Line type="monotone" dataKey="confidence_level" name="Confidence" stroke={S.accent2} strokeWidth={2} dot={{r:2}} connectNulls/>
                <Line type="monotone" dataKey="sleep_quality" name="Sleep" stroke="#8B5CF6" strokeWidth={2} dot={{r:2}} connectNulls/>
                <Line type="monotone" dataKey="nutrition_compliance" name="Nutrition" stroke="#3B82F6" strokeWidth={2} dot={{r:2}} connectNulls/>
                <Line type="monotone" dataKey="hydration_quality" name="Hydration" stroke="#F59E0B" strokeWidth={2} dot={{r:2}} connectNulls/>
              </LineChart>
            </ResponsiveContainer>
          </CC>
        </div>
      ))}
    </div>
  );
}

// Daily-habit adherence, surfaced inside Progress so the coach (via CoachProgress)
// can see whether the client is actually checking habits off. Read-only 14-day
// grid plus a 30-day completion rate per habit.
function HabitsProgress({ habits, logs }) {
  if(!habits.length) return <Card style={{textAlign:"center",padding:40,color:S.muted}}>No habits assigned yet.</Card>;
  const days14 = Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));return d.toISOString().split("T")[0];});
  const doneOn = (habitId,date)=>logs.some(l=>l.habit_id===habitId && l.date===date && l.done);
  const rate = (habitId)=>{ // % of the last 30 days this habit was completed
    const done = logs.filter(l=>l.habit_id===habitId && l.done).length;
    return Math.round((done/30)*100);
  };
  const overall = Math.round((logs.filter(l=>l.done).length/(habits.length*30))*100);
  return (
    <div>
      <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:22}}>
        <Stat label="Active Habits" value={habits.length} unit=""/>
        <Stat label="Adherence (30d)" value={isNaN(overall)?0:overall} unit="%"/>
        <Stat label="Done Today" value={habits.filter(h=>doneOn(h.id,todayStr())).length} unit={"/"+habits.length}/>
      </div>
      <Card>
        <CardTitle>Last 14 days</CardTitle>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",minWidth:560}}>
            <thead>
              <tr>
                <th style={{textAlign:"left",padding:"6px 10px",fontSize:10,color:S.muted}}></th>
                {days14.map(d=><th key={d} style={{padding:"6px 4px",fontSize:9,color:S.muted,fontWeight:600}}>{d.slice(5)}</th>)}
                <th style={{padding:"6px 8px",fontSize:9,color:S.muted,fontWeight:600}}>30d</th>
              </tr>
            </thead>
            <tbody>
              {habits.map(h=>(
                <tr key={h.id}>
                  <td style={{padding:"6px 10px",fontSize:12,whiteSpace:"nowrap",color:S.text}}>{h.name}</td>
                  {days14.map(d=>(
                    <td key={d} style={{padding:"5px 4px",textAlign:"center"}}>
                      <div style={{width:16,height:16,borderRadius:3,margin:"0 auto",background:doneOn(h.id,d)?S.neon:S.surface2,border:"1px solid "+S.border}}/>
                    </td>
                  ))}
                  <td style={{padding:"5px 8px",textAlign:"center",fontSize:12,fontWeight:600,color:S.text}}>{rate(h.id)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Free-text weekly check-in answers, folded into one collapsible folder per week
// so the coach can read what the client actually wrote. Numeric-only weeks (no
// text) are still listed so nothing looks missing.
const CHECKIN_QA = [
  ["workout_feel","How workouts felt"],
  ["pump","Pump & muscle engagement"],
  ["exercise_feedback","Exercises that felt good/bad"],
  ["lifts_improved","Lifts that improved"],
  ["felt_weaker","Felt weaker than usual"],
  ["cardio_performance","Cardio vs last week"],
  ["mental_blocks","Stress / mental blocks"],
  ["what_went_well","What went well"],
  ["lifestyle_wins","Physical / lifestyle wins"],
  ["biggest_challenge","Biggest challenge"],
  ["holding_back","Holding back progress"],
  ["adjustments","Wants adjusted"],
  ["coach_questions","Questions for coach"],
];
function CheckinNotes({ weekly }) {
  if(!weekly.length) return <Card style={{textAlign:"center",padding:40,color:S.muted}}>No weekly check-ins yet.</Card>;
  // Most recent first; every week stays collapsed until the coach clicks it.
  const ordered = [...weekly].reverse();
  return (
    <div>
      {ordered.map((w)=>{
        const answered = CHECKIN_QA.filter(([k])=>String(w[k]||"").trim());
        return (
          <DayFolder key={w.id||w.week} title={w.week} meta={w.date} defaultOpen={false}>
            {answered.length===0
              ? <div style={{color:S.muted,fontSize:13}}>No written notes for this week (numbers only).</div>
              : answered.map(([k,label])=>(
                  <div key={k} style={{marginBottom:14}}>
                    <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,marginBottom:4}}>{label}</div>
                    <div style={{fontSize:14,lineHeight:1.6,color:S.text,whiteSpace:"pre-wrap"}}>{w[k]}</div>
                  </div>
                ))}
          </DayFolder>
        );
      })}
    </div>
  );
}

// Strength progression grouped into collapsible Compound / Accessory / Circuit
// folders (coach-set exercise_type, else auto-detected). Warm-ups are excluded —
// they belong in the workout log. Each folder opens to per-exercise graphs:
// weight+reps for lifts, best logged time for circuits.
function StrengthTab({ profile }) {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      const {data:logs} = await supabase.from("workout_logs").select("*").eq("client_id",profile.id).order("date");
      const {data:exs} = await supabase.from("exercises").select("id,name,is_bodyweight,section,category,exercise_type").eq("client_id",trainingOwnerId(profile));
      const exMap = {}; (exs||[]).forEach(e=>{exMap[e.id]=e;});
      // Top set per exercise per date: heaviest weight (with its reps), best reps,
      // and fastest logged time. Warm-ups are skipped entirely.
      const byEx = {};
      (logs||[]).forEach(l=>{
        const ex = exMap[l.exercise_id]; if(!ex) return;
        const grp = strengthGroupOf(ex); if(grp==="Warmup") return;
        if(!byEx[l.exercise_id]) byEx[l.exercise_id] = {ex, grp, byDate:{}};
        const rec = byEx[l.exercise_id].byDate;
        const cur = rec[l.date] || {weight:0, reps:0, timeSec:null};
        const w = l.weight||0, r = l.reps||0, ts = parseTimeSec(l.time);
        if(w > cur.weight){ cur.weight=w; if(r) cur.reps=r; }
        if(!w && r > cur.reps) cur.reps=r;                       // bodyweight: best reps
        if(ts!=null && (cur.timeSec==null || ts < cur.timeSec)) cur.timeSec=ts;
        rec[l.date]=cur;
      });
      const series = Object.values(byEx).map(({ex,grp,byDate})=>({
        id:ex.id, name:ex.name, is_bodyweight:ex.is_bodyweight, grp,
        data:Object.entries(byDate).map(([date,v])=>({date,...v})).sort((a,b)=>a.date<b.date?-1:1),
      })).filter(s=>s.data.length>0);
      const g = {Compound:[], Accessory:[], Circuit:[]};
      series.forEach(s=>{ (g[s.grp]||g.Accessory).push(s); });
      setGroups(g); setLoading(false);
    })();
  },[profile.id, profile.shared_program_owner_id]);

  if(loading) return <div className="spinner" style={{margin:"40px auto"}}/>;
  const total = groups ? groups.Compound.length+groups.Accessory.length+groups.Circuit.length : 0;
  if(total===0) return <Card style={{textAlign:"center",padding:40,color:S.muted}}>No logged sessions yet. Strength progress appears as you log workouts.</Card>;

  const FOLDERS = [{key:"Compound",title:"Compounds"},{key:"Accessory",title:"Accessories"},{key:"Circuit",title:"Circuits"}];
  return (
    <div>
      {FOLDERS.filter(f=>groups[f.key].length>0).map(f=>(
        <DayFolder key={f.key} title={f.title} meta={`${groups[f.key].length} exercise${groups[f.key].length>1?"s":""}`}>
          <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {groups[f.key].map(s=>(
              <CC key={s.id} title={s.name} sub={f.key==="Circuit"?"Best logged time":(s.is_bodyweight?"Top-set reps":"Top-set weight + reps")}>
                <ResponsiveContainer width="100%" height="100%">
                  {f.key==="Circuit" ? (
                    <LineChart data={s.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis tick={{fontSize:10,fill:"#666"}} tickFormatter={fmtSec} domain={["auto","auto"]}/>
                      <Tooltip {...TT} formatter={v=>[fmtSec(v),"Time"]}/>
                      <Line type="monotone" dataKey="timeSec" stroke={S.neon} strokeWidth={2} dot={{r:3}}/>
                    </LineChart>
                  ) : s.is_bodyweight ? (
                    <LineChart data={s.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis tick={{fontSize:10,fill:"#666"}} domain={["auto","auto"]}/>
                      <Tooltip {...TT}/>
                      <Line type="monotone" dataKey="reps" name="Reps" stroke={S.accent2} strokeWidth={2} dot={{r:3}}/>
                    </LineChart>
                  ) : (
                    <LineChart data={s.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis yAxisId="w" tick={{fontSize:10,fill:"#666"}} domain={["auto","auto"]}/>
                      <YAxis yAxisId="r" orientation="right" tick={{fontSize:10,fill:"#666"}} domain={["auto","auto"]}/>
                      <Tooltip {...TT}/>
                      <Line yAxisId="w" type="monotone" dataKey="weight" name="Weight (lb)" stroke={S.neon} strokeWidth={2} dot={{r:3}}/>
                      <Line yAxisId="r" type="monotone" dataKey="reps" name="Reps" stroke={S.accent2} strokeWidth={2} dot={{r:2}}/>
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </CC>
            ))}
          </div>
        </DayFolder>
      ))}
    </div>
  );
}

// Sunday that starts the week containing `s` (mirrors WeeklyCheckin's weekStart
// so a photo's derived week matches its check-in's stored date).
const weekStartOf = (s) => { const d=new Date(s); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split("T")[0]; };
// "2026-07-11" -> "7/11/2026"
const fmtWeek = (s) => { const [y,m,d]=s.split("-"); return `${+m}/${+d}/${y}`; };

// Progress photos: grouped into weekly sets. Each photo links to that week's
// weekly check-in when one exists (checkin_id); otherwise it's bucketed by the
// week its taken_on falls in. Upload stamps today; storage is private (signed URLs).
function ProgressPhotos({ profile }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const [activeWeek, setActiveWeek] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [beforeId, setBeforeId] = useState(null);
  const [afterId, setAfterId] = useState(null);
  const [pos, setPos] = useState(50);   // slider position, 0-100

  const load = useCallback(async()=>{
    const [{data:rows}, {data:checkins}] = await Promise.all([
      supabase.from("progress_photos").select("*").eq("client_id",profile.id).order("taken_on",{ascending:false}),
      supabase.from("weekly_checkins").select("id,date").eq("client_id",profile.id),
    ]);
    const ciDate = {}; (checkins||[]).forEach(c=>{ ciDate[c.id]=c.date; });
    const paths = (rows||[]).map(r=>r.path);
    const urls = {};
    if(paths.length){
      const {data:signed} = await supabase.storage.from("progress-photos").createSignedUrls(paths, 3600);
      (signed||[]).forEach(s=>{ if(s.path && s.signedUrl) urls[s.path]=s.signedUrl; });
    }
    setPhotos((rows||[]).map(r=>{
      const base = (r.checkin_id && ciDate[r.checkin_id]) || r.taken_on || (r.created_at||"").slice(0,10);
      return {...r, url:urls[r.path], week: base ? weekStartOf(base) : null};
    }));
    setLoading(false);
  },[profile.id]);
  useEffect(()=>{load();},[load]);

  // Distinct weeks, newest first; keep a valid tab selected.
  const weeks = [...new Set(photos.map(p=>p.week).filter(Boolean))].sort().reverse();
  const active = (activeWeek && weeks.includes(activeWeek)) ? activeWeek : (weeks[0]||null);
  const shown = photos.filter(p=>p.week===active);

  const onUpload = async(e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    setUploading(true); setErr(null);
    try{
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase();
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const {error:upErr} = await supabase.storage.from("progress-photos").upload(path, file, {upsert:false, contentType:file.type});
      if(upErr) throw upErr;
      // Link to this week's check-in if the client has already logged one.
      const wk = weekStartOf(todayStr());
      const {data:ci} = await supabase.from("weekly_checkins").select("id").eq("client_id",profile.id).eq("date",wk).maybeSingle();
      const {error:insErr} = await supabase.from("progress_photos").insert({client_id:profile.id, path, taken_on:todayStr(), checkin_id:ci?.id||null});
      if(insErr) throw insErr;
      setActiveWeek(wk);
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
            <div style={{fontSize:11,color:S.muted}}>Private to you and your coach. Grouped by check-in week — shoot in consistent lighting and angle for the best comparison.</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {photos.filter(p=>p.url).length>=2 && (
              <button onClick={()=>{
                const withUrl=photos.filter(p=>p.url);
                if(!comparing){ setAfterId(withUrl[0].id); setBeforeId(withUrl[withUrl.length-1].id); setPos(50); }
                setComparing(c=>!c);
              }} style={{...bS({}),background:comparing?S.accent:"transparent",color:comparing?"white":S.text,border:"1px solid "+(comparing?S.accent:S.border)}}>
                {comparing?"Close compare":"⇆ Compare"}
              </button>
            )}
            <label style={{...bS({}),background:S.neon,color:"#0A0A0B",display:"inline-block",cursor:uploading?"default":"pointer",opacity:uploading?0.6:1}}>
              {uploading?"Uploading...":"+ Upload Photo"}
              <input type="file" accept="image/*" onChange={onUpload} disabled={uploading} style={{display:"none"}}/>
            </label>
          </div>
        </div>
        {err && <div style={{color:"#ff6b5b",fontSize:12,marginTop:10}}>{err}</div>}
      </Card>
      {comparing && (()=>{
        const withUrl = photos.filter(p=>p.url);
        const before = withUrl.find(p=>p.id===beforeId) || withUrl[withUrl.length-1];
        const after  = withUrl.find(p=>p.id===afterId)  || withUrl[0];
        const dateOf = (p)=> p ? (p.taken_on||(p.created_at||"").slice(0,10)) : "";
        const sel = { background:S.surface2, border:"1px solid "+S.border, color:S.text, padding:"8px 10px", fontSize:12, outline:"none" };
        return (
          <Card>
            <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:14}}>
              <div><div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted,marginBottom:4}}>Before</div>
                <select value={before?.id||""} onChange={e=>setBeforeId(e.target.value)} style={sel}>
                  {withUrl.map(p=><option key={p.id} value={p.id}>{dateOf(p)}</option>)}
                </select></div>
              <div><div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted,marginBottom:4}}>After</div>
                <select value={after?.id||""} onChange={e=>setAfterId(e.target.value)} style={sel}>
                  {withUrl.map(p=><option key={p.id} value={p.id}>{dateOf(p)}</option>)}
                </select></div>
            </div>
            <div style={{position:"relative",width:"100%",maxWidth:460,height:520,margin:"0 auto",overflow:"hidden",border:"1px solid "+S.border,background:S.bg}}>
              <img src={after?.url} alt="after" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
              <div style={{position:"absolute",inset:0,clipPath:`inset(0 ${100-pos}% 0 0)`}}>
                <img src={before?.url} alt="before" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              </div>
              <div style={{position:"absolute",top:0,bottom:0,left:pos+"%",width:2,background:S.neon,pointerEvents:"none"}}/>
              <span style={{position:"absolute",top:8,left:8,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",background:"rgba(0,0,0,.6)",color:"#fff",padding:"3px 7px"}}>Before · {dateOf(before)}</span>
              <span style={{position:"absolute",top:8,right:8,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",background:"rgba(0,0,0,.6)",color:"#fff",padding:"3px 7px"}}>After · {dateOf(after)}</span>
            </div>
            <input type="range" min={0} max={100} value={pos} onChange={e=>setPos(Number(e.target.value))}
              style={{width:"100%",maxWidth:460,display:"block",margin:"14px auto 0",accentColor:S.accent,cursor:"ew-resize"}}/>
          </Card>
        );
      })()}
      {loading ? <div className="spinner" style={{margin:"40px auto"}}/> :
        photos.length===0 ? <Card style={{textAlign:"center",padding:40,color:S.muted}}>No photos yet. Upload your first to start your visual timeline.</Card> :
        <>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"16px 0"}}>
            {weeks.map(w=>{
              const on = w===active;
              return (
                <button key={w} onClick={()=>setActiveWeek(w)}
                  style={{padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:"1px solid "+(on?S.neon:S.border),background:on?S.neon:S.surface,color:on?"#0A0A0B":S.text}}>
                  {fmtWeek(w)} <span style={{opacity:.65,fontWeight:400}}>· {photos.filter(p=>p.week===w).length}</span>
                </button>
              );
            })}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
            {shown.map(p=>(
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
        </>
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
// PROGRAM-ONLY — SELF-GUIDED HABITS + PROGRESS (no coach, client-only)
// ---------------------------------------------------------------------------
// Program-only clients have no coach and no check-ins. Their daily habits and
// body metrics are stored on their own daily_checkins row (habit_flags jsonb +
// weight/waist), which they can read/write under existing RLS. Strength PRs and
// photos reuse the shared StrengthTab / ProgressPhotos components.
const PROGRAM_HABITS = [
  { key: "water",   label: "Water",   hint: "Hit your water goal" },
  { key: "protein", label: "Protein", hint: "Hit your protein target" },
  { key: "sleep",   label: "Sleep",   hint: "7+ hours" },
  { key: "workout", label: "Workout", hint: "Trained today" },
  { key: "steps",   label: "Steps",   hint: "Hit your step goal" },
];

// Consecutive days (back from today, or yesterday if today is blank) for which
// `ok(date)` holds. Shared by the workout and habit streaks.
function streakBack(ok) {
  const d = new Date();
  if (!ok(d.toISOString().split("T")[0])) d.setDate(d.getDate() - 1);
  let s = 0;
  while (ok(d.toISOString().split("T")[0])) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

function ProgramHabits({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [savingBody, setSavingBody] = useState(false);
  const [savedBody, setSavedBody] = useState(false);
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
    await supabase.from("daily_checkins").upsert(
      { client_id: profile.id, date: today, habit_flags: next },
      { onConflict: "client_id,date" }
    );
  };

  const saveBody = async () => {
    setSavingBody(true);
    await supabase.from("daily_checkins").upsert(
      { client_id: profile.id, date: today,
        weight: weight === "" ? null : parseFloat(weight),
        waist: waist === "" ? null : parseFloat(waist) },
      { onConflict: "client_id,date" }
    );
    setSavingBody(false); setSavedBody(true); setTimeout(() => setSavedBody(false), 2000);
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
      <PageTitle title="Daily Habits" sub="Small wins, stacked daily — just for you" />
      <div className="g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 22 }}>
        <Stat label="Done Today" value={doneToday} unit={"/" + PROGRAM_HABITS.length} />
        <Stat label="Today's Completion" value={pct} unit="%" />
        <Stat label="Perfect-Day Streak" value={streak} unit="days" />
      </div>
      <Card>
        <CardTitle>Today · {today}</CardTitle>
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

// "YYYY-MM" -> "July 2026"
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const monthLabel = (period) => { const [y,m] = (period||"").split("-"); return m ? `${MONTH_NAMES[+m-1]} ${y}` : period; };

// Coach-only AI monthly recaps for one client. The coach generates a recap from
// the client's last 30 days; /api/summary saves it per client per month, so this
// is an individual, persisted month-to-month history (never shared across
// clients). Reset on profile.id change so switching clients never shows stale text.
function ClientSummaries({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState("idle");   // idle | loading | error
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("client_summaries").select("*").eq("client_id", profile.id).order("period", { ascending: false });
    setRows(data || []); setLoading(false);
  }, [profile.id]);
  useEffect(() => { setErr(""); setGen("idle"); load(); }, [load]);

  const generate = async () => {
    setGen("loading"); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ client_id: profile.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate a summary.");
      setGen("idle"); await load();
    } catch (e) { setErr(e.message); setGen("error"); }
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20 }}>AI Monthly Recaps</div>
          <div style={{ fontSize: 11, color: S.muted }}>Generated from this client's last 30 days of logs. Saved by month — one recap per month.</div>
        </div>
        <Btn onClick={generate} disabled={gen === "loading"}>{gen === "loading" ? "Generating..." : "Generate this month"}</Btn>
      </div>
      {err && <div style={{ color: "#ff6b5b", fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {loading ? <div className="spinner" style={{ margin: "20px auto" }} /> :
        rows.length === 0 ? <div style={{ color: S.muted, fontSize: 13 }}>No recaps yet. Generate this month's to start the history.</div> :
        rows.map((r, idx) => (
          <DayFolder key={r.id} title={monthLabel(r.period)} meta={(r.created_at || "").slice(0, 10)} defaultOpen={idx === 0}>
            <div style={{ fontSize: 13.5, color: S.text, opacity: 0.92, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{r.content}</div>
          </DayFolder>
        ))
      }
    </Card>
  );
}

const WD_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ProgramProgress({ profile }) {
  const [tab, setTab] = useState("body");
  const [daily, setDaily] = useState([]);
  const [workoutDates, setWorkoutDates] = useState([]);
  const [scheduledDays, setScheduledDays] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: d } = await supabase.from("daily_checkins")
        .select("date,weight,waist,habit_flags").eq("client_id", profile.id).order("date");
      const { data: logs } = await supabase.from("workout_logs")
        .select("date").eq("client_id", profile.id);
      const { data: exs } = await supabase.from("exercises")
        .select("day_of_week").eq("client_id", profile.id);
      setDaily(d || []);
      setWorkoutDates([...new Set((logs || []).map((l) => l.date))].sort());
      setScheduledDays(new Set((exs || []).map((e) => e.day_of_week).filter(Boolean)));
      setLoading(false);
    })();
  }, [profile.id]);

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const weightSeries = daily.filter((d) => d.weight != null).map((d) => ({ date: d.date, weight: d.weight }));
  const waistSeries = daily.filter((d) => d.waist != null).map((d) => ({ date: d.date, waist: d.waist }));
  const lastWeight = weightSeries.length ? weightSeries[weightSeries.length - 1].weight : null;
  const workoutsCompleted = workoutDates.length;

  const workoutSet = new Set(workoutDates);
  const workoutStreak = streakBack((date) => workoutSet.has(date));

  // Missed sessions: scheduled program days (by weekday) in the last 14 days
  // that have already passed with no matching workout_logs entry.
  const missedSessions = [];
  for (let i = 1; i <= 13; i++) {
    const dt = new Date(); dt.setUTCDate(dt.getUTCDate() - i);
    const dateStr = dt.toISOString().split("T")[0];
    if (scheduledDays.has(WD_NAMES[dt.getUTCDay()]) && !workoutSet.has(dateStr)) missedSessions.push(dateStr);
  }

  const flagsByDate = {}; daily.forEach((r) => { if (r.habit_flags) flagsByDate[r.date] = r.habit_flags; });
  const habitStreak = streakBack((date) => { const f = flagsByDate[date]; return !!f && PROGRAM_HABITS.every((h) => f[h.key]); });

  const flaggedDays = daily.filter((r) => r.habit_flags);
  const habitRate = (key) => (flaggedDays.length ? Math.round((flaggedDays.filter((r) => r.habit_flags[key]).length / 30) * 100) : 0);

  const ts = (id) => ({ padding: "10px 20px", fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600, cursor: "pointer", color: tab === id ? S.accent : S.muted, background: "none", border: "none", borderBottom: tab === id ? "2px solid " + S.accent : "2px solid transparent" });
  const empty = <Card style={{ textAlign: "center", padding: 40, color: S.muted }}>No data yet. Log it on your Daily Habits page.</Card>;

  return (
    <div>
      <PageTitle title="Progress" sub="Your data over time" />
      <Card style={{ borderLeft: "3px solid " + S.neon }}>
        <CardTitle>Progress Summary</CardTitle>
        <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          <Stat label="Recent Weight" value={lastWeight ?? "—"} unit={lastWeight ? "lb" : ""} />
          <Stat label="Workouts Completed" value={workoutsCompleted} unit="" />
          <Stat label="Workout Streak" value={workoutStreak} unit="days" />
          <Stat label="Habit Streak" value={habitStreak} unit="days" />
        </div>
      </Card>
      {missedSessions.length > 0 && (
        <Card style={{ borderLeft: "3px solid #ff6b5b" }}>
          <CardTitle>Missed Sessions</CardTitle>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>Scheduled program days in the last 14 with no logged workout:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {missedSessions.map((d) => (
              <span key={d} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", background: "rgba(255,107,91,.1)", border: "1px solid rgba(255,107,91,.3)", color: "#ff6b5b" }}>{d}</span>
            ))}
          </div>
        </Card>
      )}
      <div style={{ display: "flex", borderBottom: "1px solid " + S.border, margin: "8px 0 24px", flexWrap: "wrap" }}>
        {[["body", "Body"], ["strength", "Strength"], ["habits", "Habits"], ["photos", "Photos"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={ts(id)}>{label}</button>
        ))}
      </div>

      {tab === "body" && (weightSeries.length === 0 && waistSeries.length === 0 ? empty : (
        <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <CC title="Bodyweight Trend" sub="From your daily log">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightSeries.slice(-30)}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={6} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} />
                <Tooltip {...TT} />
                <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CC>
          <CC title="Waist Trend" sub="From your daily log">
            {waistSeries.length === 0
              ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: S.muted, fontSize: 13 }}>Log your waist to see this chart</div>
              : <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={waistSeries.slice(-30)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={S.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickFormatter={(d) => d.slice(5)} interval={6} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#666" }} />
                    <Tooltip {...TT} />
                    <Line type="monotone" dataKey="waist" stroke={S.accent2} strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>}
          </CC>
        </div>
      ))}

      {tab === "strength" && <StrengthTab profile={profile} />}

      {tab === "habits" && (flaggedDays.length === 0 ? empty : (
        <div className="g3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
          {PROGRAM_HABITS.map((h) => (<Stat key={h.key} label={h.label + " (30d)"} value={habitRate(h.key)} unit="%" />))}
        </div>
      ))}

      {tab === "photos" && <ProgressPhotos profile={profile} />}
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

const BLOCK_TYPE_LABEL = { straight_set: "Straight Set", superset: "Superset / Giant Set", circuit_for_time: "Circuit — For Time", timed_circuit: "Timed Circuit", weighted_circuit: "Weighted Circuit" };
const BLOCK_TYPE_SHORT = { superset: "SS", circuit_for_time: "CFT", timed_circuit: "TC", weighted_circuit: "WC" };

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
    const {data} = await supabase.from("exercises").select("*").eq("client_id",trainingOwnerId(profile)).order("created_at");
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
function CoachHome({ setPage }) {
  const [clients, setClients] = useState([]);
  const [byClient, setByClient] = useState({});
  const [weeklyRecent, setWeeklyRecent] = useState([]);
  const [upgrades, setUpgrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      const {data:cl} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL).neq("archived",true);
      const list = cl||[];
      const ids = list.map(c=>c.id);
      const grouped = {};
      let weeklies = [];
      // Pending upgrade requests from program-only clients.
      const {data:ur} = await supabase.from("upgrade_requests").select("*").eq("status","pending").order("created_at",{ascending:false});
      setUpgrades(ur||[]);
      if(ids.length){
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-29);
        const cut = cutoff.toISOString().split("T")[0];
        const {data:ch} = await supabase.from("daily_checkins")
          .select("client_id,date,weight,workout,diet").in("client_id",ids).gte("date",cut).order("date");
        (ch||[]).forEach(r=>{ (grouped[r.client_id]=grouped[r.client_id]||[]).push(r); });
        // Recent weekly check-ins carrying questions or red-flag answers the coach
        // should respond to (last 14 days).
        const wcutoff = new Date(); wcutoff.setDate(wcutoff.getDate()-13);
        const wcut = wcutoff.toISOString().split("T")[0];
        const {data:wc} = await supabase.from("weekly_checkins")
          .select("client_id,date,coach_questions,adjustments,confidence_level,felt_weaker,biggest_challenge,mental_blocks")
          .in("client_id",ids).gte("date",wcut).order("date");
        weeklies = wc||[];
      }
      setClients(list); setByClient(grouped); setWeeklyRecent(weeklies); setLoading(false);
    })();
  },[]);

  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  const today = todayStr();
  const daysSinceDate = (d)=> Math.round((new Date(today) - new Date(d)) / 86400000);

  const assessed = clients.map(c=>{
    // Program-only clients have no coach and no check-ins, so the check-in-based
    // attention flags don't apply — never surface them here.
    if(c.client_type==="program_only") return {client:c, adh:{score:0}, last:null, since:null, flags:[], severity:0, programOnly:true};
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
  const coached = assessed.filter(a=>!a.programOnly);
  const avgAdh = coached.length ? Math.round(coached.reduce((s,a)=>s+a.adh.score,0)/coached.length) : 0;

  // Weekly check-in messages/flags the coach should respond to, newest first.
  const nameOf = (id)=>{ const c=clients.find(x=>x.id===id); return c?(c.name||c.email):"Client"; };
  const markHandled = async(id)=>{
    setUpgrades(prev=>prev.filter(u=>u.id!==id));
    await supabase.from("upgrade_requests").update({status:"handled"}).eq("id",id);
  };
  const messages = weeklyRecent.map(w=>{
    const items=[];
    if((w.coach_questions||"").trim()) items.push({label:"Question",tone:"red",text:w.coach_questions});
    if((w.adjustments||"").trim()) items.push({label:"Wants adjusted",tone:"amber",text:w.adjustments});
    if(w.confidence_level!=null && w.confidence_level<=4) items.push({label:`Low confidence ${w.confidence_level}/10`,tone:"amber",text:w.biggest_challenge||w.mental_blocks||""});
    if((w.felt_weaker||"").trim()) items.push({label:"Felt weaker",tone:"amber",text:w.felt_weaker});
    return items.length?{id:w.client_id,date:w.date,items}:null;
  }).filter(Boolean).sort((a,b)=>a.date<b.date?1:-1);

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

      {upgrades.length>0 && (
        <Card style={{borderLeft:"3px solid "+S.neon}}>
          <CardTitle>💎 Upgrade Requests</CardTitle>
          <div style={{fontSize:11,color:S.muted,marginTop:-8,marginBottom:14}}>Program-only clients who want to move to full coaching. Reach out, then mark handled.</div>
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
                <Btn sm teal onClick={()=>setPage("clients")}>Open Client</Btn>
                <Btn sm onClick={()=>markHandled(u.id)}>Mark handled</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

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

      {messages.length>0 && (
        <Card>
          <CardTitle>💬 Client Messages & Flags</CardTitle>
          <div style={{fontSize:11,color:S.muted,marginTop:-8,marginBottom:14}}>From weekly check-ins in the last 14 days — questions, requested adjustments, and red flags worth a reply.</div>
          {messages.map((m,i)=>(
            <div key={i} onClick={()=>setPage("clients")}
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
      )}

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
        // Sequential "Day 1..N" labels for this snapshot (matches the live views).
        const dayLabelOf = {};
        { let n = 0; [...new Set(exs.map((e) => e.day_of_week).filter(Boolean))]
            .sort((a, b) => (DAY_ORDER.indexOf(a) === -1 ? 99 : DAY_ORDER.indexOf(a)) - (DAY_ORDER.indexOf(b) === -1 ? 99 : DAY_ORDER.indexOf(b)))
            .forEach((day) => { dayLabelOf[day] = "Day " + (++n); }); }
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
                      <td style={{ padding: "6px 10px", fontSize: 12, color: S.muted, borderBottom: "1px solid " + S.border }}>{dayLabelOf[e.day_of_week] || "—"}</td>
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

// The coach's editable view of the client's active nutrition plan. Mirrors the
// exercise editor: adjust macros, guidelines, hydration, and meal structure in
// place and save straight to the plan row — no full regeneration. Refetches when
// refreshKey changes (e.g. after a new program is generated).
const taStyle = { width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 12px", fontSize: 14, outline: "none", resize: "vertical" };
const numOrNull = (v) => { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

function CoachNutrition({ clientId, refreshKey }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setLoading(true); setEditing(false); setMsg(null);
    supabase
      .from("nutrition_plans")
      .select("*")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { setPlan(data || null); setLoading(false); });
  }, [clientId, refreshKey]);

  const startEdit = () => {
    setMsg(null);
    setDraft({
      name: plan.name || "", calories: plan.calories ?? "", protein_g: plan.protein_g ?? "",
      carbs_g: plan.carbs_g ?? "", fats_g: plan.fats_g ?? "", hydration: plan.hydration || "",
      guidelines: plan.guidelines || "",
      meals: (Array.isArray(plan.meals) ? plan.meals : []).map((m) => ({
        meal: m.meal || "", time: m.time || "", calories: m.calories ?? "", protein_g: m.protein_g ?? "",
        carbs_g: m.carbs_g ?? "", fats_g: m.fats_g ?? "",
        itemsText: (Array.isArray(m.items) ? m.items : []).map((it) => (typeof it === "string" ? it : it?.name || "")).join("\n"),
      })),
    });
    setEditing(true);
  };

  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setMeal = (i, k, v) => setDraft((d) => ({ ...d, meals: d.meals.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));
  const addMeal = () => setDraft((d) => ({ ...d, meals: [...d.meals, { meal: "", time: "", calories: "", protein_g: "", carbs_g: "", fats_g: "", itemsText: "" }] }));
  const removeMeal = (i) => setDraft((d) => ({ ...d, meals: d.meals.filter((_, j) => j !== i) }));

  const save = async () => {
    setSaving(true); setMsg(null);
    const payload = {
      name: draft.name.trim() || null,
      calories: numOrNull(draft.calories), protein_g: numOrNull(draft.protein_g),
      carbs_g: numOrNull(draft.carbs_g), fats_g: numOrNull(draft.fats_g),
      hydration: draft.hydration.trim() || null, guidelines: draft.guidelines.trim() || null,
      meals: draft.meals.map((m) => ({
        meal: m.meal.trim() || null, time: m.time.trim() || null,
        calories: numOrNull(m.calories), protein_g: numOrNull(m.protein_g),
        carbs_g: numOrNull(m.carbs_g), fats_g: numOrNull(m.fats_g),
        items: (m.itemsText || "").split("\n").map((s) => s.trim()).filter(Boolean),
      })),
    };
    const { error } = await supabase.from("nutrition_plans").update(payload).eq("id", plan.id);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setPlan((p) => ({ ...p, ...payload }));
    setEditing(false);
    setMsg({ ok: true, text: "Nutrition plan updated." });
  };

  if (loading) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <CardTitle>Nutrition Plan</CardTitle>
        {plan && !editing && <Btn sm teal onClick={startEdit}>Edit Plan</Btn>}
      </div>

      {!plan ? (
        <div style={{ fontSize: 13, color: S.muted }}>No nutrition plan yet. Generate a program to create one.</div>
      ) : editing ? (
        <>
          <Fld label="Plan Name"><Inp type="text" value={draft.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nutrition Plan" /></Fld>
          <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 4 }}>
            <Fld label="Calories (kcal)"><Inp type="number" value={draft.calories} onChange={(e) => setField("calories", e.target.value)} /></Fld>
            <Fld label="Protein (g)"><Inp type="number" value={draft.protein_g} onChange={(e) => setField("protein_g", e.target.value)} /></Fld>
            <Fld label="Carbs (g)"><Inp type="number" value={draft.carbs_g} onChange={(e) => setField("carbs_g", e.target.value)} /></Fld>
            <Fld label="Fats (g)"><Inp type="number" value={draft.fats_g} onChange={(e) => setField("fats_g", e.target.value)} /></Fld>
          </div>
          <Fld label="Hydration"><Inp type="text" value={draft.hydration} onChange={(e) => setField("hydration", e.target.value)} placeholder="e.g. 3–4L water/day" /></Fld>
          <Fld label="Guidelines"><textarea rows={3} value={draft.guidelines} onChange={(e) => setField("guidelines", e.target.value)} style={taStyle} /></Fld>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 8px" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: S.muted }}>Meals</div>
            <Btn sm teal onClick={addMeal}>+ Add Meal</Btn>
          </div>
          {draft.meals.map((m, i) => (
            <div key={i} style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, marginBottom: 12 }}>
              <div className="g2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <Fld label="Meal"><Inp type="text" value={m.meal} onChange={(e) => setMeal(i, "meal", e.target.value)} placeholder="e.g. Breakfast" /></Fld>
                <Fld label="Time"><Inp type="text" value={m.time} onChange={(e) => setMeal(i, "time", e.target.value)} placeholder="e.g. 8:00 AM" /></Fld>
              </div>
              <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                <Fld label="kcal"><Inp type="number" value={m.calories} onChange={(e) => setMeal(i, "calories", e.target.value)} /></Fld>
                <Fld label="P (g)"><Inp type="number" value={m.protein_g} onChange={(e) => setMeal(i, "protein_g", e.target.value)} /></Fld>
                <Fld label="C (g)"><Inp type="number" value={m.carbs_g} onChange={(e) => setMeal(i, "carbs_g", e.target.value)} /></Fld>
                <Fld label="F (g)"><Inp type="number" value={m.fats_g} onChange={(e) => setMeal(i, "fats_g", e.target.value)} /></Fld>
              </div>
              <Fld label="Items (one per line)"><textarea rows={3} value={m.itemsText} onChange={(e) => setMeal(i, "itemsText", e.target.value)} placeholder={"1 cup oats\n2 whole eggs"} style={taStyle} /></Fld>
              <Btn sm danger onClick={() => removeMeal(i)}>Remove Meal</Btn>
            </div>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
            <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Plan"}</Btn>
            <Btn sm onClick={() => { setEditing(false); setMsg(null); }} disabled={saving}>Cancel</Btn>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : "#ff6b5b" }}>{msg.text}</span>}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
            {plan.name || "Nutrition Plan"}{plan.created_at ? ` · ${plan.created_at.slice(0, 10)}` : ""}
          </div>
          <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 16 }}>
            <Stat label="Calories" value={plan.calories ?? "—"} unit=" kcal" />
            <Stat label="Protein" value={plan.protein_g ?? "—"} unit="g" />
            <Stat label="Carbs" value={plan.carbs_g ?? "—"} unit="g" />
            <Stat label="Fats" value={plan.fats_g ?? "—"} unit="g" />
          </div>
          {(plan.guidelines || plan.hydration) && (
            <div style={{ background: S.surface2, border: "1px solid " + S.border, padding: 14, marginBottom: 16 }}>
              {plan.guidelines && <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: plan.hydration ? 10 : 0 }}>{plan.guidelines}</div>}
              {plan.hydration && <div style={{ fontSize: 13, color: S.accent2 }}>💧 {plan.hydration}</div>}
            </div>
          )}
          {(Array.isArray(plan.meals) ? plan.meals : []).map((m, i) => (
            <DayFolder key={i} title={m.meal || "Meal " + (i + 1)} meta={[m.time, m.calories != null ? `${m.calories} kcal` : null].filter(Boolean).join(" · ")}>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: S.muted, marginBottom: 8, flexWrap: "wrap" }}>
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
          {msg && <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? S.accent2 : "#ff6b5b", marginTop: 12 }}>{msg.text}</div>}
        </>
      )}
    </Card>
  );
}

// Coach-facing snapshot of a client's self-reported data, shown inline in the
// Clients detail view: daily-habit adherence + the free-text weekly check-in
// answers. Reuses the same HabitsProgress / CheckinNotes views as Progress so
// the coach sees exactly what the client sees, without leaving the Clients tab.
function CoachClientInsights({ client }) {
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [weekly, setWeekly] = useState([]);
  useEffect(()=>{
    supabase.from("habits").select("*").eq("client_id",client.id).eq("active",true).order("order_index").then(({data})=>setHabits(data||[]));
    const cut = (()=>{const d=new Date();d.setDate(d.getDate()-29);return d.toISOString().split("T")[0];})();
    supabase.from("habit_logs").select("*").eq("client_id",client.id).gte("date",cut).then(({data})=>setHabitLogs(data||[]));
    supabase.from("weekly_checkins").select("*").eq("client_id",client.id).order("date").then(({data})=>setWeekly((data||[]).map((w,i)=>({...w,week:"Wk"+(i+1)}))));
  },[client.id]);
  const heading = {fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,margin:"4px 2px 12px"};
  return (
    <div style={{marginBottom:20}}>
      <div style={heading}>Habit Adherence</div>
      <HabitsProgress habits={habits} logs={habitLogs}/>
      <div style={{...heading,marginTop:20}}>Weekly Check-in Notes</div>
      <CheckinNotes weekly={weekly}/>
    </div>
  );
}

function ClientsPanel() {
  const isMobile = useIsMobile();
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEx, setNewEx] = useState({name:"",category:"",day_of_week:"",sets:"",reps:"",notes:"",is_bodyweight:false,exercise_type:""});
  const [editEx, setEditEx] = useState(null);   // {id, draft} | null
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genScope, setGenScope] = useState(null);
  const [genMsg, setGenMsg] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [assess, setAssess] = useState({nervous_system_recruitment:5,muscular_density_to_size:5,metabolic_work_capacity:5});
  const [savingAssess, setSavingAssess] = useState(false);
  const [assessMsg, setAssessMsg] = useState(null);
  const [settings, setSettings] = useState({client_type:"coaching", dashboard_url:"", goal:"", access_until:""});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [resettingGoal, setResettingGoal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [progTick, setProgTick] = useState(0);
  const [partnerId, setPartnerId] = useState("");        // selected owner in the link picker
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerMsg, setPartnerMsg] = useState(null);
  const [coachMsg, setCoachMsg] = useState("");            // client-visible message draft
  const [savingCoachMsg, setSavingCoachMsg] = useState(false);
  const [coachMsgStatus, setCoachMsgStatus] = useState(null);

  // The id whose TRAINING rows (program + exercises) the selected client shares.
  // For a linked partner this is their owner; otherwise the client itself.
  // Nutrition and check-ins always use the client's own id, never this.
  const selClient = clients.find(c=>c.id===selected);
  const trainOwnerId = selClient?.shared_program_owner_id || selected;

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
  useEffect(()=>{if(selected){loadEx(trainOwnerId);setGenMsg(null);}},[selected,trainOwnerId]);
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
      goal: c.goal || "",
      access_until: c.access_until || "",
    });
    if(c) setPartnerId(c.shared_program_owner_id || "");
    if(c) setCoachMsg(c.coach_message || "");
    setCoachMsgStatus(null);
    setAssessMsg(null);
    setSettingsMsg(null);
    setPartnerMsg(null);
  },[selected, clients]);

  const saveSettings = async()=>{
    setSavingSettings(true); setSettingsMsg(null);
    const {error} = await supabase.from("profiles").update({
      client_type: settings.client_type,
      dashboard_url: settings.dashboard_url.trim() || null,
      goal: settings.goal.trim() || null,
      access_until: settings.access_until || null,
    }).eq("id",selected);
    setSavingSettings(false);
    if(error){ setSettingsMsg({ok:false,text:error.message}); return; }
    setSettingsMsg({ok:true,text:"Client settings saved."});
    await loadClients();
  };

  // Stage the client's Notion intake goal into the editor WITHOUT persisting.
  // Reads Notion read-only (/api/notion-goal) and drops the value into the Goal
  // field; nothing is written until the coach clicks Save Settings.
  const resetGoalToNotion = async(client)=>{
    setResettingGoal(true); setSettingsMsg(null);
    try{
      const r = await fetch("/api/notion-goal",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({client_email:client.email}),
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||`Request failed (${r.status})`);
      const pulled = data.goal || "";
      setSettings(p=>({...p, goal: pulled}));
      setSettingsMsg({ok:true, text: pulled?`Notion goal "${pulled}" loaded into the field — click Save Settings to apply.`:"Notion has no goal on file for this client. Field cleared — click Save Settings to apply."});
    }catch(e){
      setSettingsMsg({ok:false,text:e.message});
    }finally{
      setResettingGoal(false);
    }
  };

  // Link/unlink the selected client to a training partner. Setting an owner
  // makes this client SHARE that owner's training program (exercises + phase +
  // version history); clearing it makes the client's training independent
  // again. Nutrition is never affected either way.
  const savePartner = async()=>{
    setSavingPartner(true); setPartnerMsg(null);
    const owner = partnerId || null;
    if(owner && owner===selected){
      setSavingPartner(false);
      setPartnerMsg({ok:false,text:"A client can't be their own training partner."});
      return;
    }
    const {error} = await supabase.from("profiles")
      .update({shared_program_owner_id:owner}).eq("id",selected);
    setSavingPartner(false);
    if(error){ setPartnerMsg({ok:false,text:error.message}); return; }
    const ownerName = clients.find(c=>c.id===owner)?.name;
    setPartnerMsg({ok:true,text:owner?`Now sharing ${ownerName||"partner"}'s training program.`:"Training unlinked — this client has an independent program again."});
    await loadClients();
  };

  // Save the client-visible coach message (profiles.coach_message). Shown to the
  // client at the top of their Dashboard + Training Plan; blank clears it.
  const saveCoachMessage = async()=>{
    setSavingCoachMsg(true); setCoachMsgStatus(null);
    const {error} = await supabase.from("profiles")
      .update({coach_message: coachMsg.trim() || null}).eq("id",selected);
    setSavingCoachMsg(false);
    if(error){ setCoachMsgStatus({ok:false,text:error.message}); return; }
    setCoachMsgStatus({ok:true,text:coachMsg.trim()?"Message saved — your client can see it now.":"Message cleared."});
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
      client_id:trainOwnerId, name:newEx.name.trim(), category:newEx.category.trim()||null,
      day_of_week:newEx.day_of_week||null, sets:parseInt(newEx.sets)||null,
      reps:newEx.reps.trim()||null, notes:newEx.notes.trim()||null,
      is_bodyweight:newEx.is_bodyweight, exercise_type:newEx.exercise_type||null, source:"coach",
    });
    await loadEx(trainOwnerId);
    setNewEx({name:"",category:"",day_of_week:"",sets:"",reps:"",notes:"",is_bodyweight:false,exercise_type:""});
    setShowAdd(false);setSaving(false);
  };
  const delEx = async(id)=>{
    // Deleting an exercise cascade-deletes its workout_logs. Warn the coach when
    // there's logged history on the line so it isn't lost silently.
    const {count} = await supabase.from("workout_logs").select("id",{count:"exact",head:true}).eq("exercise_id",id);
    const msg = count
      ? `This exercise has ${count} logged set${count>1?"s":""}. Deleting it will permanently remove that logged history too. Continue?`
      : "Remove this exercise?";
    if(!window.confirm(msg)) return;
    await supabase.from("exercises").delete().eq("id",id);
    await loadEx(trainOwnerId);
  };
  // Edit an assigned exercise in place — the coach's progression / customization knob.
  const startEditEx = (ex)=> setEditEx({id:ex.id, draft:{
    day_of_week:ex.day_of_week||"", sets:ex.sets??"", reps:ex.reps||"", notes:ex.notes||"", exercise_type:ex.exercise_type||"",
  }});
  const saveEditEx = async()=>{
    const d = editEx.draft;
    await supabase.from("exercises").update({
      day_of_week:d.day_of_week||null, sets:parseInt(d.sets)||null,
      reps:String(d.reps).trim()||null, notes:String(d.notes).trim()||null, exercise_type:d.exercise_type||null,
    }).eq("id",editEx.id);
    setEditEx(null);
    await loadEx(trainOwnerId);
  };

  // Runs the pipeline: Notion -> AI -> Supabase. scope "full" regenerates the
  // whole program (training + nutrition); "nutrition" regenerates only the
  // nutrition plan and leaves training + logged history untouched.
  const generateProgram = async(client, scope="full")=>{
    setGenerating(true); setGenScope(scope); setGenMsg(null);
    try{
      const r = await fetch("/api/generate-program",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({client_email:client.email, template_id:scope==="nutrition"?undefined:(templateId||undefined), scope}),
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||`Request failed (${r.status})`);
      if(data.scope==="nutrition"){
        setGenMsg({ok:true,text:`Nutrition plan regenerated — ${data.meals_created} meals${data.calories?`, ${data.calories} kcal/day`:""}. Training program left unchanged.`});
      }else{
        setGenMsg({ok:true,text:`Generated "${data.program}"${data.template?` from ${data.template}`:""} — ${data.exercises_created} exercises, ${data.meals_created} meals${data.calories?`, ${data.calories} kcal/day`:""}${data.exercises_preserved?` · kept ${data.exercises_preserved} exercise${data.exercises_preserved>1?"s":""} with logged history`:""}.`});
        await loadEx(trainOwnerId);
        await createProgramVersion(trainOwnerId, `AI generated${data.template?` · ${data.template}`:""}`);
      }
      setProgTick(t=>t+1);
    }catch(e){
      setGenMsg({ok:false,text:e.message});
    }finally{
      setGenerating(false); setGenScope(null);
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
            <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
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
                  {generating&&genScope==="full"?"Generating...":"⚡ Generate AI Program"}
                </Btn>
                <Btn sm teal onClick={()=>generateProgram(client,"nutrition")} disabled={generating}>
                  {generating&&genScope==="nutrition"?"Generating...":"🥗 Regenerate Nutrition Only"}
                </Btn>
                <button onClick={()=>setArchived(client, !client.archived)}
                  style={{padding:"8px 14px",fontSize:10,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",border:"1px solid "+S.border,background:"transparent",color:S.muted}}>
                  {client.archived?"Unarchive client":"Archive client"}
                </button>
              </div>
            </div>
            <div style={{fontSize:11,color:S.muted,marginTop:12}}>
              Pulls this client's intake from Notion, builds a training + nutrition plan with AI from the selected template, and publishes it to their portal. "Regenerate Nutrition Only" rebuilds just the nutrition plan and leaves the training program and logged history untouched.
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
              <Fld label="Primary Goal">
                <Inp type="text" value={settings.goal} onChange={e=>setSettings(p=>({...p,goal:e.target.value}))} placeholder="e.g. Fat loss, Hypertrophy, Strength"/>
                <button onClick={()=>resetGoalToNotion(client)} disabled={resettingGoal||syncing}
                  style={{marginTop:8,padding:"6px 12px",fontSize:10,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",border:"1px solid "+S.border,background:"transparent",color:S.muted}}>
                  {resettingGoal?"Resetting...":"↺ Reset to Notion"}
                </button>
              </Fld>
              <Fld label="Access Until">
                <Inp type="date" value={settings.access_until} onChange={e=>setSettings(p=>({...p,access_until:e.target.value}))}/>
                <div style={{fontSize:11,color:S.muted,marginTop:6,lineHeight:1.5}}>Date this client's access ends — set it when you sell a fixed term. After this date they see an "access ended" screen. Leave blank for unlimited.</div>
              </Fld>
            </div>
            <div style={{fontSize:11,color:S.muted,marginTop:2,marginBottom:2}}>
              Goal shows on this client's overview and their portal. Set it here to add or override it — your value then sticks through Notion syncs and program regenerations. Use "Reset to Notion" to load their Notion intake answer into the field; nothing changes until you click Save Settings.
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14,marginTop:18}}>
              <Btn onClick={saveSettings} disabled={savingSettings}>{savingSettings?"Saving...":"Save Settings"}</Btn>
              {settingsMsg && (
                <span style={{fontSize:12,fontWeight:600,color:settingsMsg.ok?S.accent2:"#ff6b5b"}}>{settingsMsg.text}</span>
              )}
            </div>
          </Card>
          <Card style={{marginBottom:20}}>
            <CardTitle>Training Partner</CardTitle>
            <div style={{fontSize:11,color:S.muted,marginBottom:16}}>
              Link this client to a partner to SHARE one training program — the same exercises, phase, and version history, so editing one updates both. Each partner keeps their OWN nutrition plan, workout logs, and check-ins. Log your training against the shared exercises with your own weights.
            </div>
            <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
              <Fld label="Share training program with">
                <select value={partnerId} onChange={e=>setPartnerId(e.target.value)}
                  style={{width:"100%",minWidth:240,background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                  <option value="">Independent (no partner)</option>
                  {clients
                    .filter(c=>c.id!==selected && !c.shared_program_owner_id)
                    .map(c=>(<option key={c.id} value={c.id}>{c.name||c.email}</option>))}
                </select>
              </Fld>
              <Btn onClick={savePartner} disabled={savingPartner}>{savingPartner?"Saving...":"Save Partner Link"}</Btn>
              {partnerMsg && (
                <span style={{fontSize:12,fontWeight:600,color:partnerMsg.ok?S.accent2:"#ff6b5b"}}>{partnerMsg.text}</span>
              )}
            </div>
            {selClient?.shared_program_owner_id && (
              <div style={{fontSize:12,color:S.accent2,marginTop:12,fontWeight:600}}>
                Currently sharing {clients.find(c=>c.id===selClient.shared_program_owner_id)?.name||"a partner"}'s training program.
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
          <ProgramPhase clientId={trainOwnerId} />
          <ProgramVersions clientId={trainOwnerId} refreshKey={progTick} onRestored={()=>loadEx(trainOwnerId)} />
          <CoachNutrition clientId={client.id} refreshKey={progTick} />
          <Card style={{marginBottom:20}}>
            <CardTitle>Client-Visible Message</CardTitle>
            <div style={{fontSize:11,color:S.muted,marginBottom:14}}>
              A short note your CLIENT sees at the top of their Dashboard and Training Plan. Use it for weekly feedback or encouragement. Separate from your private coach notes below. Leave blank to hide it.
            </div>
            <textarea rows={4} value={coachMsg} onChange={e=>setCoachMsg(e.target.value)}
              placeholder="e.g. Great work last week — bump squat to 3×5 and prioritize sleep. Proud of you."
              style={{width:"100%",background:S.surface2,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none",resize:"vertical"}}/>
            <div style={{display:"flex",alignItems:"center",gap:14,marginTop:14}}>
              <Btn onClick={saveCoachMessage} disabled={savingCoachMsg}>{savingCoachMsg?"Saving...":"Save Message"}</Btn>
              {coachMsgStatus && (
                <span style={{fontSize:12,fontWeight:600,color:coachMsgStatus.ok?S.accent2:"#ff6b5b"}}>{coachMsgStatus.text}</span>
              )}
            </div>
          </Card>
          <CoachHabits clientId={client.id} />
          <CoachClientInsights client={client} />
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
                      {DAY_ORDER.map((d,i)=><option key={d} value={d}>{"Day "+(i+1)}</option>)}
                    </select>
                  </Fld>
                  <Fld label="Sets"><Inp type="number" value={newEx.sets} onChange={e=>setNewEx(p=>({...p,sets:e.target.value}))} placeholder="e.g. 4"/></Fld>
                  <Fld label="Reps"><Inp type="text" value={newEx.reps} onChange={e=>setNewEx(p=>({...p,reps:e.target.value}))} placeholder="e.g. 8-12"/></Fld>
                  <Fld label="Type">
                    <RG options={["Weighted","Bodyweight"]} value={newEx.is_bodyweight?"Bodyweight":"Weighted"} onChange={v=>setNewEx(p=>({...p,is_bodyweight:v==="Bodyweight"}))}/>
                  </Fld>
                  <Fld label="Progress Type">
                    <select value={newEx.exercise_type} onChange={e=>setNewEx(p=>({...p,exercise_type:e.target.value}))}
                      style={{width:"100%",background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                      <option value="">Auto-detect</option>
                      {EX_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
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
            {groupByDay(exercises).map(({day,exercises:dayExs,label})=>(
            <DayFolder key={day} title={label} meta={`${dayExs.length} exercise${dayExs.length>1?"s":""}`}>
            {isMobile ? (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {dayExs.map(ex=>{
                const editing = editEx?.id===ex.id;
                const d = editEx?.draft || {};
                const setD = (k,v)=>setEditEx(p=>({...p,draft:{...p.draft,[k]:v}}));
                const eInp = {background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:14,outline:"none",width:"100%"};
                const lbl = {fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted,marginBottom:4,display:"block"};
                return (
                  <div key={ex.id} style={{background:S.surface2,border:"1px solid "+S.border,padding:14}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,marginBottom:editing?12:8}}>
                      {ex.name}{ex.is_bodyweight&&<span style={{marginLeft:6,fontSize:9,color:S.muted}}>BW</span>}
                    </div>
                    {editing?(
                      <>
                        <div style={{marginBottom:10}}><label style={lbl}>Day</label><select value={d.day_of_week} onChange={e=>setD("day_of_week",e.target.value)} style={eInp}><option value="">—</option>{DAY_ORDER.map((x,i)=><option key={x} value={x}>{"Day "+(i+1)}</option>)}</select></div>
                        <div style={{display:"flex",gap:10,marginBottom:10}}>
                          <div style={{flex:1}}><label style={lbl}>Sets</label><input type="number" value={d.sets} onChange={e=>setD("sets",e.target.value)} style={eInp}/></div>
                          <div style={{flex:1}}><label style={lbl}>Reps</label><input type="text" value={d.reps} onChange={e=>setD("reps",e.target.value)} style={eInp}/></div>
                        </div>
                        <div style={{marginBottom:10}}><label style={lbl}>Progress Type</label><select value={d.exercise_type} onChange={e=>setD("exercise_type",e.target.value)} style={eInp}><option value="">Auto-detect</option>{EX_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                        <div style={{marginBottom:12}}><label style={lbl}>Notes</label><input type="text" value={d.notes} onChange={e=>setD("notes",e.target.value)} style={eInp}/></div>
                        <div style={{display:"flex",gap:8}}>
                          <Btn sm teal onClick={saveEditEx}>Save</Btn>
                          <button onClick={()=>setEditEx(null)} style={{padding:"7px 14px",fontSize:10,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600}}>Cancel</button>
                        </div>
                      </>
                    ):(
                      <>
                        <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:S.muted,marginBottom:ex.notes?8:12}}>
                          <span><span style={{opacity:.65}}>Sets </span>{ex.sets??"—"}</span>
                          <span><span style={{opacity:.65}}>Reps </span>{ex.reps||"—"}</span>
                          {ex.exercise_type&&<span><span style={{opacity:.65}}>Type </span>{ex.exercise_type}</span>}
                        </div>
                        {ex.notes&&<div style={{fontSize:13,lineHeight:1.6,color:S.text,marginBottom:12}}>{ex.notes}</div>}
                        <div style={{display:"flex",gap:8}}>
                          <Btn sm teal onClick={()=>startEditEx(ex)}>Edit</Btn>
                          <Btn sm danger onClick={()=>delEx(ex.id)}>Remove</Btn>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Exercise","Day","Sets","Reps","Type","Notes",""].map(h=><th key={h} style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,textAlign:"left",padding:"10px 14px",borderBottom:"1px solid "+S.border}}>{h}</th>)}</tr></thead>
              <tbody>
                {dayExs.map(ex=>{
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
                          <td style={cell}><select value={d.day_of_week} onChange={e=>setD("day_of_week",e.target.value)} style={eInp}><option value="">—</option>{DAY_ORDER.map((x,i)=><option key={x} value={x}>{"Day "+(i+1)}</option>)}</select></td>
                          <td style={cell}><input type="number" value={d.sets} onChange={e=>setD("sets",e.target.value)} style={{...eInp,width:60}}/></td>
                          <td style={cell}><input type="text" value={d.reps} onChange={e=>setD("reps",e.target.value)} style={{...eInp,width:80}}/></td>
                          <td style={cell}><select value={d.exercise_type} onChange={e=>setD("exercise_type",e.target.value)} style={{...eInp,width:110}}><option value="">Auto</option>{EX_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
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
                          <td style={{...cell,color:S.muted}}>{label}</td>
                          <td style={{...cell,color:S.muted}}>{ex.sets??"—"}</td>
                          <td style={{...cell,color:S.muted}}>{ex.reps||"—"}</td>
                          <td style={{...cell,color:S.muted}}>{ex.exercise_type||<span style={{opacity:.55,fontStyle:"italic"}}>Auto</span>}</td>
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
            )}
            </DayFolder>
            ))}
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
      {selected&&(selected.client_type==="program_only" ? <ProgramProgress profile={selected}/> : <Progress profile={selected} coachView/>)}
      {clients.length===0&&<div style={{color:S.muted,fontSize:13}}>No clients yet.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COACH — BUSINESS + CONTENT METRICS DASHBOARD (daily entry -> weekly rollup)
// In-app only, no live Notion pull (matches the CRM's one-time-backfill
// approach) -- excludes Fitness/Discipline by design (Business+Content only).
// ---------------------------------------------------------------------------
// Placeholder weekly targets -- the coach can adjust these; not sourced from
// the Notion Weekly Outreach Metrics thresholds (not inspected here).
const WEEKLY_TARGETS = { dms_sent: 350, sales_conversations: 20, calls_booked: 10, clients_closed: 2, revenue_today: 3000 };
function weekStatus(total, target) {
  if (!target) return null;
  const pct = total / target;
  return pct >= 1.1 ? "Ahead" : pct >= 0.9 ? "On Track" : "Behind";
}
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

  const load = useCallback(async () => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const { data } = await supabase.from("daily_metrics").select("*").gte("date", cutoff.toISOString().split("T")[0]).order("date");
    setRows(data || []);
    const t = (data || []).find((r) => r.date === dateStr);
    if (t) setToday({ ...t });
    setLoading(false);
  }, [dateStr]);
  useEffect(() => { load(); }, [load]);

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
    load();
  };

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const byWeek = {};
  rows.forEach((r) => { const wk = isoWeekStart(r.date); (byWeek[wk] = byWeek[wk] || []).push(r); });
  const weeks = Object.keys(byWeek).sort().reverse().slice(0, 8);
  const sum = (list, key) => list.reduce((a, r) => a + (Number(r[key]) || 0), 0);
  const METRIC_KEYS = ["dms_sent", "sales_conversations", "calls_booked", "clients_closed", "revenue_today"];
  const METRIC_LABEL = { dms_sent: "DMs Sent", sales_conversations: "Sales Conversations", calls_booked: "Calls Booked", clients_closed: "Clients Closed", revenue_today: "Revenue" };
  const badge = (status) => !status ? null : (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "3px 8px", marginLeft: 6,
      background: status === "Ahead" ? "rgba(0,201,167,.14)" : status === "On Track" ? "rgba(198,255,0,.14)" : "rgba(255,107,91,.14)",
      color: status === "Ahead" ? S.accent2 : status === "On Track" ? S.neon : "#ff6b5b" }}>{status}</span>
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
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 12 }}>On Track / Behind / Ahead, same scale as Weekly Outreach Metrics — that schema has no "Red Flag" tier yet, so none is shown here either.</div>
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
                    <td style={{ padding: "8px 10px", fontSize: 12, color: S.text }}>{wk}</td>
                    {METRIC_KEYS.map((k) => {
                      const total = sum(list, k);
                      return (
                        <td key={k} style={{ padding: "8px 10px", fontSize: 12, color: S.text, whiteSpace: "nowrap" }}>
                          {k === "revenue_today" ? `$${total.toFixed(0)}` : total}{badge(weekStatus(total, WEEKLY_TARGETS[k]))}
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
      <InvoiceCard profile={profile} />
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
      {page === "habits" && (programOnly ? <ProgramHabits profile={profile} /> : <Habits profile={profile} />)}
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

function CRMPanel() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dueOnly, setDueOnly] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateLead = async (id, patch) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await supabase.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
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
              {lead.intake_data?.budget && <div style={{ fontSize: 12, color: S.text, marginBottom: 8 }}>Budget: <strong>{lead.intake_data.budget}</strong></div>}
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
                      onBlur={(e) => supabase.from("leads").update({ invoice_link: e.target.value, updated_at: new Date().toISOString() }).eq("id", lead.id)} />
                  </Fld>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <Btn onClick={() => updateLead(lead.id, { invoice_sent_at: new Date().toISOString() })}>{lead.invoice_sent_at ? "Invoice marked sent ✓" : "Mark invoice sent"}</Btn>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!lead.paid} onChange={(e) => updateLead(lead.id, { paid: e.target.checked })} /> Paid
                    </label>
                  </div>
                </div>
              )}
              <Fld label="Follow-up reminder">
                <Inp type="date" value={lead.follow_up_date || ""} onChange={(e) => updateLead(lead.id, { follow_up_date: e.target.value || null })} />
              </Fld>
              <Fld label="Notes">
                <textarea defaultValue={lead.notes || ""} rows={2}
                  onChange={(e) => setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, notes: e.target.value } : l)))}
                  onBlur={(e) => supabase.from("leads").update({ notes: e.target.value, updated_at: new Date().toISOString() }).eq("id", lead.id)}
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

  return (
    <Shell profile={profile} isCoach={true} logout={logout} page={page} setPage={setPage}>
      {page === "dashboard" && <CoachHome setPage={setPage} />}
      {page === "clients" && <ClientsPanel />}
      {page === "crm" && <CRMPanel />}
      {page === "metrics" && <MetricsDashboard />}
      {page === "assess" && <AssessmentsPanel />}
      {page === "templates" && <TemplatesPanel />}
      {page === "library" && <ResourcesPanel />}
      {page === "progress" && <CoachProgress />}
    </Shell>
  );
}
