import { S } from "../../../theme.jsx";
import { Card, CardTitle, Btn } from "../../../components/ui/index.js";

export function ClientMessageSection({ coachMsg, setCoachMsg, saveCoachMessage, savingCoachMsg, coachMsgStatus }) {
  return (
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
  );
}
