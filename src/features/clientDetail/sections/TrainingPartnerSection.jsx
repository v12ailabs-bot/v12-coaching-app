import { S } from "../../../theme.jsx";
import { Card, CardTitle, Fld, Btn } from "../../../components/ui/index.js";

export function TrainingPartnerSection({ clients, selected, selClient, partnerId, setPartnerId, savePartner, savingPartner, partnerMsg }) {
  return (
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
  );
}
