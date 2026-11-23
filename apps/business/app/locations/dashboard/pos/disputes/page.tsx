import {DisputeActions} from "./DisputeActions";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase-server";
import {getLocationOwnerAccess} from "@/lib/auth/locationOwnerAccess";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";

export const dynamic="force-dynamic";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const deadlineLabel=(value:unknown,submitted:unknown,now:number)=>{
 if(!value)return "Not provided";
 const due=Date.parse(String(value));
 if(!Number.isFinite(due))return "Invalid deadline";
 if(submitted)return "Submitted · "+new Date(due).toLocaleString("en-US",{timeZone:"UTC"})+" UTC";
 if(due<=now)return "Deadline passed · "+new Date(due).toLocaleString("en-US",{timeZone:"UTC"})+" UTC";
 if(due-now<=24*60*60*1000)return "URGENT: under 24 hours · "+new Date(due).toLocaleString("en-US",{timeZone:"UTC"})+" UTC";
 return new Date(due).toLocaleString("en-US",{timeZone:"UTC"})+" UTC";
};
export default async function PosDisputes({searchParams}:{searchParams:Promise<{locationId?:string}>}){
 const locationId=String((await searchParams).locationId||"");
 if(!UUID.test(locationId))redirect("/locations/dashboard");
 const auth=await createClient();
 const {data:{user}}=await auth.auth.getUser();
 if(!user)redirect("/business/login");
 const a=await getLocationOwnerAccess(user.id,user.email);
 if(!a.isSuperadmin&&!a.ownedLocationIds.includes(locationId))redirect("/locations/dashboard");
 const enabled=process.env.POS_DISPUTE_CENTER_READ_ENABLED==="true";
 const rows:Record<string,any>[]=[];
 if(enabled){
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const result=await shard.client.from("pos_dispute_cases")
   .select("id,tender_id,provider_dispute_id,amount_cents,currency,reason,status,evidence_due_at,submitted_at,created_at")
   .eq("location_id",locationId).order("created_at",{ascending:false}).limit(100);
  if(result.error)throw Error("pos_disputes_unavailable");
  rows.push(...result.data||[]);
 }
 return <main className="mx-auto max-w-6xl space-y-5 p-5 text-[var(--business-text)]">
  <Link className="underline" href={`/locations/dashboard/pos?locationId=${encodeURIComponent(locationId)}`}>Back to POS</Link>
  <h1 className="text-3xl font-black">Chargeback Management</h1>
  <p className="text-sm text-[var(--business-muted)]">Read-only dispute case review. Evidence assembly and Stripe submission require separate certification and explicit manager approval.</p>
  {!enabled?<p role="status" className="rounded-xl border p-4">Dispute intake and reporting are not enabled for this location yet. No cases are being imported by this page.</p>:
  <div className="overflow-x-auto rounded-xl border border-[var(--business-border)]"><table className="w-full min-w-[700px] text-left text-sm">
   <thead><tr>{["Dispute","Amount","Reason","Status","Evidence deadline","Evidence"].map(x=><th className="p-3" key={x}>{x}</th>)}</tr></thead>
   <tbody>{rows.map(x=><tr className="border-t border-[var(--business-border)]" key={x.id}>
    <td className="p-3 font-mono text-xs">{String(x.provider_dispute_id)}</td>
    <td className="p-3">{new Intl.NumberFormat("en-US",{style:"currency",currency:String(x.currency).toUpperCase()}).format(Number(x.amount_cents)/100)}</td>
    <td className="p-3">{x.reason}</td><td className="p-3">{x.status}</td>
    <td className="p-3">{deadlineLabel(x.evidence_due_at,x.submitted_at,Date.now())}</td>
    <td className="p-3"><Link className="underline" href={`/api/pos/evidence/packet?locationId=${encodeURIComponent(locationId)}&tenderId=${encodeURIComponent(x.tender_id)}`}>Review manifest</Link>{process.env.POS_DISPUTE_MANAGER_APPROVAL_ENABLED==="true"?<DisputeActions locationId={locationId} disputeId={x.id}/>:null}</td>
   </tr>)}</tbody></table>
   {!rows.length?<p className="p-4">No disputes have been imported for this location.</p>:null}
  </div>}
 </main>;
}
