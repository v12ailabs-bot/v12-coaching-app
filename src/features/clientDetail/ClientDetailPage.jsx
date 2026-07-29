import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, useIsMobile } from "../../theme.jsx";
import { PageTitle, CollapsibleSection } from "../../components/ui/index.js";
import { ClientSelector } from "../../components/ClientSelector.jsx";
import { ClientHeaderSection } from "./sections/ClientHeaderSection.jsx";
import { ClientSettingsSection } from "./sections/ClientSettingsSection.jsx";
import { TrainingPartnerSection } from "./sections/TrainingPartnerSection.jsx";
import { AssessmentSection } from "./sections/AssessmentSection.jsx";
import { CoachMessagesSection } from "./sections/CoachMessagesSection.jsx";
import { ExercisesSection } from "./sections/ExercisesSection.jsx";
import { ProgramPhase, ProgramVersions, createProgramVersion } from "./sections/ProgramSection.jsx";
import { CoachNutrition } from "./sections/NutritionSection.jsx";
import { CoachHabits } from "./sections/DailyHabitsSection.jsx";
import { CoachNotes } from "./sections/CoachNotesSection.jsx";
import { CoachConversations } from "./sections/ConversationLogSection.jsx";
import { CoachClientInsights } from "./sections/ClientInsightsSection.jsx";
import { GoalsSection } from "./sections/GoalsSection.jsx";
import { Progress } from "../progress/ProgressPage.jsx";
import { COACH_EMAIL } from "../../lib/constants.js";

