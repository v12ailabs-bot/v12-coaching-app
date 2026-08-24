import { useState, useEffect } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "../../supabaseClient.js";
import { S, TT, trainingOwnerId } from "../../theme.jsx";
import { Card, CC, DayFolder } from "../../components/ui/index.js";
import { EX_TYPES } from "../../lib/constants.js";

// Strength-progress grouping. The coach-set exercise_type wins; otherwise the
// group is auto-detected from the free-text section/category/name. Warm-ups are
// surfaced so the Strength tab can exclude them (they belong in the workout log).
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

// Strength progression grouped into collapsible Compound / Accessory / Circuit
// folders (coach-set exercise_type, else auto-detected). Warm-ups are excluded —
// they belong in the workout log. Each folder opens to per-exercise graphs:
// weight+reps for lifts, best logged time for circuits.
export function StrengthTab({ profile }) {
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
                    <LineChart data={s.data} margin={{top:20,right:12,left:0,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis tick={{fontSize:10,fill:"#666"}} tickFormatter={fmtSec} domain={["auto","auto"]}/>
                      <Tooltip {...TT} formatter={v=>[fmtSec(v),"Time"]}/>
                      <Line type="monotone" dataKey="timeSec" stroke={S.neon} strokeWidth={2} dot={{r:3}}
                        label={{position:"top",fontSize:9,fill:S.neon,formatter:fmtSec}}/>
                    </LineChart>
                  ) : s.is_bodyweight ? (
                    <LineChart data={s.data} margin={{top:20,right:12,left:0,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis tick={{fontSize:10,fill:"#666"}} domain={["auto","auto"]}/>
                      <Tooltip {...TT}/>
                      <Line type="monotone" dataKey="reps" name="Reps" stroke={S.accent2} strokeWidth={2} dot={{r:3}}
                        label={{position:"top",fontSize:9,fill:S.accent2}}/>
                    </LineChart>
                  ) : (
                    <LineChart data={s.data} margin={{top:20,right:12,left:0,bottom:20}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"#666"}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis yAxisId="w" tick={{fontSize:10,fill:"#666"}} domain={["auto","auto"]}/>
                      <YAxis yAxisId="r" orientation="right" tick={{fontSize:10,fill:"#666"}} domain={["auto","auto"]}/>
                      <Tooltip {...TT}/>
                      <Line yAxisId="w" type="monotone" dataKey="weight" name="Weight (lb)" stroke={S.neon} strokeWidth={2} dot={{r:3}}
                        label={{position:"top",fontSize:9,fill:S.neon}}/>
                      <Line yAxisId="r" type="monotone" dataKey="reps" name="Reps" stroke={S.accent2} strokeWidth={2} dot={{r:2}}
                        label={{position:"bottom",fontSize:9,fill:S.accent2}}/>
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
