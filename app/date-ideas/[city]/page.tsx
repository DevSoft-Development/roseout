import type { Metadata } from "next";
import Link from "next/link";
import { loadSeoLocations, locationCardName, locationHref, titleCaseSlug } from "@/lib/seo/location-pages";

export const dynamic = "force-dynamic";

type Params = Promise<{ city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city } = await params;
  return {
    title: `Date Ideas in ${titleCaseSlug(city)} | TheOutHaven`,
    description: `Romantic restaurants, activities, lounges, and AI-planned date ideas in ${titleCaseSlug(city)}.`,
  };
}

export default async function DateIdeasPage({ params }: { params: Params }) {
  const { city } = await params;
  const cityLabel = titleCaseSlug(city);
  const locations = await loadSeoLocations({ city, category: "date night" });
  const schema = { "@context": "https://schema.org", "@type": "ItemList", name: `Date ideas in ${cityLabel}`, itemListElement: locations.map((location, index) => ({ "@type": "ListItem", position: index + 1, name: locationCardName(location), url: locationHref(location) })) };
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <Link href="/create" className="text-sm font-black text-rose-200">← Plan with AI</Link>
        <h1 className="mt-5 text-5xl font-black tracking-[-0.055em] sm:text-7xl">Date ideas in {cityLabel}</h1>
        <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-white/55">Use live TheOutHaven locations to plan dinner, activities, lounges, and reroutes when a spot is unavailable.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{locations.map((location) => <Link key={location.id} href={locationHref(location)} className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">{locationCardName(location)}</h2><p className="mt-2 text-sm font-bold text-white/45">{[location.city, location.state].filter(Boolean).join(", ")}</p></Link>)}</div>
      </section>
    </main>
  );
}
