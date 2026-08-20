"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type EventItem={id:string;slug:string|null;title:string;category:string|null;starts_at:string;image_url:string|null;is_free:boolean;price_min:number|string|null};
type ExperienceItem={id:string;slug:string|null;title:string;category:string|null;image_url:string|null;duration_minutes:number;price_per_person:number|string};

export default function PublicLocationOfferings({basePath,events,experiences}:{basePath:string;events:EventItem[];experiences:ExperienceItem[]}){
 const pathname=usePathname();
 if(pathname!==basePath||(!events.length&&!experiences.length))return null;
 return <section className="bg-[#050505] px-4 pb-20 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl border-t border-white/10 pt-10">
  {events.length?<div><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff5570]">What’s happening</p><h2 className="mt-2 text-3xl font-black">Upcoming Events</h2></div></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map(event=><Link key={event.id} href={`/events/${event.slug||event.id}`} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.035] transition hover:border-[#ff2142]/40 hover:bg-white/[.06]">{event.image_url?<div className="h-44 bg-cover bg-center" style={{backgroundImage:`url(${event.image_url})`}}/>:null}<div className="p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-[#ff5570]">{event.category||"Event"}</p><h3 className="mt-2 text-xl font-black">{event.title}</h3><p className="mt-2 text-sm text-white/50">{new Date(event.starts_at).toLocaleString()}</p><p className="mt-3 font-black">{event.is_free?"Free":event.price_min!=null?`From $${Number(event.price_min).toFixed(2)}`:"View details"}</p></div></Link>)}</div></div>:null}
  {experiences.length?<div className={events.length?"mt-12":""}><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff5570]">Book something memorable</p><h2 className="mt-2 text-3xl font-black">Experiences</h2><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{experiences.map(exp=><Link key={exp.id} href={`/experiences/${exp.slug||exp.id}`} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.035] transition hover:border-[#ff2142]/40 hover:bg-white/[.06]">{exp.image_url?<div className="h-44 bg-cover bg-center" style={{backgroundImage:`url(${exp.image_url})`}}/>:null}<div className="p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-[#ff5570]">{exp.category||"Experience"}</p><h3 className="mt-2 text-xl font-black">{exp.title}</h3><p className="mt-2 text-sm text-white/50">{exp.duration_minutes} minutes</p><p className="mt-3 font-black">{Number(exp.price_per_person)>0?`$${Number(exp.price_per_person).toFixed(2)}/person`:"Free"}</p></div></Link>)}</div></div>:null}
 </div></section>;
}
