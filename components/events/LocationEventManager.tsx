"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { createLocationEventAction, updateLocationEventStatusAction } from "@/app/locations/dashboard/events/actions";
import VisualDateTimePicker from "@/components/forms/VisualDateTimePicker";

type EventRow = { id:string; title:string; slug:string|null; category:string|null; starts_at:string; ends_at:string|null; status:string; searchable:boolean; is_free:boolean; price_min:number|string|null; capacity:number|null; image_url:string|null };
type Metrics = { events:number; upcoming:number; published:number; tickets:number; checkedIn:number; grossSalesCents:number; netSalesCents:number };

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#e1062a]/10";

function slugify(value:string){return value.toLowerCase().normalize("NFKD").replace(/[’']/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);}
function Step({number,title,description,children}:{number:number;title:string;description:string;children:ReactNode}){return <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">{number}</span><div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm font-semibold text-white/45">{description}</p></div></div><div className="mt-5">{children}</div></section>}
function Field({label,children,optional=false}:{label:string;children:ReactNode;optional?:boolean}){return <label className="grid gap-1.5"><span className="text-xs font-black text-white/60">{label} {optional?<span className="font-semibold text-white/30">Optional</span>:<span className="text-[#ff6b86]">* Required</span>}</span>{children}</label>}

export default function LocationEventManager({locationId,location,events,metrics:_metrics}:{locationId:string;location:{name:string;address:string|null;city:string|null;state:string|null;zip_code:string|null};events:EventRow[];metrics:Metrics}){
  const [title,setTitle]=useState("");
  const [slug,setSlug]=useState("");
  const generated=useMemo(()=>slug||slugify(title),[slug,title]);
  const readinessChecks=[Boolean(title.trim()),Boolean(generated),true,true];
  const readiness=Math.round((readinessChecks.filter(Boolean).length/readinessChecks.length)*100);

  return <div className="space-y-5">
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
        <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">1</span><div><h2 className="text-xl font-black">Choose the event you are setting up</h2><p className="mt-1 text-sm font-semibold text-white/45">Create a new event below or open an existing event to see its sales, tickets, and attendance.</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{events.slice(0,6).map(event=><Link key={event.id} href={`/locations/dashboard/events-experiences/events/${event.id}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"><p className="truncate text-sm font-black">{event.title}</p><p className="mt-1 text-xs font-semibold text-white/35">{event.status} · {new Date(event.starts_at).toLocaleDateString()}</p><p className="mt-3 text-xs font-black text-[#ff6b86]">View overview →</p></Link>)}{!events.length?<div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No events yet. Start with the setup below.</div>:null}</div>
      </div>
      <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Event readiness</p><div className="mt-3 flex items-end gap-2"><p className="text-4xl font-black">{readiness}%</p><p className="pb-1 text-xs font-bold text-white/30">new event</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff2142]" style={{width:`${readiness}%`}}/></div><p className="mt-4 text-sm font-semibold leading-6 text-white/45">The event stays a draft until you publish it. Paid ticket events still require TheOutHaven Payments readiness.</p></aside>
    </section>

    <form action={createLocationEventAction} className="space-y-5">
      <input type="hidden" name="location_id" value={locationId}/>
      <Step number={2} title="Event basics" description="Give guests a clear event name, category, description, and cover image.">
        <div className="grid gap-4 md:grid-cols-2"><Field label="Event name"><input name="title" required value={title} onChange={event=>setTitle(event.target.value)} placeholder="Rooftop R&B Summer Night" className={inputClass}/></Field><Field label="Category"><input name="category" required placeholder="Nightlife, dining, workshop..." className={inputClass}/></Field><Field label="Cover image URL" optional><input name="image_url" type="url" placeholder="https://..." className={inputClass}/></Field><Field label="Description"><textarea name="description" required rows={4} placeholder="Tell guests what to expect." className={inputClass}/></Field></div>
      </Step>

      <Step number={3} title="Date, time, and place" description="Choose dates from a real calendar and times from a 12-hour time picker. All times are Eastern Time.">
        <div className="grid gap-4 xl:grid-cols-2"><VisualDateTimePicker label="Starts" dateName="starts_date" timeName="starts_time" required/><VisualDateTimePicker label="Ends" dateName="ends_date" timeName="ends_time"/></div>
        <p className="mt-3 text-xs font-semibold text-white/35">Eastern Time is applied automatically. You do not need to choose a time zone.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Venue"><input name="venue_name" required defaultValue={location.name} className={inputClass}/></Field><Field label="Address"><input name="address" required defaultValue={location.address||""} className={inputClass}/></Field><Field label="City"><input name="city" required defaultValue={location.city||""} className={inputClass}/></Field><Field label="State"><input name="state" required defaultValue={location.state||"NY"} className={inputClass}/></Field><Field label="ZIP code"><input name="zip_code" required defaultValue={location.zip_code||""} className={inputClass}/></Field></div>
      </Step>

      <Step number={4} title="Tickets, capacity, and fees" description="Choose how registration works and who covers TheOutHaven and payment-processing fees.">
        <div className="grid gap-4 md:grid-cols-2"><label className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-black"><input name="ticketing_enabled" type="checkbox" defaultChecked className="mr-2"/>Enable tickets / registration</label><label className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-black"><input name="is_free" type="checkbox" defaultChecked className="mr-2"/>This is a free event</label><Field label="Ticket price" optional><input name="price_min" type="number" min="0" step="0.01" placeholder="0.00" className={inputClass}/></Field><Field label="Capacity" optional><input name="capacity" type="number" min="1" placeholder="100" className={inputClass}/></Field><Field label="Who pays fees?"><select name="fee_payer" defaultValue="customer" className={inputClass}><option value="customer">Customer pays fees</option><option value="organizer">Location pays fees</option><option value="split">Split 50 / 50</option></select></Field></div>
      </Step>

      <Step number={5} title="Public URL" description="A readable URL is generated from the event name. Customize it before creating the draft if you want.">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-white/35">Public event page</p><div className="mt-2 flex flex-wrap items-center gap-1 text-sm"><span className="text-white/40">theouthaven.com/events/</span><input name="slug" value={generated} onChange={event=>setSlug(slugify(event.target.value))} className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-black text-white outline-none focus:border-[#ff2142]/60"/></div></div>
      </Step>

      <Step number={6} title="Review and create" description="Create the draft now. You can review it again before making it public.">
        <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-white/45">Published events automatically appear on the location's public TheOutHaven page and hosted website content.</p><button className="rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#ff1654]/20">Create draft event</button></div>
      </Step>
    </form>

    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
      <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">7</span><div><h2 className="text-xl font-black">Manage and publish</h2><p className="mt-1 text-sm font-semibold text-white/45">Performance numbers live on each event Overview. Use this section only to open, preview, or publish events.</p></div></div>
      <div className="mt-5 space-y-3">{events.length?events.map(event=><article key={event.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#ff6b86]">{event.category||"Event"}</p><h3 className="mt-1 font-black">{event.title}</h3><p className="mt-1 text-xs font-semibold text-white/35">{new Date(event.starts_at).toLocaleString()} · {event.status}</p></div><div className="flex flex-wrap gap-2"><Link href={`/locations/dashboard/events-experiences/events/${event.id}`} className="rounded-xl border border-[#ff2142]/30 bg-[#e1062a]/10 px-3 py-2 text-xs font-black">Overview</Link><Link href={`/events/${event.slug||event.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black">Public page</Link><form action={updateLocationEventStatusAction}><input type="hidden" name="location_id" value={locationId}/><input type="hidden" name="event_id" value={event.id}/><input type="hidden" name="status" value={event.status==="scheduled"?"draft":"scheduled"}/><button className="rounded-xl bg-[#e1062a] px-3 py-2 text-xs font-black">{event.status==="scheduled"?"Unpublish":"Publish"}</button></form></div></div></article>):<p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No events yet.</p>}</div>
    </section>
  </div>;
}
