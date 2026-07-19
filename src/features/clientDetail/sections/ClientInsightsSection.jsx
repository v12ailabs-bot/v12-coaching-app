import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { HabitsProgress, CheckinNotes } from "../../progress/SharedProgressViews.jsx";

// Coach-facing snapshot of a client's self-reported data, shown inline in the
// Clients detail view: daily-habit adherence + the free-text weekly check-in
// answers. Reuses the same HabitsProgress / CheckinNotes views as Progress so
// the coach sees exactly what the client sees, without leaving the Clients tab.
export function CoachClientInsights({ client }) {
  const isCoaching = client.client_type !== "program_only";
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [weekly, setWeekly] = useState([]);
  useEffect(()=>{
    supabase.from("habits").select("*").eq("client_id",client.id).eq("active",true).order("order_index").then(({data})=>setHabits(data||[]));
    const cut = (()=>{const d=new Date();d.setDate(d.getDate()-29);return d.toISOString().split("T")[0];})();
    supabase.from("habit_logs").select("*").eq("client_id",client.id).gte("date",cut).then(({data})=>setHabitLogs(data||[]));
    // Weekly check-ins are a coaching-only artifact — program-only clients
    // never produce them, so skip the fetch entirely for those clients.
    if(isCoaching){
      supabase.from("weekly_checkins").select("*").eq("client_id",client.id).order("date").then(({data})=>setWeekly((data||[]).map((w,i)=>({...w,week:"Wk"+(i+1)}))));
    }
  },[client.id, isCoaching]);
  const heading = {fontSize:10,letterSpacing:2,textTransform:"uppercase",color:S.muted,margin:"4px 2px 12px"};
  return (
    <div style={{marginBottom:20}}>
      <div style={heading}>Habit Adherence</div>
      <HabitsProgress habits={habits} logs={habitLogs}/>
      {isCoaching && (
        <>
          <div style={{...heading,marginTop:20}}>Weekly Check-in Notes</div>
          <CheckinNotes weekly={weekly}/>
        </>
      )}
    </div>
  );
}