// Coach-only API routes verify this Bearer token server-side (see api/_lib/auth.js).
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` };
}

// Unified client detail page — replaces the old separate "Clients" and
// "Progress" coach nav tabs. Client Header, primary actions (inside the
// header), and Client Settings stay always visible; every other section is a
// collapsed-by-default accordion. Expand state is session-only (a plain
// useState Set, not persisted) per the progressive-disclosure requirement.
export function ClientDetailPage({ initialClientId, onInitialClientOpened }) {
  const isMobile = useIsMobile();
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  // Applied at most once per mount — after that, the coach's own in-page
  // ClientSelector clicks (or a showArchived toggle) own `selected`.
  const appliedInitial = useRef(false);
  const [exercises, setExercises] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEx, setNewEx] = useState({name:"",category:"",day_of_week:"",sets:"",reps:"",notes:"",is_bodyweight:false,exercise_type:"",section:"",block_type:"straight_set",group_id:""});
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
  const [settings, setSettings] = useState({client_type:"coaching", dashboard_url:"", goal:"", access_until:"", is_local:false});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [resettingGoal, setResettingGoal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [progTick, setProgTick] = useState(0);
  const [partnerId, setPartnerId] = useState("");        // selected owner in the link picker
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerMsg, setPartnerMsg] = useState(null);
  // Session-only expand state for the section accordion — collapsed by
  // default, resets on reload (no persistence, per spec).
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleSection = (key) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  // The id whose TRAINING rows (program + exercises) the selected client shares.
  // For a linked partner this is their owner; otherwise the client itself.
  // Nutrition and check-ins always use the client's own id, never this.
  const selClient = clients.find(c=>c.id===selected);
  const trainOwnerId = selClient?.shared_program_owner_id || selected;

  const loadClients = async()=>{
    const {data} = await supabase.from("profiles").select("*").neq("email",COACH_EMAIL);
    setClients(data||[]);
    setLoading(false);
    return data||[];
  };

  const setArchived = async(client, archived)=>{
    if(archived && !window.confirm(`Archive ${client.name||client.email}? They'll be hidden from your active list (data is kept).`)) return;
    await supabase.from("profiles").update({archived}).eq("id",client.id);
    setSelected(null);
    await loadClients();
  };
  const loadEx = async(id)=>{
    // No .order() here — groupByDay (src/lib/constants.js) owns exercise
    // ordering (by phase, then order_index) once grouped by day.
    const {data} = await supabase.from("exercises").select("*").eq("client_id",id);
    setExercises(data||[]);
  };

  useEffect(()=>{loadClients();},[]);
  // Keep the selected client valid as the archived filter / client list changes.
  useEffect(()=>{
    const vis = (clients||[]).filter(c=>showArchived?c.archived:!c.archived);
    if(!vis.length){ setSelected(s=>s?null:s); return; }
    if(!appliedInitial.current && initialClientId && vis.some(c=>c.id===initialClientId)){
      appliedInitial.current = true;
      setSelected(initialClientId);
      onInitialClientOpened?.();
      return;
    }
    setSelected(s=>(s && vis.some(c=>c.id===s)) ? s : vis[0].id);
  },[clients, showArchived, initialClientId]);
  // Program templates come from the Notion program library (via the API).
  useEffect(()=>{
    authHeaders()
      .then(headers=>fetch("/api/list-templates",{headers}))
      .then(r=>r.ok?r.json():{templates:[]})
      .then(d=>setTemplates(d.templates||[]))
      .catch(()=>setTemplates([]));
  },[]);
  useEffect(()=>{if(selected){loadEx(trainOwnerId);setGenMsg(null);}},[selected,trainOwnerId]);
  // Sync the assessment editor to the selected client, and collapse every
  // section back down when switching clients so nothing stays open from the
  // previous client's context. Deliberately depends on `selected` only, not
  // `clients` — this used to also depend on `clients`, so ANY save anywhere on
  // the page (Save Assessment, Archive, Save Partner, Refresh from Notion, even
  // Save Settings itself) called loadClients() and re-ran this effect,
  // silently wiping whatever the coach was mid-typing into Client Settings.
  // Actions that need the editors to reflect freshly synced server data
  // (refreshFromNotion) update the relevant state directly instead of relying
  // on this effect.
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
      is_local: !!c.is_local,
    });
    if(c) setPartnerId(c.shared_program_owner_id || "");
    setAssessMsg(null);
    setSettingsMsg(null);
    setPartnerMsg(null);
    setExpanded(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selected]);

  const saveSettings = async()=>{
    setSavingSettings(true); setSettingsMsg(null);
    const {error} = await supabase.from("profiles").update({
      client_type: settings.client_type,
      dashboard_url: settings.dashboard_url.trim() || null,
      goal: settings.goal.trim() || null,
      access_until: settings.access_until || null,
      is_local: settings.is_local,
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
        method:"POST", headers:await authHeaders(),
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
        headers:await authHeaders(),
        body:JSON.stringify({client_email:client.email}),
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||`Request failed (${r.status})`);
      setAssessMsg({ok:true,text:data.updated?.length?`Synced from Notion (${data.updated.join(", ")}).`:"Notion had nothing new to sync."});
      const fresh = (await loadClients()).find(c=>c.id===selected);
      // The assess editor no longer auto-resyncs from loadClients() (see the
      // effect above), so pull the newly synced values in directly here.
      if(fresh) setAssess({
        nervous_system_recruitment: fresh.nervous_system_recruitment ?? 5,
        muscular_density_to_size: fresh.muscular_density_to_size ?? 5,
        metabolic_work_capacity: fresh.metabolic_work_capacity ?? 5,
      });
    }catch(e){
      setAssessMsg({ok:false,text:e.message});
    }finally{
      setSyncing(false);
    }
  };

  const addEx = async()=>{
    if(!newEx.name) return;
    setSaving(true);
    // Append after whatever's already in this day, so a manual add never
    // collides with existing rows at order_index 0.
    const orderIndex = exercises.filter(e=>(e.day_of_week||"")===(newEx.day_of_week||"")).length;
    await supabase.from("exercises").insert({
      client_id:trainOwnerId, name:newEx.name.trim(), category:newEx.category.trim()||null,
      day_of_week:newEx.day_of_week||null, sets:parseInt(newEx.sets)||null,
      reps:newEx.reps.trim()||null, notes:newEx.notes.trim()||null,
      is_bodyweight:newEx.is_bodyweight, exercise_type:newEx.exercise_type||null,
      section:newEx.section||null, order_index:orderIndex, source:"coach",
      block_type:newEx.block_type||"straight_set", group_id:newEx.group_id.trim()||null,
    });
    await loadEx(trainOwnerId);
    setNewEx({name:"",category:"",day_of_week:"",sets:"",reps:"",notes:"",is_bodyweight:false,exercise_type:"",section:"",block_type:"straight_set",group_id:""});
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
    day_of_week:ex.day_of_week||"", sets:ex.sets??"", reps:ex.reps||"", notes:ex.notes||"", exercise_type:ex.exercise_type||"", section:ex.section||"",
    block_type:ex.block_type||"straight_set", group_id:ex.group_id||"",
  }});
  const saveEditEx = async()=>{
    const d = editEx.draft;
    await supabase.from("exercises").update({
      day_of_week:d.day_of_week||null, sets:parseInt(d.sets)||null,
      reps:String(d.reps).trim()||null, notes:String(d.notes).trim()||null, exercise_type:d.exercise_type||null, section:d.section||null,
      block_type:d.block_type||"straight_set", group_id:String(d.group_id||"").trim()||null,
    }).eq("id",editEx.id);
    setEditEx(null);
    await loadEx(trainOwnerId);
  };

  // Runs the pipeline: Notion -> AI -> Supabase. scope "full" regenerates the
  // whole program (training + nutrition); "nutrition" regenerates only the
  // nutrition plan and leaves training + logged history untouched. The API
  // already never deletes an AI exercise with logged history (see
  // api/generate-program.js) — but the AI itself was blind to that when
  // designing the new week, so it could reintroduce the same lift as a
  // separate, duplicate exercise. Surface what's about to be kept up front
  // (a heads-up, not a per-exercise picker) instead of letting that surprise
  // the coach after the fact.
  const generateProgram = async(client, scope="full")=>{
    if(scope==="full"){
      const {data:aiEx} = await supabase.from("exercises").select("id,name,day_of_week").eq("client_id",trainOwnerId).eq("source","ai");
      const aiIds = (aiEx||[]).map(e=>e.id);
      if(aiIds.length){
        const {data:logged} = await supabase.from("workout_logs").select("exercise_id").in("exercise_id",aiIds);
        const loggedIds = new Set((logged||[]).map(l=>l.exercise_id));
        const keepers = (aiEx||[]).filter(e=>loggedIds.has(e.id));
        if(keepers.length){
          const list = keepers.map(e=>`${e.name}${e.day_of_week?` (${e.day_of_week})`:""}`).join("\n");
          if(!window.confirm(`These ${keepers.length} exercise${keepers.length>1?"s":""} already have logged history and will be kept exactly as-is — the AI will design the rest of the program around them:\n\n${list}\n\nContinue?`)) return;
        }
      }
    }
    setGenerating(true); setGenScope(scope); setGenMsg(null);
    try{
      const r = await fetch("/api/generate-program",{
        method:"POST",
        headers:await authHeaders(),
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
  if(loading) return <div className="spinner" style={{margin:"80px auto"}}/>;

  // Declarative section registry — the extension point for future sections
  // (e.g. a future Goals Engine or Coach Messages panel is one more entry
  // here, not a rewrite of this page). Order roughly matches how a coach
  // scans a client: assessment/nutrition/program first, logs and history after.
  const sections = client ? [
    // Goals, Progress (metrics/photos), and Insights (habit adherence) are all
    // client-tracked data views — the coach has no visibility into any of it
    // for a program-only client, only once switched back to "coaching".
    ...(client.client_type === "program_only" ? [] : [
      { key: "goals", title: "Goals", node: <GoalsSection client={client} /> },
    ]),
    { key: "assessment", title: "Assessment", node: (
        <AssessmentSection client={client} assess={assess} setAssess={setAssess}
          saveAssessment={saveAssessment} savingAssess={savingAssess} assessMsg={assessMsg}
          refreshFromNotion={refreshFromNotion} syncing={syncing}/>
    )},
    { key: "nutrition", title: "Nutrition", node: <CoachNutrition clientId={client.id} refreshKey={progTick} /> },
    { key: "program-phase", title: "Program Phase", node: <ProgramPhase clientId={trainOwnerId} client={client} /> },
    { key: "program-history", title: "Program History", node: (
        <ProgramVersions clientId={trainOwnerId} refreshKey={progTick} onRestored={()=>loadEx(trainOwnerId)} />
    )},
    ...(client.client_type === "program_only" ? [] : [
      { key: "progress", title: "Progress", node: <Progress profile={client} coachView /> },
    ]),
    { key: "message", title: "Coach Messages", node: <CoachMessagesSection clientId={client.id} /> },
    { key: "habits", title: "Daily Habits", node: <CoachHabits clientId={client.id} /> },
    ...(client.client_type === "program_only" ? [] : [
      { key: "insights", title: "Client Insights", node: <CoachClientInsights client={client} /> },
    ]),
    { key: "notes", title: "Coach Notes", node: <CoachNotes clientId={client.id} /> },
    { key: "conversations", title: "Conversation Log", node: <CoachConversations clientId={client.id} /> },
    { key: "exercises", title: "Assigned Exercises", node: (
        <ExercisesSection isMobile={isMobile} exercises={exercises} showAdd={showAdd} setShowAdd={setShowAdd}
          newEx={newEx} setNewEx={setNewEx} editEx={editEx} setEditEx={setEditEx} saving={saving}
          addEx={addEx} delEx={delEx} startEditEx={startEditEx} saveEditEx={saveEditEx}/>
    )},
    { key: "partner", title: "Training Partner", node: (
        <TrainingPartnerSection clients={clients} selected={selected} selClient={selClient}
          partnerId={partnerId} setPartnerId={setPartnerId} savePartner={savePartner}
          savingPartner={savingPartner} partnerMsg={partnerMsg}/>
    )},
  ] : [];

  return (
    <div>
      <PageTitle title="Clients" sub="Manage programs and view client data"/>
      <div style={{marginBottom:20,maxWidth:420}}>
        <ClientSelector clients={clients} selectedId={selected} onSelect={setSelected}
          archived={showArchived} onToggleArchived={setShowArchived}/>
      </div>
      {client&&(
        <>
          <ClientHeaderSection client={client} templateId={templateId} setTemplateId={setTemplateId}
            templates={templates} generating={generating} genScope={genScope} genMsg={genMsg}
            onGenerate={generateProgram} onArchiveToggle={setArchived}/>
          <ClientSettingsSection client={client} settings={settings} setSettings={setSettings}
            saveSettings={saveSettings} savingSettings={savingSettings} settingsMsg={settingsMsg}
            resetGoalToNotion={resetGoalToNotion} resettingGoal={resettingGoal} syncing={syncing}/>
          {sections.map(s => (
            <CollapsibleSection key={s.key} title={s.title}
              expanded={expanded.has(s.key)} onToggle={()=>toggleSection(s.key)}>
              {s.node}
            </CollapsibleSection>
          ))}
        </>
      )}
    </div>
  );
}
