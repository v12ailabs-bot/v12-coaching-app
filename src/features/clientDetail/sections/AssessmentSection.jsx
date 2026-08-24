import { S } from "../../../theme.jsx";
import { Card, CardTitle, Sld, Btn } from "../../../components/ui/index.js";

// V12 three-system assessment sliders. Also stands in for "Metrics" from the
// original spec — there's no separate per-client metrics feature in this app;
// these scores are the closest existing thing to client-level metrics.
export function AssessmentSection({ client, assess, setAssess, saveAssessment, savingAssess, assessMsg, refreshFromNotion, syncing }) {
  return (
    <Card style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
        <CardTitle>V12 Assessment — three systems</CardTitle>
        <Btn sm teal onClick={()=>refreshFromNotion(client)} disabled={syncing}>
          {syncing?"Syncing...":"↻ Refresh from Notion"}
        </Btn>
      </div>
      <div style={{fontSize:11,color:S.muted,marginBottom:16}}>
        Drives the weekly balance of the three pillars. Pulled from the client's Notion application; override here as you reassess.
      </div>
      <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
        <Sld label="Nervous System Recruitment" val={assess.nervous_system_recruitment} min={1} max={10} sfx="/10" onChange={v=>setAssess(p=>({...p,nervous_system_recruitment:v}))}/>
        <Sld label="Muscular Density-to-Size" val={assess.muscular_density_to_size} min={1} max={10} sfx="/10" onChange={v=>setAssess(p=>({...p,muscular_density_to_size:v}))}/>
        <Sld label="Metabolic Work Capacity" val={assess.metabolic_work_capacity} min={1} max={10} sfx="/10" onChange={v=>setAssess(p=>({...p,metabolic_work_capacity:v}))}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginTop:18}}>
        <Btn onClick={saveAssessment} disabled={savingAssess}>{savingAssess?"Saving...":"Save Assessment"}</Btn>
        {assessMsg && (
          <span style={{fontSize:12,fontWeight:600,color:assessMsg.ok?S.accent2:S.danger}}>{assessMsg.text}</span>
        )}
      </div>
    </Card>
  );
}
