import { S } from "../../../theme.jsx";
import { Card, CardTitle, Fld, Inp, RG, Btn } from "../../../components/ui/index.js";

export function ClientSettingsSection({ client, settings, setSettings, saveSettings, savingSettings, settingsMsg, resetGoalToNotion, resettingGoal, syncing }) {
  return (
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
        <Fld label="Training Location">
          <RG options={["Remote/Other Gym","V12 Local Gym"]} value={settings.is_local?"V12 Local Gym":"Remote/Other Gym"} onChange={v=>setSettings(p=>({...p,is_local:v==="V12 Local Gym"}))}/>
          <div style={{fontSize:11,color:S.muted,marginTop:6,lineHeight:1.5}}>"V12 Local Gym" restricts AI program generation to the gym's actual equipment — never medicine balls, battle ropes, sleds, or BikeErgs.</div>
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
  );
}
