import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Params=Promise<Record<string,string|string[]|undefined>>;
function first(v:string|string[]|undefined){return Array.isArray(v)?v[0]:v;}

export default async function AdminExperiencesPage({searchParams}:{searchParams:Params}){
  await requireAdminRole(ADMIN_PAGE_ACCESS.events);
  const params=await searchParams;
  const q=(first(params.q)||"").replace(/[%,]/g," ").trim();
  const status=first(params.status)||"";
  let query=supabaseAdmin.from("experiences").select("id,title,category,status,searchable,organization_id,location_id,city,state,duration_minutes,min_party_size,max_party_size,price_per_person,created_at",{count:"exact"}).order("created_at",{ascending:false}).limit(100);
  if(q) query=query.ilike("title",`%${q}%`);
  if(["draft","published","paused","archived"].includes(status)) query=query.eq("status",status);
  const [{data,error,count},{count:published},{count:bookings}]=await Promise.all([
    query,
    supabaseAdmin.from("experiences").select("id",{count:"exact",head:true}).eq("status","published").eq("searchable",true),
    supabaseAdmin.from("experience_bookings").select("id",{count:"exact",head:true}),
  ]);
  if(error) throw error;
  return <main className="min-h-screen bg-[#050607] p-6 text-white"><div className="mx-auto max-w-[1600px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Marketplace</p><h1 className="mt-2 text-3xl font-black">Experiences</h1><p className="mt-1 text-sm text-white/45">Platform oversight for location and organizer-created bookable experiences.</p></div><Link href="/experiences" className="rounded-xl border border-white/10 px-4 py-3 text-sm font-black">View Public Experiences</Link></div>
    <div className="mt-6 grid gap-3 md:grid-cols-3"><Metric label="Experiences" value={count||0}/><Metric label="Published" value={published||0}/><Metric label="Bookings" value={bookings||0}/></div>
    <form className="mt-5 flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Search experiences" className="min-w-64 flex-1 rounded-xl border border-white/10 bg-black/30 p-3"/><select name="status" defaultValue={status} className="rounded-xl border border-white/10 bg-black/30 p-3"><option value="">All statuses</option><option>draft</option><option>published</option><option>paused</option><option>archived</option></select><button className="rounded-xl bg-[#e1062a] px-5 py-3 font-black">Filter</button></form>
    <div className="mt-5 grid gap-3">{(data||[]).map(row=><article key={row.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-[#ff5570]">{row.category||"Experience"}</p><h2 className="mt-1 font-black">{row.title}</h2><p className="mt-1 text-xs text-white/40">{row.status} · {row.location_id?"Location":"Organizer"} · {row.city||"—"}{row.state?`, ${row.state}`:""}</p></div><Link href={`/experiences/${row.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black">Public page</Link></div></article>)}</div>
  </div></main>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-xs text-white/40">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>}
