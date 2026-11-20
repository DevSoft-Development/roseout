"use client";
import {useState} from "react";
export function DisputeActions({locationId,disputeId}:{locationId:string;disputeId:string}){
 const [digest,setDigest]=useState("");
 const [summary,setSummary]=useState("");
 const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function call(endpoint:string,payload:Record<string,string>){
  const response=await fetch(endpoint,{
   method:"POST",credentials:"same-origin",cache:"no-store",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({locationId,disputeId,...payload})
  });
  if(!response.ok)throw Error("Action unavailable; check authorization, eligibility and deployment flags.");
  return response.json();
 }
 async function step(action:"prepare"|"approve"|"submit"){
  if(busy)return;
  if(action==="submit"&&!window.confirm("Submit the reviewed evidence to Stripe test mode? This action cannot be undone."))return;
  setBusy(true);setMessage("");
  try{
   if(action==="prepare"){
    const r=await call("/api/pos/disputes/prepare",{});
    setDigest(r.sha256);
    setSummary("Evidence manifest: "+String(r.manifest?.items?.length||0)+" item lines. Dispute reason: "+r.reason);
    setApproved(false);
    setMessage("Evidence snapshot prepared. Review all records before approval.");
   }else{
    if(!digest)throw Error("Prepare an evidence snapshot first.");
    const r=await call("/api/pos/disputes/review",{action,sha256:digest});
    if(action==="approve")setApproved(Boolean(r.approved));
    setMessage(action==="submit"?"Submitted to Stripe sandbox.":"Manager approval recorded.");
   }
  }catch(e){setMessage(e instanceof Error?e.message:"Action failed");}
  finally{setBusy(false);}
 }
 return <section className="space-y-2 py-3">
  <p className="text-xs">{summary||"No evidence snapshot prepared."}</p>
  <div className="flex flex-wrap gap-2">
   <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={()=>step("prepare")}>Prepare evidence</button>
   <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy||!digest} onClick={()=>step("approve")}>Approve packet</button>
   <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy||!approved} onClick={()=>step("submit")}>Submit to Stripe sandbox</button>
  </div>
  {message?<p role="status" className="text-xs">{message}</p>:null}
 </section>;
}
