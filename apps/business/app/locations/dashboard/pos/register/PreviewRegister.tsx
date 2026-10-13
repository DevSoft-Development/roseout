"use client";

import { useMemo, useState } from "react";

type Item = {id:string;name:string;priceCents:number;course:string;isAvailable:boolean};
type Table = {id:string;label:string;capacity:number};
type CartLine = {key:string;item:Item;quantity:number;seat:number};
const format = (cents:number) => (cents/100).toLocaleString("en-US",{style:"currency",currency:"USD"});

export default function PreviewRegister({tables,items}:{tables:Table[];items:Item[]}) {
  const [tableId,setTableId]=useState("counter");
  const [guests,setGuests]=useState(2);
  const [seat,setSeat]=useState(1);
  const [category,setCategory]=useState("all");
  const [search,setSearch]=useState("");
  const [lines,setLines]=useState<CartLine[]>([]);
  const [sent,setSent]=useState(false);
  const [paid,setPaid]=useState(false);
  const [paymentMethod,setPaymentMethod]=useState<"cash"|"card">("card");
  const categories=useMemo(()=>["all",...new Set(items.map(item=>item.course))],[items]);
  const filtered=items.filter(item=>(category==="all"||item.course===category)&&item.name.toLowerCase().includes(search.toLowerCase()));
  const subtotal=lines.reduce((total,line)=>total+line.item.priceCents*line.quantity,0);
  const add=(item:Item)=>{
    if(sent||paid||!item.isAvailable)return;
    const key=`${item.id}:${seat}`;
    setLines(current=>{
      const found=current.find(line=>line.key===key);
      return found?current.map(line=>line.key===key?{...line,quantity:line.quantity+1}:line):[...current,{key,item,quantity:1,seat}];
    });
  };
  const change=(key:string,delta:number)=>{
    if(sent||paid)return;
    setLines(current=>current.map(line=>line.key===key?{...line,quantity:line.quantity+delta}:line).filter(line=>line.quantity>0));
  };
  const reset=()=>{setLines([]);setSent(false);setPaid(false);setSeat(1);};
  return <section className="mt-6 rounded-3xl border border-amber-400/30 bg-[var(--business-panel)] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-amber-300">Interactive sandbox · no database writes</p><h2 className="mt-1 text-2xl font-black">Practice register</h2></div>
      <button type="button" onClick={reset} className="rounded-xl border border-white/25 px-4 py-3 text-sm font-bold">Reset practice check</button>
    </div>
    <p className="mt-2 text-sm text-[var(--business-muted)]">Practice table selection, seating, item entry, sending courses and tendering. All actions are simulated in this browser tab; no real orders, payments or kitchen tickets are created.</p>
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,370px)]">
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="col-span-2 text-xs font-semibold sm:col-span-1">Table
            <select value={tableId} onChange={e=>{reset();setTableId(e.target.value);}} className="mt-1 w-full rounded-xl border border-white/20 bg-[#15151a] p-3 text-white"><option value="counter">Counter / takeout</option>{tables.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>
          </label>
          <label className="text-xs font-semibold">Guests
            <select value={guests} onChange={e=>{setGuests(Number(e.target.value));setSeat(1);}} className="mt-1 w-full rounded-xl border border-white/20 bg-[#15151a] p-3 text-white">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select>
          </label>
          <label className="text-xs font-semibold">Seat
            <select value={seat} onChange={e=>setSeat(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/20 bg-[#15151a] p-3 text-white">{Array.from({length:guests},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select>
          </label>
        </div>
        <input aria-label="Search POS menu" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search menu..." className="mt-4 w-full rounded-xl border border-white/20 bg-[#15151a] p-3 text-white" />
        <div className="mt-3 flex flex-wrap gap-2">{categories.map(c=><button type="button" key={c} onClick={()=>setCategory(c)} aria-pressed={category===c} className={`rounded-xl border px-3 py-2 text-xs font-bold ${category===c?"border-rose-500 bg-rose-950":"border-white/20"}`}>{c}</button>)}</div>
        <div className="mt-4 grid max-h-[510px] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {filtered.map(item=><button type="button" key={item.id} onClick={()=>add(item)} disabled={!item.isAvailable||sent||paid} className="min-h-28 rounded-2xl border border-white/15 p-3 text-left disabled:opacity-40"><span className="block text-sm font-bold">{item.name}</span><span className="mt-2 block text-sm">{format(item.priceCents)}</span><span className="block text-xs text-[var(--business-muted)]">{item.isAvailable?"Add to check":"Sold out"}</span></button>)}
        </div>
      </div>
      <div className="rounded-2xl border border-white/15 p-4">
        <h3 className="text-lg font-black">Practice check</h3><p className="text-xs text-[var(--business-muted)]">{tableId==="counter"?"Counter":tables.find(t=>t.id===tableId)?.label} · {guests} guests</p>
        <div className="mt-4 max-h-[330px] space-y-3 overflow-y-auto">{lines.map(line=><div key={line.key} className="border-b border-white/10 pb-3">
          <div className="flex justify-between gap-2 text-sm"><span>{line.item.name} · Seat {line.seat}</span><strong>{format(line.item.priceCents*line.quantity)}</strong></div>
          <div className="mt-2 flex items-center gap-3"><button type="button" aria-label={`Remove one ${line.item.name}`} disabled={sent||paid} onClick={()=>change(line.key,-1)} className="rounded-lg border border-white/20 px-3 py-1 disabled:opacity-40">−</button><span>{line.quantity}</span><button type="button" aria-label={`Add one ${line.item.name}`} disabled={sent||paid} onClick={()=>change(line.key,1)} className="rounded-lg border border-white/20 px-3 py-1 disabled:opacity-40">+</button></div>
        </div>)}</div>
        {!lines.length?<p className="mt-4 text-sm text-[var(--business-muted)]">Tap a menu item to start.</p>:null}
        <div className="mt-4 flex justify-between border-t border-white/20 pt-4 text-lg font-black"><span>Subtotal (simulation)</span><span>{format(subtotal)}</span></div>
        <p className="mt-1 text-xs text-[var(--business-muted)]">Tax, tips and service charges are excluded from this practice calculation.</p>
        <button type="button" disabled={!lines.length||sent||paid} onClick={()=>setSent(true)} className="mt-4 w-full rounded-xl bg-rose-700 p-3 font-bold text-white disabled:opacity-40">Simulate send to kitchen</button>
        {sent?<><p role="status" className="mt-3 text-sm text-emerald-300">Simulated kitchen ticket prepared — nothing was transmitted.</p>
          <label className="mt-3 block text-xs font-semibold">Practice tender
            <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as "cash"|"card")} className="mt-1 w-full rounded-xl border border-white/20 bg-[#15151a] p-3 text-white"><option value="card">Card (simulated)</option><option value="cash">Cash (simulated)</option></select>
          </label>
          <button type="button" disabled={paid} onClick={()=>setPaid(true)} className="mt-3 w-full rounded-xl border border-emerald-400/40 p-3 font-bold disabled:opacity-40">Simulate {paymentMethod} payment</button>
        </>:null}
        {paid?<p role="status" className="mt-3 text-sm font-bold text-emerald-300">Practice check complete. No money moved.</p>:null}
      </div>
    </div>
  </section>;
}
