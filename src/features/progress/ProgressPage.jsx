import { useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";
import { supabase } from "../../supabaseClient.js";
import { S, TT } from "../../theme.jsx";
import { Card, CardTitle, PageTitle, Stat, CC, Fld, Inp, Btn } from "../../components/ui/index.js";
import { computeBMI, bmiCategory } from "../../lib/bmi.js";
import { adherenceFrom, nutritionScoreFrom } from "../../lib/scoring.js";
import { computeGoalScore } from "../../lib/scoring/goalScoring.js";
import { HabitsProgress, CheckinNotes } from "./SharedProgressViews.jsx";
import { StrengthTab } from "./StrengthTab.jsx";
import { ProgressPhotos } from "./PhotosSection.jsx";
import { ClientSummaries } from "./AISummarySection.jsx";

// Shared client-facing + coach-view (coachView) progress dashboard: weight,
// wellness, measurements, strength, habits, check-in notes (coach only),
// photos, and the manual goals-progress tab (self-rated, not yet computed —
// out of scope for this pass, left exactly as-is).
export function Progress({ profile, coachView }) {
  const [tab, setTab] = useState("weight");
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [target, setTarget] = useState(null);
  const [goal, setGoal] = useState(null);
  const [insight, setInsight] = useState(null);
  // `heightIn` is just the input's live typing buffer; `savedHeight` is the
  // actually-persisted value and is what decides which UI shows and what the
  // BMI is computed from. Keeping these separate fixes a bug where typing a
  // single digit made the BMI card immediately switch to its "saved" display
  // (and compute a nonsense BMI from a 1-inch height) before Save was ever
  // clicked — nothing had actually reached the database yet.
  const [heightIn, setHeightIn] = useState(profile.height_in ?? "");
  const [savedHeight, setSavedHeight] = useState(profile.height_in ?? null);
  const [savingHeight, setSavingHeight] = useState(false);

  useEffect(()=>{
    supabase.from("daily_checkins").select("*").eq("client_id",profile.id).order("date").then(({data})=>setDaily(data||[]));
    supabase.from("weekly_checkins").select("*").eq("client_id",profile.id).order("date").then(({data})=>setWeekly((data||[]).map((w,i)=>({...w,week:"Wk"+(i+1)}))));
    supabase.from("habits").select("*").eq("client_id",profile.id).eq("active",true).order("order_index").then(({data})=>setHabits(data||[]));
    // Active nutrition-plan macro targets, for the calorie/macro reference lines.
    supabase.from("nutrition_plans").select("calories,protein_g,carbs_g,fats_g").eq("client_id",profile.id).eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data})=>setTarget(data||null));
    // Last 30 days of habit completions, for the coach-visible adherence grid.
    const cut = (()=>{const d=new Date();d.setDate(d.getDate()-29);return d.toISOString().split("T")[0];})();
    supabase.from("habit_logs").select("*").eq("client_id",profile.id).gte("date",cut).then(({data})=>setHabitLogs(data||[]));
    // The client's single active bodyweight goal — the same client_goals row
    // GoalsSection reads, so the goal line/stats here never drift from it.
    supabase.from("client_goals").select("*").eq("client_id",profile.id).eq("status","active").eq("metric_key","bodyweight")
      .order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data})=>setGoal(data||null));
    // Latest coach-generated goal insight, read-only here — this is where it
    // stays viewable after the client dismisses its Home-page banner.
    supabase.from("client_goal_insights").select("*").eq("client_id",profile.id)
      .order("created_at",{ascending:false}).limit(1).maybeSingle().then(({data})=>setInsight(data||null));
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
  // Goal progress, computed with the exact same function GoalsSection uses —
  // one source of truth for "how is this goal going," never a duplicate calc.
  const goalScore = goal ? computeGoalScore(goal, weightSeries.map(w=>({date:w.date,value:w.weight})), {nutrition:nut.score,training:adh.trainingRate}) : null;
  const daysRemaining = goal ? Math.ceil((new Date(goal.target_date+"T00:00:00Z") - new Date()) / 86400000) : null;
  // X-axis tick spacing scales with series length so full-history charts
  // (not just the last 14/30 days) don't overlap their date labels.
  const tickEvery = (n) => Math.max(1, Math.floor(n / 8));

  const saveHeight = async () => {
    if (!heightIn) return;
    setSavingHeight(true);
    await supabase.from("profiles").update({ height_in: Number(heightIn) }).eq("id", profile.id);
    setSavingHeight(false);
    setSavedHeight(Number(heightIn));
  };
  const bmiWeekly = weekly.filter((w) => w.bodyweight != null && savedHeight)
    .map((w) => ({ week: w.week, bmi: computeBMI(Number(savedHeight), w.bodyweight) }));
  const currentBmi = bmiWeekly.length ? bmiWeekly[bmiWeekly.length - 1].bmi : computeBMI(Number(savedHeight), lastWeight);

  return (
    <div>
      <PageTitle title="Progress" sub="Your data over time"/>
      <div className="g4" style={{display:"grid",gridTemplateColumns:goal?"repeat(6,1fr)":"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <Stat label="Adherence (30d)" value={adh.score} unit="%"/>
        <Stat label="Nutrition (30d)" value={nut.score??"—"} unit={nut.score!=null?"%":""}/>
        <Stat label="Training Completion" value={adh.trainingRate} unit="%"/>
        <Stat label="Current Weight" value={lastWeight??"—"} unit={lastWeight?"lb":""}/>
        {goal && <Stat label="Goal Progress" value={goalScore?.overallScore??"—"} unit={goalScore?.overallScore!=null?"%":""}/>}
        {goal && <Stat label="Days Remaining" value={Math.max(0,daysRemaining)} unit="days"/>}
      </div>
      <ClientSummaries profile={profile} coachView={coachView}/>
      <div style={{display:"flex",borderBottom:"1px solid "+S.border,marginBottom:24,flexWrap:"wrap"}}>
        {[["weight","Weight"],["wellness","Wellness"],["measurements","Measurements"],["strength","Strength"],["habits","Habits"],...(coachView?[["notes","Check-in Notes"]]:[]),["photos","Photos"],["goals","Goals"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={ts(id)}>{label}</button>
        ))}
      </div>

      {tab==="weight" && (daily.length===0&&weightSeries.length===0?empty:(
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <CC title="Bodyweight Trend" sub={goal?`Daily + weekly check-ins · target ${goal.target_value}${goal.unit}`:"Daily + weekly check-ins"}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={tickEvery(weightSeries.length)}/>
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                <Tooltip {...TT}/>
                {goal && <ReferenceLine y={goal.target_value} stroke={S.accent2} strokeDasharray="4 4" label={{value:"Goal",fontSize:9,fill:S.accent2,position:"insideTopRight"}}/>}
                <Line type="monotone" dataKey="weight" stroke={S.accent} strokeWidth={2} dot={{r:2}}/>
              </LineChart>
            </ResponsiveContainer>
          </CC>
          <CC title="Workout Completion" sub="Full history">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily.map(d=>({...d,done:d.workout==="completed"?1:0}))}>
                <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={tickEvery(daily.length)}/>
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
            <CC key={key} title={label} sub="Full history">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={tickEvery(daily.length)}/>
                  <YAxis domain={[0,key==="water"?16:10]} tick={{fontSize:10,fill:"#666"}}/>
                  <Tooltip {...TT}/>
                  <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{r:2}}/>
                </LineChart>
              </ResponsiveContainer>
            </CC>
          ))}
          {daily.some(d=>d.calories!=null) && (
            <CC title="Calories" sub={target?.calories!=null?`Full history · target ${target.calories} kcal`:"Full history"}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={tickEvery(daily.length)}/>
                  <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                  <Tooltip {...TT}/>
                  {target?.calories!=null && <ReferenceLine y={target.calories} stroke={S.muted} strokeDasharray="4 4" label={{value:"Target",fontSize:9,fill:S.muted,position:"insideTopRight"}}/>}
                  <Line type="monotone" dataKey="calories" stroke={S.accent} strokeWidth={2} dot={{r:2}} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
            </CC>
          )}
          {daily.some(d=>d.protein_g!=null||d.carbs_g!=null||d.fats_g!=null) && (
            <CC title="Macros (g)" sub="Full history · dashed = target">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)} interval={tickEvery(daily.length)}/>
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

      {tab==="measurements" && (
        <>
          {!savedHeight ? (
            <Card style={{marginBottom:20}}>
              <CardTitle>BMI</CardTitle>
              <div style={{fontSize:12,color:S.muted,marginBottom:12,lineHeight:1.6}}>Set your height once to see a BMI estimate alongside your other measurements — it's an estimate only, since BMI doesn't account for body composition.</div>
              <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                <Fld label="Height (inches)"><Inp type="number" value={heightIn} onChange={e=>setHeightIn(e.target.value)} placeholder="e.g. 70"/></Fld>
                <Btn onClick={saveHeight} disabled={savingHeight||!heightIn}>{savingHeight?"Saving...":"Save Height"}</Btn>
              </div>
            </Card>
          ) : (
            <Card style={{marginBottom:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:10}}>
                <CardTitle>BMI (estimate)</CardTitle>
                <div style={{fontSize:11,color:S.muted}}>Height: {savedHeight}in · <span onClick={()=>setSavedHeight(null)} style={{color:S.accent,cursor:"pointer"}}>Edit</span></div>
              </div>
              {currentBmi != null && (
                <div style={{marginBottom:12}}>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30}}>{currentBmi}</span>
                  <span style={{fontSize:12,color:S.muted,marginLeft:8}}>{bmiCategory(currentBmi)}</span>
                </div>
              )}
            </Card>
          )}
          {weekly.length===0?emptyWeekly:(
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
              {bmiWeekly.length > 0 && (
                <CC title="BMI Trend" sub="Weekly, from bodyweight + your height">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bmiWeekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="week" tick={{fontSize:10,fill:"#666"}}/>
                      <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#666"}}/>
                      <Tooltip {...TT}/>
                      <Line type="monotone" dataKey="bmi" stroke={S.accent} strokeWidth={2} dot={{r:3}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </CC>
              )}
            </div>
          )}
        </>
      )}

      {tab==="strength" && <StrengthTab profile={profile}/>}

      {tab==="habits" && <HabitsProgress habits={habits} logs={habitLogs}/>}

      {tab==="notes" && coachView && <CheckinNotes weekly={weekly}/>}

      {tab==="photos" && <ProgressPhotos profile={profile} coachView={coachView}/>}

      {tab==="goals" && (
        <>
          {insight && (
            <Card style={{borderLeft:"3px solid "+S.accent,marginBottom:20}}>
              <CardTitle>Coaching Insight</CardTitle>
              <div style={{fontSize:11,color:S.muted,marginBottom:10}}>{(insight.created_at||"").slice(0,10)}</div>
              <div style={{fontSize:13.5,color:S.text,opacity:.92,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{insight.insight_text}</div>
            </Card>
          )}
          {weekly.length===0?emptyWeekly:(
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
          )}
        </>
      )}
    </div>
  );
}
