import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, bS } from "../../theme.jsx";
import { Card, Alert } from "../../components/ui/index.js";

// Sunday that starts the week containing `s` (mirrors WeeklyCheckin's weekStart
// so a photo's derived week matches its check-in's stored date).
const weekStartOf = (s) => { const d=new Date(s); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split("T")[0]; };
// "2026-07-11" -> "7/11/2026"
const fmtWeek = (s) => { const [y,m,d]=s.split("-"); return `${+m}/${+d}/${y}`; };

// Progress photos: grouped into weekly sets. Each photo links to that week's
// weekly check-in when one exists (checkin_id); otherwise it's bucketed by the
// week its taken_on falls in. Upload stamps today; storage is private (signed URLs).
// Local-timezone date, used only for photo taken-on/week bucketing. The
// app-wide todayStr() is UTC-based (used by adherence/nutrition scoring
// elsewhere) and changing its behavior is out of scope here — this stays
// scoped to the one bug it actually causes: a late-evening photo landing in
// the wrong check-in week because it got stamped with tomorrow's UTC date.
function localDateStr() {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().split("T")[0];
}

// Browsers can't decode HEIC/HEIF (the default iPhone photo format) into an
// <img>, so a photo that uploads "successfully" in that format silently
// renders as a broken image everywhere it's shown, including inside the
// before/after compare slider. Reject it client-side with a clear message
// instead of letting it through only to fail invisibly later.
const UNSUPPORTED_IMAGE_RE = /heic|heif/i;
function isUnsupportedImage(file) {
  return UNSUPPORTED_IMAGE_RE.test(file.type) || UNSUPPORTED_IMAGE_RE.test(file.name);
}

