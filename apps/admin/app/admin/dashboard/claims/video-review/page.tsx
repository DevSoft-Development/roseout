"use client";
import { useEffect, useState } from "react";
type Submission = { id:string;location_id:string;claimant_user_id:string;status:string;submitted_at:string;review_reason?:string };
export default function ClaimVideoReviewPage() {
 const [items,setItems]=useState<Submission[]>([]);
 const [selected,setSelected]=useState<{submission:Submission;videoUrl:string}|null>(null);
 const [reason,setReason]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function refresh() {
  const r=await fetch("/api/admin/claims/video-review",{cache:"no-store"});
  if(!r.ok){setError("Unable to load pending reviews");return;}
  const data=await r.json();setItems(data.submissions||[]);
 }
 useEffect(()=>{void refresh()},[]);
 async function open(id:string){
  setError("");const r=await fetch("/api/admin/claims/video-review?id="+encodeURIComponent(id),{cache:"no-store"});
  if(!r.ok){setError("Cannot load private evidence");return;}
  setSelected(await r.json());setReason("");
 }
 async function decide(decision:"approved"|"rejected"){
  if(!selected||!reason.trim()) {setError("A review reason is required");return;}
  setBusy(true);setError("");
  try {
   const r=await fetch("/api/admin/claims/video-review",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:selected.submission.id,decision,reason})});
   if(!r.ok)throw Error("Review failed");
   setSelected(null);await refresh();
  }catch{setError("Unable to save review")}finally{setBusy(false)}
 }
 return <main className="mx-auto max-w-5xl p-8 space-y-5"><h1 className="text-3xl font-bold">Claim video evidence review</h1>
 <p>These decisions verify evidence only. They do not grant location ownership.</p>
 {error&&<p role="alert">{error}</p>}
 <button onClick={()=>void refresh()} className="rounded border p-2">Refresh review queue</button>
 <ul className="space-y-3">{items.map(item=><li key={item.id} className="rounded border p-4">
 <p>Location: {item.location_id}</p><p>Submitted: {new Date(item.submitted_at).toLocaleString()}</p>
 <button className="mt-2 rounded border p-2" onClick={()=>void open(item.id)}>Review private video</button></li>)}</ul>
 {selected&&<section className="rounded border p-4 space-y-3"><h2 className="font-bold">Evidence review</h2>
 <video controls preload="none" src={selected.videoUrl} className="w-full max-w-xl" />
 <label className="block">Review notes <textarea className="block w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)} /></label>
 <div className="flex gap-3"><button disabled={busy} onClick={()=>void decide("approved")} className="rounded border p-2">Accept evidence</button>
 <button disabled={busy} onClick={()=>void decide("rejected")} className="rounded border p-2">Reject evidence</button></div></section>}
 </main>;
}
