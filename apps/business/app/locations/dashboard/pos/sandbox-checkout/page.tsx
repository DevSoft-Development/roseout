import Link from "next/link";
import {redirect} from "next/navigation";
import {getInternalDemoLocationAccess} from "@/lib/demo/internal-demo-location-access";
import {resolveOperationalShardForLocationId} from "@/lib/operational-shards";

export const dynamic="force-dynamic";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export default async function SandboxCheckoutPage({searchParams}:{
 searchParams:Promise<{locationId?:string;demoLocationId?:string;demo?:string;fromDemoCenter?:string}>
}){
 const params=await searchParams;
 const locationId=String(params.demoLocationId||params.locationId||"");
 if(!UUID.test(locationId))redirect("/locations/dashboard");
 // A URL query parameter is not authorization: require the signed internal
 // Admin Demo Center viewer and the hidden mirror demo location.
 const access=await getInternalDemoLocationAccess({
  locationId,demoLocationId:params.demoLocationId,
  demo:params.demo==="1",fromDemoCenter:params.fromDemoCenter==="1"
 });
 if(!access)redirect("/business/login");
 const flags={
  sms:process.env.POS_TEXT_TO_PAY_SMS_ENABLED==="true",
  review:process.env.POS_TEXT_TO_PAY_CUSTOMER_REVIEW_ENABLED==="true",
  payment:process.env.POS_TEXT_TO_PAY_STRIPE_CHECKOUT_ENABLED==="true",
  signature:process.env.POS_TEXT_TO_PAY_CUSTOMER_SIGNATURE_ENABLED==="true"
 };
 let openChecks=0,initiatedTenders=0,connection="Unavailable";
 try {
  const shard=await resolveOperationalShardForLocationId(locationId,{mode:"read"});
  const [checks,tenders]=await Promise.all([
   shard.client.from("pos_checks").select("id",{count:"exact",head:true}).eq("location_id",locationId).in("status",["open","held"]),
   shard.client.from("pos_tenders").select("id",{count:"exact",head:true}).eq("location_id",locationId).eq("status","initiated")
  ]);
  if(checks.error||tenders.error)throw Error("preflight_unavailable");
  openChecks=checks.count||0;
  initiatedTenders=tenders.count||0;
  connection="Connected";
 }catch {connection="Read-only preflight unavailable";}
 const ready=flags.sms&&flags.review&&flags.payment&&connection==="Connected"&&openChecks>0&&initiatedTenders>0;
 const back="/locations/dashboard/pos?locationId="+encodeURIComponent(locationId)+"&demo=1&fromDemoCenter=1";
 return <main className="mx-auto max-w-3xl space-y-5 p-6 text-[var(--business-text)]">
  <Link className="underline" href={back}>Back to POS</Link>
  <p className="text-xs font-bold uppercase tracking-wider text-rose-400">ThePOSHaven · Protected demo</p>
  <h1 className="text-3xl font-black">Run Test Checkout — preflight</h1>
  <p className="text-sm text-[var(--business-muted)]">This page checks the sandbox prerequisites. It does not create a check, send an SMS, charge a card, or issue a receipt. Customer checkout still requires an authorized POS device and customer-controlled link.</p>
  <div role="status" className="rounded-xl border border-[var(--business-border)] p-4 font-bold">{ready?"Sandbox prerequisites detected. Begin checkout from an authorized POS device.":"Sandbox checkout is not ready. Missing prerequisites must be resolved before attempting a payment."}</div>
  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--business-border)] p-4 text-sm">
   <dt>Operational shard</dt><dd>{connection}</dd>
   <dt>Open/held checks</dt><dd>{openChecks}</dd>
   <dt>Initiated tenders</dt><dd>{initiatedTenders}</dd>
   <dt>SMS issuance gate</dt><dd>{flags.sms?"Enabled":"Disabled"}</dd>
   <dt>Customer review gate</dt><dd>{flags.review?"Enabled":"Disabled"}</dd>
   <dt>Sandbox Stripe Checkout gate</dt><dd>{flags.payment?"Enabled":"Disabled"}</dd>
   <dt>Optional signature gate</dt><dd>{flags.signature?"Enabled":"Disabled"}</dd>
  </dl>
  <p className="text-sm text-[var(--business-muted)]">For certification, use the existing authorized POS device flow to create a check and tender, send Text-to-Pay, then let the customer review, accept, sign if enabled, and pay in Stripe test mode. Do not turn on live financial features.</p>
 </main>;
}