export function ProgressPhotos({ profile, coachView = false }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const [activeWeek, setActiveWeek] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [beforeId, setBeforeId] = useState(null);
  const [afterId, setAfterId] = useState(null);
  const [pos, setPos] = useState(50);   // slider position, 0-100

  const load = useCallback(async()=>{
    const [{data:rows}, {data:checkins}] = await Promise.all([
      supabase.from("progress_photos").select("*").eq("client_id",profile.id).order("taken_on",{ascending:false}),
      supabase.from("weekly_checkins").select("id,date").eq("client_id",profile.id),
    ]);
    const ciDate = {}; (checkins||[]).forEach(c=>{ ciDate[c.id]=c.date; });
    const paths = (rows||[]).map(r=>r.path);
    const urls = {};
    if(paths.length){
      const {data:signed} = await supabase.storage.from("progress-photos").createSignedUrls(paths, 3600);
      (signed||[]).forEach(s=>{ if(s.path && s.signedUrl) urls[s.path]=s.signedUrl; });
    }
    setPhotos((rows||[]).map(r=>{
      const base = (r.checkin_id && ciDate[r.checkin_id]) || r.taken_on || (r.created_at||"").slice(0,10);
      return {...r, url:urls[r.path], week: base ? weekStartOf(base) : null};
    }));
    setLoading(false);
  },[profile.id]);
  useEffect(()=>{load();},[load]);

  // Distinct weeks, newest first; keep a valid tab selected.
  const weeks = [...new Set(photos.map(p=>p.week).filter(Boolean))].sort().reverse();
  const active = (activeWeek && weeks.includes(activeWeek)) ? activeWeek : (weeks[0]||null);
  const shown = photos.filter(p=>p.week===active);

  const onUpload = async(e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    if(isUnsupportedImage(file)){
      setErr("This looks like a HEIC/HEIF photo, which most browsers can't display. On iPhone, share it as JPEG (or set Settings → Camera → Formats to \"Most Compatible\") and try again.");
      e.target.value = "";
      return;
    }
    setUploading(true); setErr(null);
    const ext = (file.name.split(".").pop()||"jpg").toLowerCase();
    const path = `${profile.id}/${Date.now()}.${ext}`;
    try{
      const {error:upErr} = await supabase.storage.from("progress-photos").upload(path, file, {upsert:false, contentType:file.type});
      if(upErr) throw upErr;
      // Link to this week's check-in if the client has already logged one.
      const today = localDateStr();
      const wk = weekStartOf(today);
      const {data:ci} = await supabase.from("weekly_checkins").select("id").eq("client_id",profile.id).eq("date",wk).maybeSingle();
      const {error:insErr} = await supabase.from("progress_photos").insert({client_id:profile.id, path, taken_on:today, checkin_id:ci?.id||null});
      if(insErr){
        // Don't leave an orphaned file in storage with no metadata row.
        await supabase.storage.from("progress-photos").remove([path]);
        throw insErr;
      }
      setActiveWeek(wk);
      await load();
    }catch(e2){ setErr(e2.message); }
    finally{ setUploading(false); e.target.value=""; }
  };

  const remove = async(p)=>{
    if(!window.confirm("Delete this photo?")) return;
    setErr(null);
    const {error:rmErr} = await supabase.storage.from("progress-photos").remove([p.path]);
    if(rmErr){ setErr(rmErr.message); return; }
    const {error:delErr} = await supabase.from("progress_photos").delete().eq("id",p.id);
    if(delErr){ setErr(delErr.message); return; }
    await load();
  };

  return (
    <div>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20}}>Progress Photos</div>
            <div style={{fontSize:11,color:S.muted}}>Private to you and your coach. Grouped by check-in week — shoot in consistent lighting and angle for the best comparison.</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {photos.filter(p=>p.url).length>=2 && (
              <button onClick={()=>{
                const withUrl=photos.filter(p=>p.url);
                if(!comparing){ setAfterId(withUrl[0].id); setBeforeId(withUrl[withUrl.length-1].id); setPos(50); }
                setComparing(c=>!c);
              }} style={{...bS({}),background:comparing?S.accent:"transparent",color:comparing?"white":S.text,border:"1px solid "+(comparing?S.accent:S.border)}}>
                {comparing?"Close compare":"⇆ Compare"}
              </button>
            )}
            {!coachView && (
              <label style={{...bS({}),background:S.neon,color:"#0A0A0B",display:"inline-block",cursor:uploading?"default":"pointer",opacity:uploading?0.6:1}}>
                {uploading?"Uploading...":"+ Upload Photo"}
                <input type="file" accept="image/*" onChange={onUpload} disabled={uploading} style={{display:"none"}}/>
              </label>
            )}
          </div>
        </div>
        <Alert variant="error">{err}</Alert>
      </Card>
      {comparing && (()=>{
        const withUrl = photos.filter(p=>p.url);
        const before = withUrl.find(p=>p.id===beforeId) || withUrl[withUrl.length-1];
        const after  = withUrl.find(p=>p.id===afterId)  || withUrl[0];
        const dateOf = (p)=> p ? (p.taken_on||(p.created_at||"").slice(0,10)) : "";
        const sel = { background:S.surface2, border:"1px solid "+S.border, color:S.text, padding:"8px 10px", fontSize:12, outline:"none" };
        return (
          <Card>
            <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:14}}>
              <div><div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted,marginBottom:4}}>Before</div>
                <select value={before?.id||""} onChange={e=>setBeforeId(e.target.value)} style={sel}>
                  {withUrl.map(p=><option key={p.id} value={p.id}>{dateOf(p)}</option>)}
                </select></div>
              <div><div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:S.muted,marginBottom:4}}>After</div>
                <select value={after?.id||""} onChange={e=>setAfterId(e.target.value)} style={sel}>
                  {withUrl.map(p=><option key={p.id} value={p.id}>{dateOf(p)}</option>)}
                </select></div>
            </div>
            <div style={{position:"relative",width:"100%",maxWidth:460,height:520,margin:"0 auto",overflow:"hidden",border:"1px solid "+S.border,background:S.bg}}>
              <img src={after?.url} alt="after" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
              <div style={{position:"absolute",inset:0,clipPath:`inset(0 ${100-pos}% 0 0)`}}>
                <img src={before?.url} alt="before" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              </div>
              <div style={{position:"absolute",top:0,bottom:0,left:pos+"%",width:2,background:S.neon,pointerEvents:"none"}}/>
              <span style={{position:"absolute",top:8,left:8,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",background:"rgba(0,0,0,.6)",color:"#fff",padding:"3px 7px"}}>Before · {dateOf(before)}</span>
              <span style={{position:"absolute",top:8,right:8,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",background:"rgba(0,0,0,.6)",color:"#fff",padding:"3px 7px"}}>After · {dateOf(after)}</span>
            </div>
            <input type="range" min={0} max={100} value={pos} onChange={e=>setPos(Number(e.target.value))}
              style={{width:"100%",maxWidth:460,display:"block",margin:"14px auto 0",accentColor:S.accent,cursor:"ew-resize"}}/>
          </Card>
        );
      })()}
      {loading ? <div className="spinner" style={{margin:"40px auto"}}/> :
        photos.length===0 ? <Card style={{textAlign:"center",padding:40,color:S.muted}}>No photos yet. Upload your first to start your visual timeline.</Card> :
        <>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"16px 0"}}>
            {weeks.map(w=>{
              const on = w===active;
              return (
                <button key={w} onClick={()=>setActiveWeek(w)}
                  style={{padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:"1px solid "+(on?S.neon:S.border),background:on?S.neon:S.surface,color:on?"#0A0A0B":S.text}}>
                  {fmtWeek(w)} <span style={{opacity:.65,fontWeight:400}}>· {photos.filter(p=>p.week===w).length}</span>
                </button>
              );
            })}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
            {shown.map(p=>(
              <div key={p.id} style={{border:"1px solid "+S.border,background:S.surface}}>
                {p.url
                  ? <img src={p.url} alt="" style={{width:"100%",height:210,objectFit:"cover",display:"block"}}/>
                  : <div style={{height:210,display:"flex",alignItems:"center",justifyContent:"center",color:S.muted,fontSize:12}}>unavailable</div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px"}}>
                  <span style={{fontSize:11,color:S.muted}}>{p.taken_on||(p.created_at||"").slice(0,10)}</span>
                  {!coachView && <button onClick={()=>remove(p)} style={{background:"none",border:"none",color:"#ff6b5b",cursor:"pointer",fontSize:11,fontWeight:600}}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      }
    </div>
  );
}
