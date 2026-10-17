"use client";
import { useCallback, useEffect, useState } from "react";

type Run={id:string;status:string;processed:number;published:number;failed:number;last_error:string|null;recovery_count:number};
type Snapshot={ok:boolean;campaign_id:string;runs:Run[];queue:{run_id:string;target_index:number;status:string;has_provider_task:boolean}[];spend:{estimated_usd:number;actual_usd:number;unreconciled:number};rejections:{reason:string;status:string;count:number}[]};
const URL="/api/admin/location-growth/li-v2-acquisition";
export default function AcquisitionCampaignPanel(){
 const [data,setData]=useState<Snapshot|null>(null);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  try{const r=await fetch(URL,{credentials:"same-origin",cache:"no-store"});const j=await r.json();
   if(!r.ok||!j.ok)throw Error(j.error||"unavailable");setData(j);
  }catch(e){setMessage(e instanceof Error?e.message:"status_unavailable");}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const run=data?.runs?.[0];
 async function act(action:"start"|"pause"|"resume"|"cancel"|"recover"|"reverify"|"reprocess_v3"){
  if(!window.confirm(`Confirm ${action} for li-v2-pilot-001? No new provider purchase is authorized by recovery.`))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch(URL,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,confirmation:"li-v2-pilot-001",runId:run?.id})});
   const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||"command_failed");
   setMessage(`${action} accepted. AWS scheduler handles queued execution.`);await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"command_failed");}
  finally{setBusy(false);}
 }
 return <section className="rounded-2xl border border-white/10 bg-[#111] p-5 space-y-4">
  <h2 className="text-xl font-bold">LI V2 acquisition campaign</h2>
  <p className="text-sm text-white/65">AWS runs the queue automatically. Recovery reuses an existing paid task and is limited to one attempt; it never creates a new provider purchase.</p>
  {data&&<>
   <p className="text-sm">Campaign: {data.campaign_id} · Status: <strong>{run?.status||"none"}</strong> · Published: {run?.published??0} · Failures: {run?.failed??0}</p>
   {run?.last_error&&<p className="text-sm text-amber-200">Latest error: {run.last_error}</p>}
   <p className="text-sm">Reserved estimate: ${Number(data.spend?.estimated_usd||0).toFixed(6)} · Reconciled actual: ${Number(data.spend?.actual_usd||0).toFixed(6)} · Unreconciled: {data.spend?.unreconciled??0}</p>
   <ul className="text-sm space-y-1">{(data.queue||[]).map(q=><li key={q.run_id+q.target_index}>Target {q.target_index}: {q.status} · Provider task {q.has_provider_task?"recorded":"not yet assigned"}</li>)}</ul>
   <h3 className="font-semibold">Candidate decisions</h3>
   <ul className="text-sm space-y-1">{(data.rejections||[]).map(q=><li key={q.reason+q.status}>{q.reason}: {q.count} ({q.status})</li>)}</ul>
   <div className="flex flex-wrap gap-2">
    {(["start","pause","resume","cancel","recover","reverify","reprocess_v3"] as const).map(action=><button key={action} disabled={busy||
     (action==="start"&&!!run&&["queued","running","paused"].includes(run.status))||
     (action==="pause"&&!["queued","running"].includes(run?.status||""))||
     (action==="resume"&&run?.status!=="paused")||
     (action==="cancel"&&!["queued","running","paused"].includes(run?.status||""))||
     (action==="recover"&&!(run?.status==="failed"&&run.last_error==="no_published_locations_to_certify"&&run.recovery_count===0))||
     (action==="reverify"&&!(run?.status==="failed"&&run.last_error==="no_published_locations_to_certify"&&run.recovery_count===1))||
     (action==="reprocess_v3"&&!(run?.status==="failed"&&run.last_error==="no_published_locations_to_certify"&&run.recovery_count===2))}
     className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-30 hover:bg-white/10"
     onClick={()=>void act(action)}>{action==="reprocess_v3"?"Reprocess stored leads (V3)":action==="reverify"?"Reverify existing paid task":action==="recover"?"Recover paid task":action[0].toUpperCase()+action.slice(1)}</button>)}
    <button disabled={busy} className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={()=>void refresh()}>Refresh</button>
   </div>
  </>}
  {message&&<p aria-live="polite" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
