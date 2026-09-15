import Link from "next/link";
import { notFound } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { findCreatorByKey } from "@/lib/creator-partners/program";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CreatorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = await findCreatorByKey(slug);
  if (!creator) notFound();
  const { data: outings } = await supabaseAdmin.from("creator_partner_outings").select("id,title,subtitle,search_query,image_url,published_at").eq("creator_source_id", creator.id).eq("status", "published").order("sort_order", { ascending: true }).order("published_at", { ascending: false }).limit(30);
  const referralHref = `/r/${encodeURIComponent(creator.slug || creator.creator_key)}`;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="px-5 pb-20 pt-32 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.22),transparent_35%),#0a0808] p-7 sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#ff7a90]">TheOutHaven Creator Partner</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">{creator.display_name}</h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-white/55">Local picks and complete outing ideas curated for TheOutHaven.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/explore" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">Browse Discover</Link><Link href={referralHref} className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black">Own a business? Join TheOutHaven</Link></div>
          </div>

          <section className="mt-12">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff7a90]">Creator Picks</p>
            <h2 className="mt-2 text-3xl font-black">Outings by {creator.display_name}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(outings || []).map((outing: any) => <Link key={outing.id} href={`/create?q=${encodeURIComponent(outing.search_query || outing.title)}`} className="group relative min-h-[230px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-rose-950 via-black to-black p-5 transition hover:-translate-y-1 hover:border-white/20">
                {outing.image_url ? <><div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${outing.image_url})` }} /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" /></> : null}
                <div className="relative z-10 flex h-full min-h-[190px] flex-col justify-between"><span className="w-fit rounded-full bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] backdrop-blur">Curated by {creator.display_name}</span><div><h3 className="text-2xl font-black">{outing.title}</h3>{outing.subtitle ? <p className="mt-2 text-sm font-semibold leading-6 text-white/65">{outing.subtitle}</p> : null}<p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[#ff8a9b]">Plan this outing →</p></div></div>
              </Link>)}
              {!(outings || []).length ? <div className="rounded-[1.75rem] border border-dashed border-white/15 p-8 text-sm font-semibold text-white/40">Creator picks are coming soon.</div> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
