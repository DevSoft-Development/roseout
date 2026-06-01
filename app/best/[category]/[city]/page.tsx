import type { Metadata } from "next";
import Link from "next/link";
import { getLocationImage, hasLocationImage } from "@/lib/locationImage";
import { loadSeoLocations, locationCardName, locationHref, titleCaseSlug } from "@/lib/seo/location-pages";

export const dynamic = "force-dynamic";

type Params = Promise<{ category: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category, city } = await params;
  const categoryLabel = titleCaseSlug(category);
  const cityLabel = titleCaseSlug(city);
  return {
    title: `Best ${categoryLabel} in ${cityLabel} | TheOutHaven`,
    description: `Explore highly matched ${categoryLabel.toLowerCase()} in ${cityLabel} with TheOutHaven recommendations, reservations, and outing ideas.`,
    openGraph: { title: `Best ${categoryLabel} in ${cityLabel}`, description: `Curated ${categoryLabel.toLowerCase()} around ${cityLabel}.` },
  };
}

export default async function BestCategoryCityPage({ params }: { params: Params }) {
  const { category, city } = await params;
  const categoryLabel = titleCaseSlug(category);
  const cityLabel = titleCaseSlug(city);
  const locations = (await loadSeoLocations({ city, category })).filter(hasLocationImage);
  const schema = { "@context": "https://schema.org", "@type": "ItemList", name: `Best ${categoryLabel} in ${cityLabel}`, itemListElement: locations.map((location, index) => ({ "@type": "ListItem", position: index + 1, name: locationCardName(location), url: locationHref(location) })) };

  return <SeoCollection title={`Best ${categoryLabel} in ${cityLabel}`} subtitle="Search-aware recommendations that preserve relevance before visibility boosts." locations={locations} schema={schema} />;
}

function SeoCollection({ title, subtitle, locations, schema }: { title: string; subtitle: string; locations: any[]; schema: any }) {
  return (
    <main className="min-h-screen bg-[#fff8f3] text-[#1b1210]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <Link href="/create" className="text-sm font-black text-rose-700">← AI search</Link>
        <h1 className="mt-5 text-5xl font-black tracking-[-0.055em] sm:text-7xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-black/55">{subtitle}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => {
            const image = getLocationImage(location);
            if (!image) return null;

            return (
              <Link key={location.id} href={locationHref(location)} className="rounded-[2rem] bg-white p-4 shadow-sm">
                <img src={image} alt={locationCardName(location)} className="h-44 w-full rounded-[1.5rem] object-cover" />
                <h2 className="mt-4 text-xl font-black">{locationCardName(location)}</h2>
                <p className="mt-1 text-sm font-bold text-black/45">{[location.city, location.state].filter(Boolean).join(", ")}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
