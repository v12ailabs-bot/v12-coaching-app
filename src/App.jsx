import { useState, useEffect, useCallback } from “react”;
import { createClient } from “@supabase/supabase-js”;
import {
LineChart, Line, BarChart, Bar, XAxis, YAxis,
CartesianGrid, Tooltip, ResponsiveContainer
} from “recharts”;

const SUPABASE_URL = “https://dbmkdrytjeppcbhuzkxh.supabase.co”;
const SUPABASE_KEY = “eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibWtkcnl0amVwcGNiaHV6a3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzU0ODEsImV4cCI6MjA5MjgxMTQ4MX0.D9UY3I0yEYDw8lpCwRHqwx2wSN39yUKvEM5PsQiQmlM”;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const COACH_EMAIL = “coach@v12system.com”;

const STYLES = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } :root { --bg: #0A0A0B; --surface: #111113; --surface2: #18181C; --border: #222228; --accent: #FF4D00; --accent2: #00C9A7; --text: #F0EEE8; --muted: #666670; --font-display: 'Bebas Neue', sans-serif; --font-body: 'DM Sans', sans-serif; } body { background: var(--bg); color: var(--text); font-family: var(--font-body); } .app { min-height: 100vh; } .login-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); position: relative; overflow: hidden; } .login-bg { position: absolute; inset: 0; background: radial-gradient(ellipse at 25% 50%, rgba(255,77,0,0.13) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0,201,167,0.07) 0%, transparent 50%); } .login-card { position: relative; z-index: 1; background: var(--surface); border: 1px solid var(--border); padding: 48px 40px; width: 420px; max-width: 95vw; } .login-logo { font-family: var(--font-display); font-size: 56px; color: var(--accent); line-height: 1; } .login-tagline { font-size: 11px; letter-spacing: 3px; color: var(--muted); text-transform: uppercase; margin-bottom: 36px; margin-top: 2px; } .login-tabs { display: flex; border: 1px solid var(--border); margin-bottom: 28px; } .login-tab { flex: 1; padding: 10px; text-align: center; font-size: 12px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; background: transparent; color: var(--muted); border: none; font-family: var(--font-body); transition: all 0.2s; } .login-tab.active { background: var(--accent); color: white; } .field { margin-bottom: 16px; } .field label { display: block; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; } .field input, .field select, .field textarea { width: 100%; background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 12px 14px; font-family: var(--font-body); font-size: 14px; outline: none; transition: border 0.2s; } .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--accent); } .field textarea { resize: vertical; } .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 24px; font-family: var(--font-body); font-size: 12px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; border: none; transition: all 0.2s; } .btn-primary { background: var(--accent); color: white; width: 100%; padding: 14px; } .btn-primary:hover { background: #ff6020; } .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; } .btn-ghost { background: transparent; color: var(--text); border: 1px solid var(--border); } .btn-ghost:hover { border-color: var(--accent); color: var(--accent); } .btn-teal { background: var(--accent2); color: #0A0A0B; } .btn-teal:hover { background: #00b898; } .btn-sm { padding: 7px 14px; font-size: 10px; } .btn-danger { background: #c0392b; color: white; } .topbar { height: 54px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; position: sticky; top: 0; z-index: 100; } .topbar-logo { font-family: var(--font-display); font-size: 30px; color: var(--accent); } .topbar-right { display: flex; align-items: center; gap: 14px; } .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; } .user-name { font-size: 13px; color: var(--muted); } .layout { display: flex; min-height: calc(100vh - 54px); } .sidebar { width: 216px; background: var(--surface); border-right: 1px solid var(--border); padding: 20px 0; flex-shrink: 0; position: sticky; top: 54px; height: calc(100vh - 54px); overflow-y: auto; } .nav-section { padding: 0 14px; margin-bottom: 6px; } .nav-label { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--muted); padding: 0 10px; margin-bottom: 6px; } .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; border-radius: 3px; transition: all 0.15s; margin-bottom: 1px; } .nav-item:hover { background: var(--surface2); color: var(--text); } .nav-item.active { background: rgba(255,77,0,0.12); color: var(--accent); } .nav-icon { font-size: 15px; width: 20px; text-align: center; } .main { flex: 1; padding: 28px; overflow-y: auto; } .page-title { font-family: var(--font-display); font-size: 38px; color: var(--text); line-height: 1; margin-bottom: 4px; } .page-sub { font-size: 13px; color: var(--muted); margin-bottom: 28px; } .card { background: var(--surface); border: 1px solid var(--border); padding: 24px; margin-bottom: 20px; } .card-title { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; } .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; } .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; } .stat-tile { background: var(--surface); border: 1px solid var(--border); padding: 20px; } .stat-label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; } .stat-value { font-family: var(--font-display); font-size: 34px; line-height: 1; } .stat-unit { font-size: 13px; color: var(--muted); } .badge { display: inline-flex; align-items: center; padding: 3px 10px; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; } .badge-green { background: rgba(0,201,167,0.15); color: var(--accent2); } .badge-orange { background: rgba(255,77,0,0.15); color: var(--accent); } .badge-grey { background: rgba(102,102,112,0.2); color: var(--muted); } .table { width: 100%; border-collapse: collapse; } .table th { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border); } .table td { padding: 11px 14px; font-size: 13px; border-bottom: 1px solid var(--border); } .table tr:last-child td { border-bottom: none; } .table tr:hover td { background: var(--surface2); } .slider-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-bottom: 6px; } .slider-val { color: var(--accent); font-weight: 600; } input[type=range] { width: 100%; -webkit-appearance: none; height: 3px; background: var(--border); outline: none; } input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%; background: var(--accent); cursor: pointer; } .radio-group { display: flex; gap: 8px; flex-wrap: wrap; } .radio-btn { padding: 6px 14px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: transparent; color: var(--muted); font-family: var(--font-body); transition: all 0.15s; } .radio-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(255,77,0,0.08); } .checkin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } .set-row { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; } .set-row input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 10px; font-family: var(--font-body); font-size: 13px; width: 80px; outline: none; } .set-row input:focus { border-color: var(--accent); } .set-num { font-size: 11px; color: var(--muted); width: 42px; } .tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 24px; } .tab { padding: 10px 20px; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: var(--font-body); } .tab.active { color: var(--accent); border-bottom-color: var(--accent); } .chart-wrap { height: 230px; } .chart-title { font-family: var(--font-display); font-size: 20px; margin-bottom: 2px; } .chart-sub { font-size: 11px; color: var(--muted); margin-bottom: 14px; } .client-row { background: var(--surface); border: 1px solid var(--border); padding: 18px 20px; display: flex; align-items: center; gap: 16px; cursor: pointer; transition: border 0.15s; margin-bottom: 10px; } .client-row:hover { border-color: var(--accent); } .client-avatar { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; } .notif { background: rgba(255,77,0,0.09); border: 1px solid rgba(255,77,0,0.25); padding: 13px 18px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; } .success-msg { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; background: rgba(0,201,167,0.14); color: var(--accent2); font-size: 12px; font-weight: 600; letter-spacing: 1px; } .error-msg { color: var(--accent); font-size: 12px; margin-top: 8px; } .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 80px auto; } @keyframes spin { to { transform: rotate(360deg); } } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: var(--bg); } ::-webkit-scrollbar-thumb { background: var(--border); } @media (max-width: 768px) { .sidebar { display: none; } .grid-2,.grid-3,.grid-4,.checkin-grid { grid-template-columns: 1fr; } .main { padding: 16px; } }`;

const todayStr = () => new Date().toISOString().split(“T”)[0];
const avatarFrom = (name = “”) => name.split(” “).map(w => w[0]).join(””).slice(0, 2).toUpperCase() || “?”;
const COLORS = [”#FF4D00”,”#00C9A7”,”#8B5CF6”,”#3B82F6”,”#F59E0B”,”#EC4899”];
const TT = { contentStyle: { background: “#111113”, border: “1px solid #222228”, fontSize: 12 } };

export default function App() {
const [session, setSession] = useState(undefined);
const [profile, setProfile] = useState(null);
const [page, setPage] = useState(“dashboard”);

const fetchProfile = useCallback(async (uid) => {
const { data } = await supabase.from(“profiles”).select(”*”).eq(“id”, uid).single();
if (data) setProfile(data);
}, []);

useEffect(() => {
let mounted = true;

```
supabase.auth.getSession().then(({ data: { session } }) => {
  if (!mounted) return;
  setSession(session);
  if (session) fetchProfile(session.user.id);
});

const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  if (!mounted) return;
  setSession(session);
  if (session) {
    fetchProfile(session.user.id);
  } else {
    setProfile(null);
  }
});

return () => { mounted = false; subscription.unsubscribe(); };
```

}, [fetchProfile]);

const handleLogout = async () => {
await supabase.auth.signOut();
setProfile(null);
setPage(“dashboard”);
};

// Still loading session
if (session === undefined) {
return <div className="app"><style>{STYLES}</style><div className="spinner" /></div>;
}

// Not logged in
else { setSuccess(“Account created! Please sign in.”); setTab(“signin”); }
setLoading(false);
};

return (
<div className="login-screen">
<style>{STYLES}</style>
<div className="login-bg" />
<div className="login-card">
<div className="login-logo">V12</div>
<div className="login-tagline">System · Client Portal</div>
<div className="login-tabs">
<button className={`login-tab ${tab === "signin" ? "active" : ""}`} onClick={() => { setTab(“signin”); setError(””); setSuccess(””); }}>Sign In</button>
<button className={`login-tab ${tab === "signup" ? "active" : ""}`} onClick={() => { setTab(“signup”); setError(””); setSuccess(””); }}>Create Account</button>
</div>
{tab === “signup” && (
<div className="field"><label>Full Name</label><input type=“text” value={name} onChange={e => setName(e.target.value)} placeholder=“Your full name” /></div>
)}
<div className="field"><label>Email</label><input type=“email” value={email} onChange={e => setEmail(e.target.value)} placeholder=“you@gmail.com” onKeyDown={e => e.key === “Enter” && (tab === “signin” ? handleSignIn() : handleSignUp())} /></div>
<div className="field"><label>Password</label><input type=“password” value={password} onChange={e => setPassword(e.target.value)} placeholder=”••••••••” onKeyDown={e => e.key === “Enter” && (tab === “signin” ? handleSignIn() : handleSignUp())} /></div>
{error && <p className="error-msg">{error}</p>}
{success && <div className=“success-msg” style={{ marginBottom: 12, display: “flex” }}>✅ {success}</div>}
<button className=“btn btn-primary” style={{ marginTop: 8 }} onClick={tab === “signin” ? handleSignIn : handleSignUp} disabled={loading}>
{loading ? “Please wait…” : tab === “signin” ? “Sign In” : “Create Account”}
</button>
<p style={{ marginTop: 16, fontSize: 11, color: “var(–muted)”, textAlign: “center”, lineHeight: 1.7 }}>
const streak = (() => { let s = 0; for (let i = checkins.length - 1; i >= 0; i–) { if (checkins[i].workout === “completed”) s++; else break; } return s; })();

return (
<div>
<div className="page-title">Welcome back, {(profile.name || “”).split(” “)[0] || “Athlete”}.</div>
<div className="page-sub">{profile.goal || “Keep pushing.”}</div>
{!doneToday && (
<div className="notif">
<span style={{ fontSize: 13 }}>🔔 <strong style={{ color: “var(–accent)” }}>Reminder:</strong> Daily check-in not done yet today.</span>
<button className=“btn btn-primary btn-sm” style={{ width: “auto” }} onClick={() => setPage(“daily”)}>Do it now</button>
</div>
)}
<div className=“grid-4” style={{ marginBottom: 22 }}>
{[[“Current Weight”, lastWeight, “lb”], [“Workout Streak”, streak, “days”], [“Avg Sleep”, avgSleep, “/10”], [“Avg Energy”, avgEnergy, “/10”]].map(([label, val, unit]) => (
<div className="stat-tile" key={label}>
<div className="stat-label">{label}</div>
<div className="stat-value">{val}<span className="stat-unit">{unit}</span></div>
</div>
))}
</div>
{checkins.length > 1 ? (
<div className="grid-2">
<div className="card">
<div className="card-title">Weight — Last 30 Days</div>
<div className="chart-wrap">
<ResponsiveContainer width="100%" height="100%">
<LineChart data={checkins.slice(-30)}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“date” tick={{ fontSize: 10, fill: “#666” }} tickFormatter={d => d.slice(5)} interval={6} />
<YAxis domain={[“auto”, “auto”]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Line type="monotone" dataKey="weight" stroke="#FF4D00" strokeWidth={2} dot={false} />
</LineChart>
</ResponsiveContainer>
</div>
</div>
<div className="card">
<div className="card-title">Energy & Sleep — 14 Days</div>
<div className="chart-wrap">
<ResponsiveContainer width="100%" height="100%">
<LineChart data={checkins.slice(-14)}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“date” tick={{ fontSize: 10, fill: “#666” }} tickFormatter={d => d.slice(5)} interval={3} />
<YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Line type="monotone" dataKey="energy" stroke="#FF4D00" strokeWidth={2} dot={false} name="Energy" />
<Line type="monotone" dataKey="sleep" stroke="#00C9A7" strokeWidth={2} dot={false} name="Sleep" />
</LineChart>
</ResponsiveContainer>
</div>
</div>
</div>
) : (
<div className=“card” style={{ textAlign: “center”, padding: 48 }}>
<div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
<div style={{ fontFamily: “var(–font-display)”, fontSize: 24, marginBottom: 8 }}>No check-ins yet</div>
<div style={{ color: “var(–muted)”, fontSize: 13, marginBottom: 20 }}>Log your first daily check-in to start tracking.</div>
<button className=“btn btn-primary” style={{ maxWidth: 200 }} onClick={() => setPage(“daily”)}>Start Now</button>
</div>
)}
</div>
);
}

function DailyCheckin({ profile, onDone }) {
const [form, setForm] = useState({ weight: “”, sleep: 7, energy: 7, mood: 7, water: 8, diet: “On track”, workout: “completed” });
const [loading, setLoading] = useState(false);
const [saved, setSaved] = useState(false);
const [existing, setExisting] = useState(null);
const set = (k, v) => setForm(p => ({ …p, [k]: v }));

useEffect(() => {
supabase.from(“daily_checkins”).select(”*”).eq(“client_id”, profile.id).eq(“date”, todayStr()).maybeSingle()
.then(({ data }) => { if (data) { setExisting(data); setForm({ weight: data.weight || “”, sleep: data.sleep, energy: data.energy, mood: data.mood, water: data.water, diet: data.diet, workout: data.workout }); } });
}, [profile.id]);

const handleSubmit = async () => {
setLoading(true);
const entry = { client_id: profile.id, date: todayStr(), …form, weight: parseFloat(form.weight) || null };
{loading ? “Saving…” : “Log Check-In”}
</button>
</div>
</div>
);
}

function WeeklyCheckin({ profile, onDone }) {
const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split(“T”)[0]; })();
const [form, setForm] = useState({ chest: “”, waist: “”, hips: “”, arms: “”, feeling: 7, goal_progress: 70, notes: “” });
const [loading, setLoading] = useState(false);
const [saved, setSaved] = useState(false);
const [existing, setExisting] = useState(null);
const set = (k, v) => setForm(p => ({ …p, [k]: v }));

useEffect(() => {
supabase.from(“weekly_checkins”).select(”*”).eq(“client_id”, profile.id).eq(“date”, weekStart).maybeSingle()
.then(({ data }) => { if (data) { setExisting(data); setForm({ chest: data.chest || “”, waist: data.waist || “”, hips: data.hips || “”, arms: data.arms || “”, feeling: data.feeling, goal_progress: data.goal_progress, notes: data.notes || “” }); } });
}, [profile.id]);

const handleSubmit = async () => {
setLoading(true);
const entry = { client_id: profile.id, date: weekStart, …form, chest: parseFloat(form.chest) || null, waist: parseFloat(form.waist) || null, hips: parseFloat(form.hips) || null, arms: parseFloat(form.arms) || null };
{loading ? “Saving…” : “Submit Weekly Check-In”}
</button>
</div>
</div>
);
}

function ProgressCharts({ profile }) {
const [tab, setTab] = useState(“weight”);
const [daily, setDaily] = useState([]);
const [weekly, setWeekly] = useState([]);

useEffect(() => {
supabase.from(“daily_checkins”).select(”*”).eq(“client_id”, profile.id).order(“date”).then(({ data }) => setDaily(data || []));
supabase.from(“weekly_checkins”).select(”*”).eq(“client_id”, profile.id).order(“date”).then(({ data }) => setWeekly((data || []).map((w, i) => ({ …w, week: `Wk${i + 1}` }))));
}, [profile.id]);

const CC = ({ title, sub, children }) => (
<div className="card"><div className="chart-title">{title}</div><div className="chart-sub">{sub}</div><div className="chart-wrap">{children}</div></div>
);
const empty = <div className=“card” style={{ textAlign: “center”, padding: 40, color: “var(–muted)” }}>No data yet. Complete check-ins to see charts.</div>;

return (
<div>
<div className="page-title">Progress</div>
<div className="page-sub">Your data over time</div>
<div className="tabs">
{[[“weight”, “Weight”], [“wellness”, “Wellness”], [“measurements”, “Measurements”], [“goals”, “Goals”]].map(([id, label]) => (
<button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
))}
</div>
{tab === “weight” && (daily.length < 2 ? empty : (
<div className="grid-2">
<CC title="Bodyweight Trend" sub="Last 30 days">
<ResponsiveContainer width="100%" height="100%">
<LineChart data={daily.slice(-30)}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“date” tick={{ fontSize: 10, fill: “#666” }} tickFormatter={d => d.slice(5)} interval={6} />
<YAxis domain={[“auto”, “auto”]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Line type=“monotone” dataKey=“weight” stroke=”#FF4D00” strokeWidth={2} dot={{ r: 2 }} />
</LineChart>
</ResponsiveContainer>
</CC>
<CC title="Workout Completion" sub="Last 30 days">
<ResponsiveContainer width="100%" height="100%">
<BarChart data={daily.slice(-30).map(d => ({ …d, done: d.workout === “completed” ? 1 : 0 }))}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“date” tick={{ fontSize: 10, fill: “#666” }} tickFormatter={d => d.slice(5)} interval={6} />
<YAxis tick={false} />
<Tooltip {…TT} formatter={v => [v ? “✅ Done” : “Rest/Missed”, “”]} />
<Bar dataKey=“done” fill=”#FF4D00” radius={[2, 2, 0, 0]} />
</BarChart>
</ResponsiveContainer>
</CC>
</div>
))}
{tab === “wellness” && (daily.length < 2 ? empty : (
<div className="grid-2">
{[[“energy”, “#FF4D00”, “Energy”], [“sleep”, “#00C9A7”, “Sleep Quality”], [“mood”, “#8B5CF6”, “Mood”], [“water”, “#3B82F6”, “Water (glasses)”]].map(([key, color, label]) => (
<CC key={key} title={label} sub="14-day trend">
<ResponsiveContainer width="100%" height="100%">
<LineChart data={daily.slice(-14)}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“date” tick={{ fontSize: 10, fill: “#666” }} tickFormatter={d => d.slice(5)} interval={3} />
<YAxis domain={[0, key === “water” ? 16 : 10]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} />
</LineChart>
</ResponsiveContainer>
</CC>
))}
</div>
))}
{tab === “measurements” && (weekly.length === 0 ? empty : (
<div className="grid-2">
{[[“chest”, “Chest”], [“waist”, “Waist”], [“hips”, “Hips”], [“arms”, “Arms”]].map(([key, label]) => (
<CC key={key} title={`${label} (inches)`} sub=“Weekly tracking”>
<ResponsiveContainer width="100%" height="100%">
<LineChart data={weekly}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“week” tick={{ fontSize: 10, fill: “#666” }} />
<YAxis domain={[“auto”, “auto”]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Line type=“monotone” dataKey={key} stroke=”#00C9A7” strokeWidth={2} dot={{ r: 3 }} />
</LineChart>
</ResponsiveContainer>
</CC>
))}
</div>
))}
{tab === “goals” && (weekly.length === 0 ? empty : (
<div className="grid-2">
<CC title="Goal Progress" sub="Weekly %">
<ResponsiveContainer width="100%" height="100%">
<BarChart data={weekly}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“week” tick={{ fontSize: 10, fill: “#666” }} />
<YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} formatter={v => [`${v}%`, “Progress”]} />
<Bar dataKey=“goal_progress” fill=”#FF4D00” radius={[4, 4, 0, 0]} />
</BarChart>
</ResponsiveContainer>
</CC>
<CC title="Weekly Feeling" sub="Overall rating">
<ResponsiveContainer width="100%" height="100%">
<LineChart data={weekly}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“week” tick={{ fontSize: 10, fill: “#666” }} />
<YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Line type=“monotone” dataKey=“feeling” stroke=”#00C9A7” strokeWidth={2} dot={{ r: 3 }} />
</LineChart>
</ResponsiveContainer>
</CC>
</div>
))}
</div>
);
}

function WorkoutLog({ profile }) {
const [exercises, setExercises] = useState([]);
const [logs, setLogs] = useState([]);
const [selected, setSelected] = useState(null);
const [logMode, setLogMode] = useState(false);
const [sets, setSets] = useState([{ weight: “”, reps: “”, time: “” }, { weight: “”, reps: “”, time: “” }, { weight: “”, reps: “”, time: “” }, { weight: “”, reps: “”, time: “” }]);
const [saving, setSaving] = useState(false);
const [saved, setSaved] = useState(false);

const loadEx = useCallback(async () => {
const { data } = await supabase.from(“exercises”).select(”*”).eq(“client_id”, profile.id).order(“created_at”);
<div style={{ fontFamily: “var(–font-display)”, fontSize: 22, marginBottom: 8 }}>No exercises assigned yet</div>
<div style={{ color: “var(–muted)”, fontSize: 13 }}>Your coach will assign your program. Check back soon.</div>
</div>
) : (
<>
<div style={{ display: “flex”, gap: 8, flexWrap: “wrap”, marginBottom: 22 }}>
{exercises.map(ex => (
<button key={ex.id} className={`radio-btn ${selected === ex.id ? "active" : ""}`} onClick={() => { setSelected(ex.id); setLogMode(false); }}>{ex.name}</button>
))}
</div>
{selectedEx && (
<>
<div className=“grid-2” style={{ marginBottom: 20 }}>
<div className="card">
<div className="chart-title">{selectedEx.name} — {selectedEx.is_bodyweight ? “Reps” : “Weight (lbs)”}</div>
<div className="chart-sub">Progress over time</div>
<div className="chart-wrap">
{chartData.length === 0
? <div style={{ display: “flex”, alignItems: “center”, justifyContent: “center”, height: “100%”, color: “var(–muted)”, fontSize: 13 }}>Log sessions to see chart</div>
: <ResponsiveContainer width="100%" height="100%">
<LineChart data={chartData}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“date” tick={{ fontSize: 10, fill: “#666” }} tickFormatter={d => d.slice(5)} />
<YAxis domain={[“auto”, “auto”]} tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Line type=“monotone” dataKey={selectedEx.is_bodyweight ? “reps” : “weight”} stroke=”#FF4D00” strokeWidth={2} dot={{ r: 3 }} />
</LineChart>
</ResponsiveContainer>
}
</div>
</div>
<div className="card">
<div className="chart-title">Reps per Session</div>
<div className="chart-sub">Top set reps over time</div>
<div className="chart-wrap">
{chartData.length === 0
? <div style={{ display: “flex”, alignItems: “center”, justifyContent: “center”, height: “100%”, color: “var(–muted)”, fontSize: 13 }}>No data yet</div>
: <ResponsiveContainer width="100%" height="100%">
<BarChart data={chartData}>
<CartesianGrid strokeDasharray="3 3" stroke="#222228" />
<XAxis dataKey=“date” tick={{ fontSize: 10, fill: “#666” }} tickFormatter={d => d.slice(5)} />
<YAxis tick={{ fontSize: 10, fill: “#666” }} />
<Tooltip {…TT} />
<Bar dataKey=“reps” fill=”#00C9A7” radius={[4, 4, 0, 0]} />
</BarChart>
</ResponsiveContainer>
}
</div>
</div>
</div>
<div className="card">
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 16 }}>
<div className=“card-title” style={{ margin: 0 }}>Session History</div>
<button className=“btn btn-teal btn-sm” onClick={() => setLogMode(!logMode)}>{logMode ? “Cancel” : “+ Log Session”}</button>
</div>
{logMode && (
<div style={{ marginBottom: 20, padding: 16, background: “var(–surface2)”, border: “1px solid var(–border)” }}>
<div style={{ fontFamily: “var(–font-display)”, fontSize: 18, marginBottom: 14 }}>Log {selectedEx.name}</div>
{sets.map((s, i) => (
<div className="set-row" key={i}>
<span className="set-num">Set {i + 1}</span>
{!selectedEx.is_bodyweight && <input type=“number” placeholder=“lbs” value={s.weight} onChange={e => { const n = […sets]; n[i].weight = e.target.value; setSets(n); }} />}
<input type=“number” placeholder=“reps” value={s.reps} onChange={e => { const n = […sets]; n[i].reps = e.target.value; setSets(n); }} />
<input type=“text” placeholder=“time (opt)” value={s.time} onChange={e => { const n = […sets]; n[i].time = e.target.value; setSets(n); }} style={{ width: 100 }} />
</div>
))}
<button className=“btn btn-primary” style={{ maxWidth: 180, marginTop: 14 }} onClick={handleLog} disabled={saving}>{saving ? “Saving…” : “Save Session”}</button>
</div>
)}
<table className="table">
<thead><tr><th>Date</th><th>Weight</th><th>Reps</th><th>Set #</th><th>Time</th></tr></thead>
<tbody>
{[…logs].reverse().map((row, i) => (
<tr key={i}><td>{row.date}</td><td>{row.weight ? `${row.weight} lbs` : “BW”}</td><td>{row.reps || “—”}</td><td>{row.sets}</td><td>{row.time || “—”}</td></tr>
))}
{logs.length === 0 && <tr><td colSpan={5} style={{ color: “var(–muted)”, textAlign: “center” }}>No sessions logged yet</td></tr>}
</tbody>
</table>
</div>
</>
)}
</>
)}
</div>
);
}

function CoachDashboard({ setPage }) {
const [clients, setClients] = useState([]);
const [counts, setCounts] = useState({});
const [loading, setLoading] = useState(true);

useEffect(() => {
const load = async () => {
const { data } = await supabase.from(“profiles”).select(”*”).neq(“email”, COACH_EMAIL);
{clients.length === 0 && <div style={{ color: “var(–muted)”, fontSize: 13, padding: “20px 0” }}>No clients yet. Share the app URL with your clients.</div>}
{clients.map((c, i) => (
<div className=“client-row” key={c.id} onClick={() => setPage(“clients”)}>
<div className=“client-avatar” style={{ background: COLORS[i % COLORS.length], color: “white” }}>{avatarFrom(c.name || c.email)}</div>
<div style={{ flex: 1 }}>
<div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || c.email}</div>
<div style={{ fontSize: 12, color: “var(–muted)” }}>{c.goal || “No goal set”}</div>
</div>
<div style={{ textAlign: “right”, fontSize: 12, color: “var(–muted)” }}>{counts[c.id] || 0} check-ins</div>
</div>
))}
</div>
</div>
);
}

function ClientsPanel() {
const [clients, setClients] = useState([]);
const [selected, setSelected] = useState(null);
const [exercises, setExercises] = useState([]);
const [showAddEx, setShowAddEx] = useState(false);
const [newEx, setNewEx] = useState({ name: “”, category: “”, is_bodyweight: false });
const [saving, setSaving] = useState(false);
const [loading, setLoading] = useState(true);

const loadClients = async () => {
const { data } = await supabase.from(“profiles”).select(”*”).neq(“email”, COACH_EMAIL);
setClients(data || []);
if (data && data.length > 0 && !selected) setSelected(data[0].id);
setLoading(false);
};

const loadEx = async (id) => {
const { data } = await supabase.from(“exercises”).select(”*”).eq(“client_id”, id).order(“created_at”);
setExercises(data || []);
};

useEffect(() => { loadClients(); }, []);
useEffect(() => { if (selected) loadEx(selected); }, [selected]);

const addExercise = async () => {
if (!newEx.name) return;
setSaving(true);
await supabase.from(“exercises”).insert({ …newEx, client_id: selected });
await loadEx(selected);
setNewEx({ name: “”, category: “”, is_bodyweight: false });
setShowAddEx(false); setSaving(false);
};

const deleteExercise = async (id) => {
await supabase.from(“exercises”).delete().eq(“id”, id);
await loadEx(selected);
};

const client = clients.find(c => c.id === selected);
if (loading) return <div className="spinner" />;

return (
<div>
<div className="page-title">Clients</div>
<div className="page-sub">Manage programs and view client data</div>
<div style={{ display: “flex”, gap: 8, flexWrap: “wrap”, marginBottom: 22 }}>
{clients.map(c => (
<button key={c.id} className={`radio-btn ${selected === c.id ? "active" : ""}`} onClick={() => setSelected(c.id)}>{c.name || c.email}</button>
))}
{clients.length === 0 && <div style={{ color: “var(–muted)”, fontSize: 13 }}>No clients yet. Share the app URL with your clients.</div>}
</div>
{client && (
<>
<div className=“card” style={{ marginBottom: 20 }}>
<div style={{ display: “flex”, gap: 16, alignItems: “center” }}>
<div className=“client-avatar” style={{ background: “#FF4D00”, color: “white”, width: 52, height: 52, fontSize: 16 }}>{avatarFrom(client.name || client.email)}</div>
<div>
<div style={{ fontFamily: “var(–font-display)”, fontSize: 22 }}>{client.name || “—”}</div>
<div style={{ fontSize: 12, color: “var(–muted)” }}>{client.email} · Joined {client.created_at?.split(“T”)[0]}</div>
<div style={{ fontSize: 13, marginTop: 4 }}>{client.goal || “No goal set”}</div>
</div>
</div>
</div>
<div className="card">
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 16 }}>
<div className=“card-title” style={{ margin: 0 }}>Assigned Exercises</div>
<button className=“btn btn-teal btn-sm” onClick={() => setShowAddEx(true)}>+ Add Exercise</button>
</div>
{showAddEx && (
<div style={{ background: “var(–surface2)”, border: “1px solid var(–border)”, padding: 20, marginBottom: 16 }}>
<div className="grid-3">
<div className="field"><label>Exercise Name</label><input type=“text” value={newEx.name} onChange={e => setNewEx(p => ({ …p, name: e.target.value }))} placeholder=“e.g. Squat” /></div>
<div className="field"><label>Category</label><input type=“text” value={newEx.category} onChange={e => setNewEx(p => ({ …p, category: e.target.value }))} placeholder=“e.g. Lower Body” /></div>
<div className="field">
<label>Type</label>
<div className="radio-group">
<button className={`radio-btn ${!newEx.is_bodyweight ? "active" : ""}`} onClick={() => setNewEx(p => ({ …p, is_bodyweight: false }))}>Weighted</button>
<button className={`radio-btn ${newEx.is_bodyweight ? "active" : ""}`} onClick={() => setNewEx(p => ({ …p, is_bodyweight: true }))}>Bodyweight</button>
</div>
</div>
</div>
<div style={{ display: “flex”, gap: 10, marginTop: 8 }}>
<button className=“btn btn-primary btn-sm” style={{ width: “auto” }} onClick={addExercise} disabled={saving}>{saving ? “Saving…” : “Add Exercise”}</button>
<button className=“btn btn-ghost btn-sm” onClick={() => setShowAddEx(false)}>Cancel</button>
</div>
</div>
)}
{exercises.length === 0 && <div style={{ color: “var(–muted)”, fontSize: 13, padding: “16px 0” }}>No exercises assigned yet.</div>}
<table className="table">
<thead><tr><th>Exercise</th><th>Category</th><th>Type</th><th></th></tr></thead>
<tbody>
{exercises.map(ex => (
<tr key={ex.id}>
<td style={{ fontWeight: 500 }}>{ex.name}</td>
<td style={{ color: “var(–muted)” }}>{ex.category || “—”}</td>
{clients.length === 0 && <div style={{ color: “var(–muted)”, fontSize: 13 }}>No clients yet.</div>}
</div>
);
}


