"use client";

import { useEffect, useMemo, useState } from "react";

type Settings={
  acceptingOrders:boolean; autoAccept:boolean; autoPrint:boolean;
  defaultPrepMinutes:number; prepDelayMinutes:number; pausedUntil:string|null;
  timezone:string; slotMinutes:number; maxOrdersPerSlot:number|null;
  cutoffMinutesBeforeClose:number; maxAdvanceDays:number;
  orderingHours:Record<string,[string,string][]>;
  pickupInstructions:string;
  notifications:{pos:boolean;push:boolean;email:boolean;sms:boolean};
};

const DAYS=[["mon","Monday"],["tue","Tuesday"],["wed","Wednesday"],["thu","Thursday"],["fri","Friday"],["sat","Saturday"],["sun","Sunday"]] as const;

function Toggle({checked,onChange,label,detail}:{checked:boolean;onChange:(value:boolean)=>void;label:string;detail:string}){
  return <button type="button" onClick={()=>onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-left">
    <div><p className="font-black text-white">{label}</p><p className="mt-1 text-xs font-semibold text-white/40">{detail}</p></div>
    <span className={"relative h-7 w-12 shrink-0 rounded-full transition "+(checked?"bg-[#e1062a]":"bg-white/15")}>
      <span className={"absolute top-1 h-5 w-5 rounded-full bg-white transition "+(checked?"left-6":"left-1")} />
    </span>
  </button>;
}

export default function OnlineOrderingControls({locationId}:{locationId:string}){
  const [settings,setSettings]=useState<Settings|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    fetch("/api/locations/online-ordering/settings?locationId="+encodeURIComponent(locationId),{cache:"no-store"})
      .then(async response=>{
        const json=await response.json();
        if(!response.ok||!json.ok) throw new Error(json.error||"Unable to load ordering settings.");
        setSettings(json.settings);
      })
      .catch(err=>setError(err instanceof Error?err.message:"Unable to load ordering settings."))
      .finally(()=>setLoading(false));
  },[locationId]);

  const paused=useMemo(()=>Boolean(settings?.pausedUntil&&Date.parse(settings.pausedUntil)>Date.now()),[settings?.pausedUntil]);

  async function save(next:Settings){
    setSaving(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/locations/online-ordering/settings?locationId="+encodeURIComponent(locationId),{
        method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({settings:next}),
      });
      const json=await response.json();
      if(!response.ok||!json.ok) throw new Error(json.error||"Unable to save ordering settings.");
      setSettings(json.settings);setMessage("Online ordering settings saved.");
    }catch(err){setError(err instanceof Error?err.message:"Unable to save ordering settings.");}
    finally{setSaving(false)}
  }

  function patch(patchValue:Partial<Settings>){setSettings(current=>current?{...current,...patchValue}:current);}
  function setDay(day:string,open:string,close:string,enabled:boolean){
    if(!settings) return;
    const orderingHours={...settings.orderingHours};
    if(!enabled) delete orderingHours[day]; else orderingHours[day]=[[open||"11:00",close||"21:00"]];
    patch({orderingHours});
  }
  function pause(minutes:number){
    if(!settings) return;
    patch({acceptingOrders:true,pausedUntil:new Date(Date.now()+minutes*60000).toISOString()});
  }

  if(loading) return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm font-bold text-white/45">Loading online ordering controls…</div>;
  if(!settings) return <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-sm font-bold text-red-200">{error||"Online ordering settings are unavailable."}</div>;

  return <div className="space-y-5">
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Live status</p>
          <h2 className="mt-2 text-2xl font-black text-white">{settings.acceptingOrders&&!paused?"Taking online orders":"Online orders paused"}</h2>
          <p className="mt-1 text-sm font-semibold text-white/40">
            {paused?"Paused until "+new Date(settings.pausedUntil!).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})+".":"Changes here update the existing Order Online page immediately."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[15,30,45,60].map(minutes=><button key={minutes} type="button" onClick={()=>pause(minutes)} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white hover:bg-white/[0.08]">Pause {minutes}m</button>)}
          <button type="button" onClick={()=>patch({pausedUntil:null,acceptingOrders:true})} className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-black text-emerald-300">Resume</button>
        </div>
      </div>
      <div className="mt-5"><Toggle checked={settings.acceptingOrders} onChange={value=>patch({acceptingOrders:value})} label="Accept online orders" detail="Master switch for website pickup ordering." /></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Order flow</p>
        <div className="mt-4 space-y-3">
          <Toggle checked={settings.autoAccept} onChange={value=>patch({autoAccept:value})} label="Auto-accept paid orders" detail="Paid website orders move straight into your active queue." />
          <Toggle checked={settings.autoPrint} onChange={value=>patch({autoPrint:value})} label="Auto-print new orders" detail="Route receipt, kitchen and expo tickets using assigned printers." />
        </div>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Customer notifications</p>
        <div className="mt-4 space-y-3">
          <Toggle checked={settings.notifications.pos} onChange={value=>patch({notifications:{...settings.notifications,pos:value}})} label="POS alerts" detail="Show new-order alerts on ThePOSHaven registers." />
          <Toggle checked={settings.notifications.push} onChange={value=>patch({notifications:{...settings.notifications,push:value}})} label="Push alerts" detail="Notify designated managed devices." />
          <Toggle checked={settings.notifications.email} onChange={value=>patch({notifications:{...settings.notifications,email:value}})} label="Customer email" detail="Send Received, Preparing and Ready email updates." />
          <Toggle checked={settings.notifications.sms} onChange={value=>patch({notifications:{...settings.notifications,sms:value}})} label="Customer SMS" detail="Send Received, Preparing and Ready text updates." />
        </div>
      </div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Prep time & throttling</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-bold text-white/65">Normal prep time<input type="number" min={1} max={240} value={settings.defaultPrepMinutes} onChange={e=>patch({defaultPrepMinutes:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /><span className="mt-1 block text-[11px] text-white/30">minutes</span></label>
        <label className="text-sm font-bold text-white/65">Temporary extra delay<input type="number" min={0} max={240} value={settings.prepDelayMinutes} onChange={e=>patch({prepDelayMinutes:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /><span className="mt-1 block text-[11px] text-white/30">adds to normal prep time</span></label>
        <label className="text-sm font-bold text-white/65">Pickup slot size<select value={settings.slotMinutes} onChange={e=>patch({slotMinutes:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a0c10] px-3 py-3 text-white">{[5,10,15,20,30,45,60].map(value=><option key={value} value={value}>{value} minutes</option>)}</select></label>
        <label className="text-sm font-bold text-white/65">Max orders per slot<input type="number" min={1} max={1000} value={settings.maxOrdersPerSlot??""} placeholder="No limit" onChange={e=>patch({maxOrdersPerSlot:e.target.value?Number(e.target.value):null})} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /></label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold text-white/65">Stop taking orders before closing<input type="number" min={0} max={240} value={settings.cutoffMinutesBeforeClose} onChange={e=>patch({cutoffMinutesBeforeClose:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /><span className="mt-1 block text-[11px] text-white/30">minutes before an ordering window ends</span></label>
        <label className="text-sm font-bold text-white/65">How far ahead guests can order<input type="number" min={0} max={90} value={settings.maxAdvanceDays} onChange={e=>patch({maxAdvanceDays:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /><span className="mt-1 block text-[11px] text-white/30">days</span></label>
      </div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Ordering hours</p>
      <p className="mt-1 text-sm font-semibold text-white/40">These control website pickup ordering only. They do not change your public business hours.</p>
      <div className="mt-4 space-y-2">
        {DAYS.map(([key,label])=>{
          const window=settings.orderingHours[key]?.[0]; const enabled=Boolean(window);
          return <div key={key} className="grid items-center gap-3 rounded-2xl border border-white/8 bg-black/15 px-4 py-3 sm:grid-cols-[130px_80px_1fr_1fr]">
            <p className="font-black text-white">{label}</p>
            <button type="button" onClick={()=>setDay(key,window?.[0]||"11:00",window?.[1]||"21:00",!enabled)} className={"rounded-lg px-2 py-2 text-xs font-black "+(enabled?"bg-emerald-500/15 text-emerald-300":"bg-white/[0.06] text-white/35")}>{enabled?"Open":"Closed"}</button>
            <input type="time" disabled={!enabled} value={window?.[0]||"11:00"} onChange={e=>setDay(key,e.target.value,window?.[1]||"21:00",true)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white disabled:opacity-30" />
            <input type="time" disabled={!enabled} value={window?.[1]||"21:00"} onChange={e=>setDay(key,window?.[0]||"11:00",e.target.value,true)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white disabled:opacity-30" />
          </div>;
        })}
      </div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Pickup instructions</p>
      <textarea rows={4} value={settings.pickupInstructions} onChange={e=>patch({pickupInstructions:e.target.value})} placeholder="Example: Pick up at the host stand. Have your order name ready." className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/25" />
    </section>

    <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0c0e12]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div>{error?<p className="text-sm font-bold text-red-300">{error}</p>:message?<p className="text-sm font-bold text-emerald-300">{message}</p>:<p className="text-xs font-semibold text-white/35">Changes take effect on the existing Order Online page after saving.</p>}</div>
      <button type="button" onClick={()=>save(settings)} disabled={saving} className="rounded-xl bg-[#e1062a] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving?"Saving…":"Save changes"}</button>
    </div>
  </div>;
}
