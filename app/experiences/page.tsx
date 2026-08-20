import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function ExperiencesPage() {
  const { data, error } = await supabaseAdmin
    .from("experiences")
    .select("id,title,description,category,image_url,venue_name,city,state,duration_minutes,min_party_size,max_party_size,price_per_person,currency")
    .eq("status", "published")
    .eq("searchable", true)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  const rows = data || [];
  return <main className="min-h-screen bg-[#050607] px-4 py-24 text-white">
    <div className="mx-auto max-w-7xl">
      <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff5570]">TheOutHaven Experiences</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-black sm:text-5xl">Book something worth remembering.</h1><p className="mt-3 max-w-2xl text-white/55">Classes, tastings, tours, creative sessions, and bookable outings from locations and organizers.</p></div></div>
      {rows.length ? <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <Link key={row.id} href={`/experiences/${row.id}`} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.04] transition hover:border-[#ff2142]/40 hover:bg-white/[.06]">
        {row.image_url ? <div className="h-52 bg-cover bg-center" style={{ backgroundImage: `url(${row.image_url})` }} /> : <div className="grid h-52 place-items-center bg-white/[.03] text-white/25">Experience</div>}
        <div className="p-5"><p className="text-xs font-black uppercase tracking-[.15em] text-[#ff5570]">{row.category || "Experience"}</p><h2 className="mt-2 text-xl font-black">{row.title}</h2><p className="mt-2 line-clamp-2 text-sm text-white/50">{row.description || "Book a memorable experience."}</p><div className="mt-4 flex items-center justify-between text-sm"><span>{row.city}{row.state ? `, ${row.state}` : ""}</span><b>{Number(row.price_per_person) > 0 ? `$${Number(row.price_per_person).toFixed(2)}/person` : "Free"}</b></div><p className="mt-2 text-xs text-white/35">{row.duration_minutes} min · {row.min_party_size}–{row.max_party_size} guests</p></div>
      </Link>)}</div> : <div className="mt-10 rounded-3xl border border-white/10 bg-white/[.03] p-10 text-center text-white/45">Published experiences will appear here.</div>}
    </div>
  </main>;
}
