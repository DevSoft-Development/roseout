"use client";
import {useEffect,useState} from "react";
type Receipt={v:number;items:Array<{id:string;name:string;quantity:number;lineTotalCents:number}>;
 subtotalCents:number;discountCents:number;taxCents:number;serviceChargeCents:number;
 amountCents:number;currency:string;termsText:string;termsVersion:string};
type Response={status:string;receipt:Receipt;amountCents:number;agreementSha256:string;expiresAt:string};
export default function Checkout({locationId,token}:{locationId:string;token:string}){
 const [data,setData]=useState<Response|null>(null);
 const [busy,setBusy]=useState(false),[agreed,setAgreed]=useState(false);
 const [error,setError]=useState(""),[done,setDone]=useState(false);
 useEffect(()=>{
  // Token remains in component state; clear URL so it is not accidentally shared.
  window.history.replaceState(null,"","/pos/customer/checkout");
  let cancelled=false;
  fetch("/api/pos/customer/text-to-pay?locationId="+encodeURIComponent(locationId)+"&token="+encodeURIComponent(token),{
   cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"
  }).then(x=>{if(!x.ok)throw Error("Checkout expired or unavailable");return x.json();})
   .then(x=>{if(!cancelled)setData(x);}).catch(()=>{if(!cancelled)setError("Checkout expired or unavailable");});
  return ()=>{cancelled=true;};
 },[locationId,token]);
 const money=(c:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:data?.receipt.currency.toUpperCase()||"USD"}).format(c/100);
 async function action(kind:"review"|"accept"|"pay"){
  if(!data||busy)return;
  if(kind==="accept"&&!agreed)return;
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/pos/customer/text-to-pay",{
    method:"POST",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({locationId,token,action:kind,
     amountCents:data.amountCents,agreementSha256:data.agreementSha256})
   });
   if(!r.ok)throw Error("The checkout has changed or expired. Please request a new link.");
   const result=await r.json();
   if(kind==="pay"){
    if(!result.checkoutUrl?.startsWith("https://checkout.stripe.com/"))throw Error("Payment is temporarily unavailable");
    window.location.assign(result.checkoutUrl);return;
   }
   setData({...data,status:result.status});if(kind==="accept")setDone(true);
  }catch(e){setError(e instanceof Error?e.message:"Checkout unavailable");}
  finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-xl space-y-5 p-5 text-slate-900">
  <h1 className="text-3xl font-bold">ThePOSHaven · Secure Checkout</h1>
  <p className="text-sm">Review the full purchase before agreeing or paying. Never share this checkout link.</p>
  {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{error}</p>:null}
  {!data&&!error?<p role="status">Loading secure checkout…</p>:null}
  {data?<section className="space-y-5 rounded-xl border p-5">
   <h2 className="text-xl font-bold">Your itemized purchase</h2>
   <ul className="divide-y">{data.receipt.items.map(x=><li key={x.id} className="flex justify-between gap-3 py-3">
    <span>{x.quantity} × {x.name}</span><strong>{money(x.lineTotalCents)}</strong>
   </li>)}</ul>
   <dl className="space-y-2 text-sm">
    {([["Subtotal",data.receipt.subtotalCents],["Discount", -data.receipt.discountCents],["Tax",data.receipt.taxCents],["Service charge",data.receipt.serviceChargeCents]] as const).map(([label,cents])=>
     <div className="flex justify-between" key={label}><dt>{label}</dt><dd>{money(cents)}</dd></div>)}
    <div className="flex justify-between border-t pt-3 text-lg font-bold"><dt>Final total</dt><dd>{money(data.amountCents)}</dd></div>
   </dl>
   <div className="rounded-lg bg-slate-50 p-4 text-sm">
    <h3 className="mb-2 font-bold">Payment authorization agreement</h3>
    <p>{data.receipt.termsText}</p>
    <p className="mt-2 text-xs text-slate-600">Terms version {data.receipt.termsVersion}</p>
   </div>
   {data.status==="issued"?<button disabled={busy} className="w-full rounded-lg bg-slate-900 p-3 font-bold text-white disabled:opacity-40" onClick={()=>action("review")}>I have reviewed the itemized receipt</button>:null}
   {data.status==="reviewed"?<>
    <label className="flex items-start gap-3"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>I accept the displayed payment authorization agreement and total.</label>
    <button disabled={!agreed||busy} className="w-full rounded-lg bg-slate-900 p-3 font-bold text-white disabled:opacity-40" onClick={()=>action("accept")}>Confirm agreement</button>
   </>:null}
   {data.status==="accepted"?<button disabled={busy} className="w-full rounded-lg bg-emerald-700 p-3 font-bold text-white disabled:opacity-40" onClick={()=>action("pay")}>Continue to secure Stripe payment</button>:null}
   {done?<p role="status" className="text-sm">Agreement recorded. You may proceed to secure payment.</p>:null}
  </section>:null}
 </main>;
}
