import { S, todayStr } from "../../theme.jsx";
import { Card, CardTitle, Stat, DayFolder } from "../../components/ui/index.js";

// Shared by the client-facing Progress page and the coach's per-client insights
// card (CoachClientInsights) so both render the exact same habit-adherence grid.
export function HabitsProgress({ habits, logs }) {
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
export function CheckinNotes({ weekly }) {
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
