"use client";
import {useMemo,useState} from "react";

type Mode="restaurant"|"activity"|"hybrid";
const items:Record<Mode,{label:string;type:"food"|"activity"|"rental";cents:number}[]>={
 restaurant:[{label:"Classic burger",type:"food",cents:1600},{label:"Chicken Alfredo",type:"food",cents:1900},{label:"Drinks",type:"food",cents:1000}],
 activity:[{label:"Bowling lane",type:"activity",cents:4000},{label:"Shoe rentals",type:"rental",cents:2000}],
 hybrid:[{label:"Bowling lane",type:"activity",cents:4000},{label:"Burger and drinks",type:"food",cents:2600},{label:"Shoe rentals",type:"rental",cents:2000}],
};
const money=(cents:number)=>(cents/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
export default function CheckoutPreview(){
 const [mode,setMode]=useState<Mode>("restaurant"),[guests,setGuests]=useState(4);
 const [autoService,setAutoService]=useState(false),[tip,setTip]=useState(18),[step,setStep]=useState(0),[receipt,setReceipt]=useState("email");
 const quote=useMemo(()=>{
  const subtotal=items[mode].reduce((n,i)=>n+i.cents,0);
  const eligible=items[mode].filter(i=>i.type==="food").reduce((n,i)=>n+i.cents,0);
  const charge=autoService&&guests>=6?Math.round(eligible*0.18):0;
  const suggested=charge===0?Math.round(subtotal*tip/100):0;
  return {subtotal,charge,suggested,total:subtotal+charge+suggested};
 },[mode,guests,autoService,tip]);
 const button="min-h-12 rounded-xl border border-[var(--business-border)] px-4 py-3 text-sm font-bold";
 const stages=["Review + tip","Tap to pay","Signature if needed","Receipt"];
 return <div className="mx-auto max-w-4xl space-y-5 p-5 text-[var(--business-text)]">
  <header><p className="text-xs font-bold uppercase tracking-wider text-rose-400">ThePOSHaven · Interface preview</p><h1 className="mt-2 text-3xl font-black">Customer checkout</h1><p className="mt-2 text-sm text-[var(--business-muted)]">Design-only. No payment, signature, email, or receipt is sent. Tax is excluded from sample amounts.</p></header>
  <nav aria-label="Checkout preview steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stages.map((v,i)=><button key={v} type="button" onClick={()=>setStep(i)} aria-current={step===i?"step":undefined} className={`${button} ${step===i?"border-rose-400 bg-rose-950/40":""}`}>{i+1}. {v}</button>)}</nav>
  <section className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
  {step===0?<div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
     <label className="text-sm font-bold">Venue type<select className="mt-2 w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel)] p-3" value={mode} onChange={e=>{setMode(e.target.value as Mode);setStep(0)}}><option value="restaurant">Restaurant</option><option value="activity">Activity</option><option value="hybrid">Hybrid</option></select></label>
     <label className="text-sm font-bold">Party size<select className="mt-2 w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel)] p-3" value={guests} onChange={e=>setGuests(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>
    </div>
    <div className="space-y-2">{items[mode].map(i=><div key={i.label} className="flex justify-between text-sm"><span>{i.label}</span><strong>{money(i.cents)}</strong></div>)}</div>
    <label className="flex items-center gap-3 rounded-xl border border-[var(--business-border)] p-3"><input type="checkbox" checked={autoService} onChange={e=>setAutoService(e.target.checked)}/> Example 18% disclosed group service charge on food, parties of 6+</label>
    {quote.charge>0?<p className="rounded-lg bg-amber-500/10 p-3 text-sm">Example mandatory service charge: {money(quote.charge)}. An additional tip is not prompted.</p>:<div><p className="mb-3 text-sm font-bold">Optional tip</p><div className="grid grid-cols-4 gap-2">{[0,15,18,20].map(v=><button key={v} type="button" aria-pressed={tip===v} onClick={()=>setTip(v)} className={`${button} ${tip===v?"border-rose-400 bg-rose-950/40":""}`}>{v===0?"None":v+"%"}</button>)}</div></div>}
    <div className="space-y-2 border-t border-[var(--business-border)] pt-4 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{money(quote.subtotal)}</strong></div><div className="flex justify-between"><span>Service charge</span><strong>{money(quote.charge)}</strong></div><div className="flex justify-between"><span>Optional tip</span><strong>{money(quote.suggested)}</strong></div><div className="flex justify-between text-xl font-black"><span>Sample total before tax</span><span>{money(quote.total)}</span></div></div>
    <button type="button" onClick={()=>setStep(1)} className="min-h-12 w-full rounded-xl bg-rose-700 p-3 font-bold text-white">Review payment step</button>
   </div>:step===1?<div className="space-y-5 py-10 text-center"><h2 className="text-3xl font-black">Tap to pay</h2><p className="text-4xl font-black">{money(quote.total)}</p><p>In production, tap your card or phone on the certified reader. No device is connected to this preview.</p><button type="button" onClick={()=>setStep(2)} className={button}>Preview signature stage</button></div>:step===2?<div className="space-y-5 py-8 text-center"><h2 className="text-3xl font-black">Signature — only when required</h2><div className="mx-auto flex min-h-44 max-w-lg items-center justify-center rounded-xl border-2 border-dashed border-[var(--business-border)] text-sm text-[var(--business-muted)]">Signature capture intentionally disabled until trusted-device certification</div><p className="text-sm">A successful contactless payment may not require any signature. Signature never authorizes an additional payment.</p><button type="button" onClick={()=>setStep(3)} className={button}>Continue to receipt</button></div>:<div className="space-y-5 py-6"><h2 className="text-2xl font-black">Receipt preference</h2><fieldset className="space-y-3"><legend className="text-sm text-[var(--business-muted)]">Preview selection only</legend>{[["email","Email"],["sms","Text message"],["print","Print"],["none","No receipt"]].map(([value,label])=><label key={value} className="flex items-center gap-3"><input name="receipt" type="radio" checked={receipt===value} onChange={()=>setReceipt(value)}/>{label}</label>)}</fieldset><p className="text-sm text-[var(--business-muted)]">No receipt is delivered by this preview.</p><button type="button" onClick={()=>setStep(0)} className={button}>Start another sample</button></div>}
  </section>
 </div>;
}
