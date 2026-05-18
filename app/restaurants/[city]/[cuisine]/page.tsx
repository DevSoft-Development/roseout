import type { Metadata } from "next";
import Link from "next/link";
import { loadSeoLocations, locationCardName, locationHref, titleCaseSlug } from "@/lib/seo/location-pages";

export const dynamic = "force-dynamic";

type Params = Promise<{ city: string; cuisine: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city, cuisine } = await params;
  return {
    title: `${titleCaseSlug(cuisine)} Restaurants in ${titleCaseSlug(city)} | TheOutHaven`,
    description: `Find ${titleCaseSlug(cuisine).toLowerCase()} restaurants in ${titleCaseSlug(city)} for dates, groups, nightlife, and reservations.`,
  };
}

export default async function RestaurantsCuisinePage({ params }: { params: Params }) {
  const { city, cuisine } = await params;
  const cityLabel = titleCaseSlug(city);
  const cuisineLabel = titleCaseSlug(cuisine);
  const locations = await loadSeoLocations({ city, cuisine });
  const schema = { "@context": "https://schema.org", "@type": "ItemList", name: `${cuisineLabel} restaurants in ${cityLabel}`, itemListElement: locations.map((location, index) => ({ "@type": "ListItem", position: index + 1, name: locationCardName(location), url: locationHref(location) })) };
  return (
    <main className="min-h-screen bg-[#fff8f3] text-[#1b1210]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <Link href="/create" className="text-sm font-black text-rose-700">← Search restaurants</Link>
        <h1 className="mt-5 text-5xl font-black tracking-[-0.055em] sm:text-7xl">{cuisineLabel} restaurants in {cityLabel}</h1>
        <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-black/55">Dynamic restaurant pages built from live location data, metadata, OpenGraph defaults, and schema markup.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{locations.map((location) => <Link key={location.id} href={locationHref(location)} className="rounded-[2rem] bg-white p-4 shadow-sm"><h2 className="text-xl font-black">{locationCardName(location)}</h2><p className="mt-2 text-sm font-bold text-black/45">{location.cuisine || location.cuisine_type || cuisineLabel} • {[location.city, location.state].filter(Boolean).join(", ")}</p></Link>)}</div>
      </section>
    </main>
  );
}
