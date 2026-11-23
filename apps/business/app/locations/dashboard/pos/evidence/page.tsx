import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { resolveOperationalShardForLocationId } from "@/lib/operational-shards";

export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
export default async function PosEvidencePage({searchParams}:{searchParams:Promise<{locationId?:string}>}){
  const locationId=String((await searchParams).locationId||"");
  const signedPdfAvailable=process.env.POS_SIGNED_DISPUTE_PDF_ENABLED==="true";
  if(!uuid.test(locationId))redirect("/locations/dashboard");
  const auth=await createClient();
  const {data:{user}}=await auth.auth.getUser();
  if(!user)redirect("/business/login");
  const access=await getLocationOwnerAccess(user.id,user.email);
  if(!access.isSuperadmin&&!access.ownedLocationIds.includes(locationId))redirect("/locations/dashboard");
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const tenders=await shard.client.from("pos_tenders").select("id,check_id,amount_cents,tip_cents,status,created_at")
    .eq("location_id",locationId).order("created_at",{ascending:false}).limit(50);
  if(tenders.error)throw new Error("pos_evidence_history_unavailable");
  const ids=(tenders.data||[]).map(t=>t.id);
  const evidence=ids.length?await shard.client.from("pos_transaction_evidence")
    .select("tender_id,evidence_type").eq("location_id",locationId).in("tender_id",ids):{data:[],error:null};
  if(evidence.error)throw new Error("pos_evidence_history_unavailable");
  return <main className="mx-auto max-w-6xl p-5 text-[var(--business-text)]">
    <Link href={`/locations/dashboard/pos?locationId=${encodeURIComponent(locationId)}`} className="underline">Back to ThePOSHaven</Link>
    <h1 className="my-4 text-3xl font-bold">Transactions and dispute evidence</h1>
    <p className="mb-5 text-sm text-[var(--business-muted)]">Location-restricted recent transaction history. Signatures are not displayed or exposed here. Printable manifests are evidence summaries, not completed chargeback submissions.</p>
    <div className="overflow-x-auto rounded-xl border border-[var(--business-border)]">
      <table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-[var(--business-border)]"><th className="p-3">Date</th><th className="p-3">Tender</th><th className="p-3">Status</th><th className="p-3">Amount</th><th className="p-3">Evidence</th><th className="p-3">Export</th></tr></thead>
      <tbody>{(tenders.data||[]).map(t=><tr key={t.id} className="border-b border-[var(--business-border)]">
        <td className="p-3">{new Date(t.created_at).toLocaleString("en-US")}</td>
        <td className="p-3 font-mono text-xs">{t.id.slice(0,8)}...</td>
        <td className="p-3">{t.status}</td>
        <td className="p-3">{money(Number(t.amount_cents||0))}</td>
        <td className="p-3">{(evidence.data||[]).filter(e=>e.tender_id===t.id).map(e=>e.evidence_type).join(", ")||"None attached"}</td>
        <td className="p-3"><a className="underline" href={`/api/pos/evidence/packet?locationId=${encodeURIComponent(locationId)}&tenderId=${encodeURIComponent(t.id)}`}>Printable manifest</a>{signedPdfAvailable?<a className="ml-3 underline" href={`/api/pos/evidence/packet/pdf?locationId=${encodeURIComponent(locationId)}&tenderId=${encodeURIComponent(t.id)}`}>Download signed PDF</a>:null}</td>
      </tr>)}</tbody></table>
      {(tenders.data||[]).length===0?<p className="p-5 text-sm">No transactions found for this location.</p>:null}
    </div>
  </main>;
}
