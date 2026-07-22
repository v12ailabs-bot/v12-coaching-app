import { S } from "../../../theme.jsx";
import { Card, CardTitle, Fld, Inp, RG, Btn, DayFolder } from "../../../components/ui/index.js";
import { DAY_ORDER, EX_TYPES, PHASE_ORDER, groupByDay, BLOCK_TYPES, BLOCK_TYPE_LABEL, BLOCK_TYPE_SHORT } from "../../../lib/constants.js";

// Assigned-exercises table/cards, grouped by training day. All state (the
// exercise list, the add/edit forms) stays owned by the parent ClientsPanel —
// this component is purely presentational, same as the other Clients sections.
export function ExercisesSection({ isMobile, exercises, showAdd, setShowAdd, newEx, setNewEx, editEx, setEditEx, saving, addEx, delEx, startEditEx, saveEditEx }) {
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <CardTitle>Assigned Exercises</CardTitle>
        <Btn sm teal onClick={()=>setShowAdd(true)}>+ Add Exercise</Btn>
      </div>
      {showAdd&&(
        <div style={{background:S.surface2,border:"1px solid "+S.border,padding:20,marginBottom:16}}>
          <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            <Fld label="Exercise Name"><Inp type="text" value={newEx.name} onChange={e=>setNewEx(p=>({...p,name:e.target.value}))} placeholder="e.g. Squat"/></Fld>
            <Fld label="Category"><Inp type="text" value={newEx.category} onChange={e=>setNewEx(p=>({...p,category:e.target.value}))} placeholder="e.g. Lower Body"/></Fld>
            <Fld label="Day">
              <select value={newEx.day_of_week} onChange={e=>setNewEx(p=>({...p,day_of_week:e.target.value}))}
                style={{width:"100%",background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                <option value="">Unscheduled</option>
                {DAY_ORDER.map((d,i)=><option key={d} value={d}>{"Day "+(i+1)}</option>)}
              </select>
            </Fld>
            <Fld label="Sets"><Inp type="number" value={newEx.sets} onChange={e=>setNewEx(p=>({...p,sets:e.target.value}))} placeholder="e.g. 4"/></Fld>
            <Fld label="Reps"><Inp type="text" value={newEx.reps} onChange={e=>setNewEx(p=>({...p,reps:e.target.value}))} placeholder="e.g. 8-12"/></Fld>
            <Fld label="Type">
              <RG options={["Weighted","Bodyweight"]} value={newEx.is_bodyweight?"Bodyweight":"Weighted"} onChange={v=>setNewEx(p=>({...p,is_bodyweight:v==="Bodyweight"}))}/>
            </Fld>
            <Fld label="Progress Type">
              <select value={newEx.exercise_type} onChange={e=>setNewEx(p=>({...p,exercise_type:e.target.value}))}
                style={{width:"100%",background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                <option value="">Auto-detect</option>
                {EX_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </Fld>
            <Fld label="Phase (workout order)">
              <select value={newEx.section} onChange={e=>setNewEx(p=>({...p,section:e.target.value}))}
                style={{width:"100%",background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                <option value="">Unset</option>
                {PHASE_ORDER.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </Fld>
            <Fld label="Block Type">
              <select value={newEx.block_type} onChange={e=>setNewEx(p=>({...p,block_type:e.target.value}))}
                style={{width:"100%",background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"12px 14px",fontSize:14,outline:"none"}}>
                {BLOCK_TYPES.map(t=><option key={t} value={t}>{BLOCK_TYPE_LABEL[t]}</option>)}
              </select>
            </Fld>
            {newEx.block_type!=="straight_set"&&(
              <Fld label="Group Label"><Inp type="text" value={newEx.group_id} onChange={e=>setNewEx(p=>({...p,group_id:e.target.value}))} placeholder="e.g. A — same label on every exercise in this block"/></Fld>
            )}
          </div>
          <Fld label="Notes / loading guidance"><Inp type="text" value={newEx.notes} onChange={e=>setNewEx(p=>({...p,notes:e.target.value}))} placeholder="e.g. @80% 1RM, RPE 8, 3s eccentric"/></Fld>
          <div style={{display:"flex",gap:10,marginTop:8}}>
            <Btn sm onClick={addEx} disabled={saving}>{saving?"Saving...":"Add Exercise"}</Btn>
            <button onClick={()=>setShowAdd(false)} style={{padding:"7px 14px",fontSize:10,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>Cancel</button>
          </div>
        </div>
      )}
      {exercises.length===0&&<div style={{color:S.muted,fontSize:13,padding:"16px 0"}}>No exercises assigned yet.</div>}
      {groupByDay(exercises).map(({day,exercises:dayExs,label})=>(
      <DayFolder key={day} title={label} meta={`${dayExs.length} exercise${dayExs.length>1?"s":""}`}>
      {isMobile ? (
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {dayExs.map(ex=>{
          const editing = editEx?.id===ex.id;
          const d = editEx?.draft || {};
          const setD = (k,v)=>setEditEx(p=>({...p,draft:{...p.draft,[k]:v}}));
          const eInp = {background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"8px 10px",fontSize:14,outline:"none",width:"100%"};
          const lbl = {fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted,marginBottom:4,display:"block"};
          return (
            <div key={ex.id} style={{background:S.surface2,border:"1px solid "+S.border,padding:14}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,marginBottom:editing?12:8}}>
                {ex.name}{ex.is_bodyweight&&<span style={{marginLeft:6,fontSize:9,color:S.muted}}>BW</span>}
                {BLOCK_TYPE_SHORT[ex.block_type]&&<span style={{marginLeft:6,fontSize:9,color:S.accent2}}>{BLOCK_TYPE_SHORT[ex.block_type]}{ex.group_id?" "+ex.group_id:""}</span>}
              </div>
              {editing?(
                <>
                  <div style={{marginBottom:10}}><label style={lbl}>Day</label><select value={d.day_of_week} onChange={e=>setD("day_of_week",e.target.value)} style={eInp}><option value="">—</option>{DAY_ORDER.map((x,i)=><option key={x} value={x}>{"Day "+(i+1)}</option>)}</select></div>
                  <div style={{display:"flex",gap:10,marginBottom:10}}>
                    <div style={{flex:1}}><label style={lbl}>Sets</label><input type="number" value={d.sets} onChange={e=>setD("sets",e.target.value)} style={eInp}/></div>
                    <div style={{flex:1}}><label style={lbl}>Reps</label><input type="text" value={d.reps} onChange={e=>setD("reps",e.target.value)} style={eInp}/></div>
                  </div>
                  <div style={{marginBottom:10}}><label style={lbl}>Progress Type</label><select value={d.exercise_type} onChange={e=>setD("exercise_type",e.target.value)} style={eInp}><option value="">Auto-detect</option>{EX_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div style={{marginBottom:10}}><label style={lbl}>Phase (workout order)</label><select value={d.section} onChange={e=>setD("section",e.target.value)} style={eInp}><option value="">Unset</option>{PHASE_ORDER.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                  <div style={{marginBottom:10}}><label style={lbl}>Block Type</label><select value={d.block_type} onChange={e=>setD("block_type",e.target.value)} style={eInp}>{BLOCK_TYPES.map(t=><option key={t} value={t}>{BLOCK_TYPE_LABEL[t]}</option>)}</select></div>
                  {d.block_type!=="straight_set"&&(
                    <div style={{marginBottom:10}}><label style={lbl}>Group Label</label><input type="text" value={d.group_id} onChange={e=>setD("group_id",e.target.value)} placeholder="e.g. A — same label on every exercise in this block" style={eInp}/></div>
                  )}
                  <div style={{marginBottom:12}}><label style={lbl}>Notes</label><input type="text" value={d.notes} onChange={e=>setD("notes",e.target.value)} style={eInp}/></div>
                  <div style={{display:"flex",gap:8}}>
                    <Btn sm teal onClick={saveEditEx}>Save</Btn>
                    <button onClick={()=>setEditEx(null)} style={{padding:"7px 14px",fontSize:10,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600}}>Cancel</button>
                  </div>
                </>
              ):(
                <>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:S.muted,marginBottom:ex.notes?8:12}}>
                    <span><span style={{opacity:.65}}>Sets </span>{ex.sets??"—"}</span>
                    <span><span style={{opacity:.65}}>Reps </span>{ex.reps||"—"}</span>
                    {ex.exercise_type&&<span><span style={{opacity:.65}}>Type </span>{ex.exercise_type}</span>}
                    {ex.section&&<span><span style={{opacity:.65}}>Phase </span>{ex.section}</span>}
                    {ex.block_type&&ex.block_type!=="straight_set"&&<span><span style={{opacity:.65}}>Block </span>{BLOCK_TYPE_LABEL[ex.block_type]}</span>}
                  </div>
                  {ex.notes&&<div style={{fontSize:13,lineHeight:1.6,color:S.text,marginBottom:12}}>{ex.notes}</div>}
                  <div style={{display:"flex",gap:8}}>
                    <Btn sm teal onClick={()=>startEditEx(ex)}>Edit</Btn>
                    <Btn sm danger onClick={()=>delEx(ex.id)}>Remove</Btn>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      ) : (
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["Exercise","Day","Sets","Reps","Type","Phase","Block","Notes",""].map(h=><th key={h} style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:S.muted,textAlign:"left",padding:"10px 14px",borderBottom:"1px solid "+S.border}}>{h}</th>)}</tr></thead>
        <tbody>
          {dayExs.map(ex=>{
            const editing = editEx?.id===ex.id;
            const d = editEx?.draft || {};
            const setD = (k,v)=>setEditEx(p=>({...p,draft:{...p.draft,[k]:v}}));
            const cell = {padding:"9px 14px",fontSize:13,borderBottom:"1px solid "+S.border,verticalAlign:"top"};
            const eInp = {background:S.bg,border:"1px solid "+S.border,color:S.text,padding:"6px 8px",fontSize:13,outline:"none",width:"100%"};
            return (
              <tr key={ex.id}>
                <td style={{...cell,fontWeight:500}}>
                  {ex.name}{ex.is_bodyweight&&<span style={{marginLeft:6,fontSize:9,color:S.muted}}>BW</span>}
                  {BLOCK_TYPE_SHORT[ex.block_type]&&<span style={{marginLeft:6,fontSize:9,color:S.accent2}}>{BLOCK_TYPE_SHORT[ex.block_type]}{ex.group_id?" "+ex.group_id:""}</span>}
                </td>
                {editing?(
                  <>
                    <td style={cell}><select value={d.day_of_week} onChange={e=>setD("day_of_week",e.target.value)} style={eInp}><option value="">—</option>{DAY_ORDER.map((x,i)=><option key={x} value={x}>{"Day "+(i+1)}</option>)}</select></td>
                    <td style={cell}><input type="number" value={d.sets} onChange={e=>setD("sets",e.target.value)} style={{...eInp,width:60}}/></td>
                    <td style={cell}><input type="text" value={d.reps} onChange={e=>setD("reps",e.target.value)} style={{...eInp,width:80}}/></td>
                    <td style={cell}><select value={d.exercise_type} onChange={e=>setD("exercise_type",e.target.value)} style={{...eInp,width:110}}><option value="">Auto</option>{EX_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
                    <td style={cell}><select value={d.section} onChange={e=>setD("section",e.target.value)} style={{...eInp,width:150}}><option value="">Unset</option>{PHASE_ORDER.map(p=><option key={p} value={p}>{p}</option>)}</select></td>
                    <td style={cell}>
                      <select value={d.block_type} onChange={e=>setD("block_type",e.target.value)} style={{...eInp,width:150,marginBottom:d.block_type!=="straight_set"?6:0}}>{BLOCK_TYPES.map(t=><option key={t} value={t}>{BLOCK_TYPE_LABEL[t]}</option>)}</select>
                      {d.block_type!=="straight_set"&&<input type="text" value={d.group_id} onChange={e=>setD("group_id",e.target.value)} placeholder="Group label e.g. A" style={{...eInp,width:150}}/>}
                    </td>
                    <td style={cell}><input type="text" value={d.notes} onChange={e=>setD("notes",e.target.value)} style={eInp}/></td>
                    <td style={cell}>
                      <div style={{display:"flex",gap:6}}>
                        <Btn sm teal onClick={saveEditEx}>Save</Btn>
                        <button onClick={()=>setEditEx(null)} style={{padding:"7px 10px",fontSize:10,background:"transparent",color:S.text,border:"1px solid "+S.border,cursor:"pointer",fontWeight:600}}>Cancel</button>
                      </div>
                    </td>
                  </>
                ):(
                  <>
                    <td style={{...cell,color:S.muted}}>{label}</td>
                    <td style={{...cell,color:S.muted}}>{ex.sets??"—"}</td>
                    <td style={{...cell,color:S.muted}}>{ex.reps||"—"}</td>
                    <td style={{...cell,color:S.muted}}>{ex.exercise_type||<span style={{opacity:.55,fontStyle:"italic"}}>Auto</span>}</td>
                    <td style={{...cell,color:S.muted}}>{ex.section||"—"}</td>
                    <td style={{...cell,color:S.muted}}>{ex.block_type&&ex.block_type!=="straight_set"?BLOCK_TYPE_LABEL[ex.block_type]:"—"}</td>
                    <td style={{...cell,color:S.muted,maxWidth:240}}>{ex.notes||"—"}</td>
                    <td style={cell}>
                      <div style={{display:"flex",gap:6}}>
                        <Btn sm teal onClick={()=>startEditEx(ex)}>Edit</Btn>
                        <Btn sm danger onClick={()=>delEx(ex.id)}>Remove</Btn>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
      </DayFolder>
      ))}
    </Card>
  );
}
