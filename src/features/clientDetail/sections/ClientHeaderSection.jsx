import { S, avatarFrom } from "../../../theme.jsx";
import { Card, Btn } from "../../../components/ui/index.js";

// Avatar/name/goal summary + the primary "generate program" actions and the
// archive toggle. All state (templates, generating, genMsg) stays owned by the
// parent ClientsPanel — this component is purely presentational.
export function ClientHeaderSection({ client, templateId, setTemplateId, templates, generating, genScope, genMsg, onGenerate, onArchiveToggle }) {
  return (
    <Card style={{marginBottom:20}}>
      <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:S.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,flexShrink:0}}>
          {avatarFrom(client.name||client.email)}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,lineHeight:1.1}}>{client.name||"—"}</div>
          <div style={{fontSize:14,fontWeight:500,color:S.text,marginTop:2}}>{client.goal||"No goal set"}</div>
          <div style={{fontSize:12,color:S.muted,marginTop:4}}>{client.email}</div>
          <div style={{fontSize:10,color:S.muted,opacity:.75,marginTop:1}}>Joined {client.created_at?.split("T")[0]}</div>
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
          <Btn onClick={()=>onGenerate(client)} disabled={generating}>
            {generating&&genScope==="full"?"Generating...":"⚡ Generate AI Program"}
          </Btn>
          <Btn sm teal onClick={()=>onGenerate(client,"nutrition")} disabled={generating}>
            {generating&&genScope==="nutrition"?"Generating...":"🥗 Regenerate Nutrition Only"}
          </Btn>
          <button onClick={()=>onArchiveToggle(client, !client.archived)}
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
  );
}
