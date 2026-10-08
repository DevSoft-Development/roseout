"use client";
import { useEffect,useState } from "react";
const LANES=[{"id":"structured","providerId":"theouthaven.supabase-structured.v1","core":true},{"id":"bm25","providerId":"theouthaven.supabase-bm25.v1","core":true},{"id":"semantic_dense_li","providerId":"theouthaven.supabase-semantic-dense.v1","core":true},{"id":"food_semantic","providerId":"theouthaven.supabase-semantic-food.azure.v1","core":true},{"id":"menu_semantic","providerId":"theouthaven.supabase-semantic-menu.azure.v1","core":true},{"id":"review_intelligence","providerId":"theouthaven.supabase-review-intelligence.v1","core":false}];
export default function SearchV3Operations(){
 const [payload,setPayload]=useState<any>(null),[config,setConfig]=useState<any>(null),[reason,setReason]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){try{const r=await fetch("/api/admin/search-v3/controls",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setPayload(j);setConfig(j.controls);}catch(e){setMessage(String(e));}}
 useEffect(()=>{void refresh()},[]);
 async function replay(){
  const why=reason.trim();
  if(why.length<8){setMessage("Enter an audit reason of at least eight characters before running Golden Replay.");return;}
  setBusy(true);setMessage("");
  try{
    const response=await fetch("/api/admin/search-v3/golden-replay",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:why})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error??"Golden Replay dispatch failed");
    setMessage("Golden Replay workflow requested. Open GitHub Actions to inspect execution and artifacts. This does not approve canary.");
  }catch(error){setMessage(error instanceof Error?error.message:"Golden Replay dispatch failed")}
  finally{setBusy(false)}
}
async function resetBreaker(laneId:string){
 const why=reason.trim();
 if(why.length<8){setMessage("Enter an audit reason of at least eight characters.");return;}
 setBusy(true);setMessage("");
 try{
  const response=await fetch("/api/admin/search-v3/breaker-reset",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({laneId,reason:why}),
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error??"Unable to reset shared breaker");
  setMessage("Breaker reset requested and applied for "+laneId+".");
  await refresh();
 }catch(error){setMessage(error instanceof Error?error.message:"Breaker reset failed");}
 finally{setBusy(false);}
}
async function save(){setBusy(true);setMessage("");try{const r=await fetch("/api/admin/search-v3/controls",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({config,reason})});const j=await r.json();if(!r.ok)throw Error(j.error);setMessage("Saved and audited. Runtime configuration refresh may take a short interval.");await refresh();}catch(e){setMessage(String(e));}finally{setBusy(false)}}
 function laneChange(id:string,patch:object){setConfig((c:any)=>({...c,lanes:{...c.lanes,[id]:{...c.lanes[id],...patch}}}));}
 const gate=payload?.gates;
 return <section className="mt-6 rounded-2xl border border-white/10 bg-[#111114] p-5 text-white" aria-label="Search V3 operations">
 <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-rose-300">Search V3 operations</p><h3 className="mt-1 text-xl font-black">Golden replay, promotion & six lane breakers</h3></div><button className="rounded-xl border border-white/20 px-4 py-2" onClick={()=>void refresh()}>Refresh status</button></div>
 <div className="mt-4 grid gap-3 md:grid-cols-3">{[["Phase 13",gate?.phasePass],["V3 vs V2 replay",gate?.replayPass],["Canary eligible",gate?.canaryEligible]].map(([n,ok])=><div key={String(n)} className="rounded-xl border border-white/10 bg-black/30 p-3"><div className="text-xs text-white/60">{String(n)}</div><strong>{ok?"PASS":"NOT READY"}</strong></div>)}</div>
 <p className="mt-3 text-sm text-white/70">Run Golden Replay from the protected Admin replay runner when available. Five core retrieval lanes are required for promotion; Review Intelligence is the sixth optional lane. V2 fallback is permanently enabled in this control surface.</p>
 <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
 <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold">Production quality evidence</h4><button type="button" disabled={busy||reason.trim().length<8} onClick={()=>void replay()} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold disabled:opacity-40">Run Golden Replay</button></div>
 <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
 {([["V3 success",payload?.golden?.v3?.successRate],["V3 pair success",payload?.golden?.v3?.pairSuccessRate],["V3 p95 (ms)",payload?.golden?.v3?.p95LatencyMs],["Contract failures",payload?.golden?.v3?.contractFailureCount]] as const).map(([name,value])=><div key={name} className="rounded-lg bg-white/5 p-3"><p className="text-xs text-white/60">{name}</p><strong>{typeof value==="number"?value:"No fresh replay"}</strong></div>)}
 </div>
 <p className="mt-3 text-sm text-white/60">Last golden replay: {payload?.golden?.completedAt??"Not available"}. V3 vs V2 no-regression: {payload?.golden?.comparison?.noRegressions?JSON.stringify(payload.golden.comparison.noRegressions):"Not established"}.</p>
 <p className="mt-2 text-sm text-amber-200">The button dispatches the existing production replay workflow. It produces artifacts; until results are persisted and validated by the unified gate, the canary remains locked.</p>
 <a href={payload?.promotionWorkflowUrl??"https://github.com/DevSoft-Development/roseout/actions/workflows/search-v3-promotion-gate.yml"} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-bold text-rose-300 underline">Open unified promotion workflow (GitHub)</a>
 </div>
 <div className="mt-4 grid gap-3 sm:grid-cols-2">{LANES.map(l=>{const c=config?.lanes?.[l.id];const live=payload?.breakerHealth?.rows?.find((row:any)=>row.lane_id===l.id);const opened=live?.open_until&&Date.parse(live.open_until)>Date.now();const probing=live?.probe_until&&Date.parse(live.probe_until)>Date.now();return <div key={l.id} className="rounded-xl border border-white/10 p-4"><div className="flex justify-between"><strong>{l.id.replaceAll("_"," ")}</strong><span className="text-xs text-white/60">{l.core?"Core":"Optional"}</span></div><p className="mt-1 break-all text-xs text-white/40">{l.providerId}</p><div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-white/65">Breaker: {!payload?.breakerHealth?.available?"Unavailable":!live?"No live activity":!c?.enabled||c?.forceOpen?"Manually disabled":opened?"Open":probing?"Half-open probe":"Closed"} · Recorded failures: {live?.failures??"—"}</p><button type="button" onClick={()=>void resetBreaker(l.id)} disabled={busy||reason.trim().length<8||!payload?.breakerHealth?.available} className="rounded-lg border border-rose-400/30 px-2 py-1 text-xs text-rose-200 disabled:opacity-40">Reset breaker</button></div>{c&&<div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><label><input type="checkbox" checked={c.enabled} onChange={e=>laneChange(l.id,{enabled:e.target.checked})}/> Enabled</label><label><input type="checkbox" checked={c.forceOpen} onChange={e=>laneChange(l.id,{forceOpen:e.target.checked})}/> Force open</label><label>Failure limit <input aria-label={l.id+" failure limit"} className="ml-1 w-14 bg-black p-1" type="number" min={1} max={100} value={c.threshold} onChange={e=>laneChange(l.id,{threshold:Number(e.target.value)})}/></label><label>Cooldown ms <input aria-label={l.id+" cooldown"} className="ml-1 w-24 bg-black p-1" type="number" min={1000} max={3600000} value={c.cooldownMs} onChange={e=>laneChange(l.id,{cooldownMs:Number(e.target.value)})}/></label></div>}</div>})}</div>
 {config&&<div className="mt-5 flex flex-wrap items-center gap-4"><label>Rollout <select className="ml-2 bg-black p-2" value={config.mode} onChange={e=>setConfig({...config,mode:e.target.value,canaryPercent:e.target.value==="shadow"?0:config.canaryPercent})}><option value="shadow">Shadow</option><option value="canary" disabled={!gate?.canaryEligible}>Canary</option><option value="primary" disabled>Primary (separate approval)</option></select></label><label>Canary % <input className="ml-2 w-16 bg-black p-2" type="number" min="0" max="5" value={config.canaryPercent} disabled={config.mode!=="canary"} onChange={e=>setConfig({...config,canaryPercent:Number(e.target.value)})}/></label><span className="text-sm">V2 fallback: ON (locked)</span></div>}
 <textarea className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" placeholder="Required change reason (8+ characters)" value={reason} onChange={e=>setReason(e.target.value)}/>
 <button disabled={busy||!config||reason.trim().length<8} onClick={()=>void save()} className="mt-3 rounded-xl bg-rose-700 px-5 py-3 font-bold disabled:opacity-40">Save audited controls</button>
 {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
 <div className="mt-5 rounded-xl border border-amber-600/30 p-3 text-xs text-amber-100">The distributed breaker uses Supabase RPC admission and recovery after its migration is deployed. Live per-lane aggregate health, manual reset, and automatic global rollback remain unverified; no canary is allowed without those checks.</div>
 </section>;
}