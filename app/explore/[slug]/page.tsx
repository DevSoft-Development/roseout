import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { getCuisine, getPrimaryCategory } from "@/lib/locationFields";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildMetadata, localSeoDescription } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 600;

const LANDING_PAGES = {
  queens: { label: "Queens", type: "area", column: "borough", terms: ["Queens"] },
  brooklyn: { label: "Brooklyn", type: "area", column: "borough", terms: ["Brooklyn"] },
  manhattan: { label: "Manhattan", type: "area", column: "borough", terms: ["Manhattan"] },
  bronx: { label: "Bronx", type: "area", column: "borough", terms: ["Bronx"] },
  "staten-island": { label: "Staten Island", type: "area", column: "borough", terms: ["Staten Island"] },
  "long-island": { label: "Long Island", type: "area", column: "region", terms: ["Long Island", "Nassau", "Suffolk"] },
  "steak-restaurants": { label: "Steak Restaurants", type: "category", terms: ["steak", "steakhouse"] },
  "brunch-spots": { label: "Brunch Spots", type: "category", terms: ["brunch", "breakfast"] },
  "hookah-lounges": { label: "Hookah Lounges", type: "category", terms: ["hookah", "lounge"] },
  "rooftop-restaurants": { label: "Rooftop Restaurants", type: "category", terms: ["rooftop", "roof top", "views"] },
  "date-night": { label: "Date Night Ideas", type: "category", terms: ["date night", "romantic", "cocktail"] },
} as const;

const relatedLinks = Object.entries(LANDING_PAGES).map(([slug, page]) => ({ slug, label: page.label }));

type LandingSlug = keyof typeof LANDING_PAGES;
type LandingLocation = Record<string, any> & { id: string };

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = LANDING_PAGES[slug as LandingSlug];
  if (!page) return buildMetadata({ title: "Explore", path: `/explore/${slug}`, noIndex: true });

  return buildMetadata({
    title: `${page.label} on TheOutHaven`,
    description: localSeoDescription({
      area: page.type === "area" ? page.label : undefined,
      category: page.type === "category" ? page.label.toLowerCase() : undefined,
    }),
    path: `/explore/${slug}`,
  });
}

export default async function ExploreLandingPage({ params }: Props) {
  const { slug } = await params;
  const page = LANDING_PAGES[slug as LandingSlug];
  if (!page) notFound();

  const locations = await loadLandingLocations(page);
  const related = relatedLinks.filter((link) => link.slug !== slug).slice(0, 7);

  return (
    <main className="min-h-screen bg-[#070303] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-5 pb-16 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.24),transparent_34%),linear-gradient(150deg,#080303_0%,#160807_52%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-10">
          <nav className="flex flex-wrap gap-2 text-sm font-bold text-white/60" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white">Home</Link>
            <span>/</span>
            <Link href="/explore" className="hover:text-white">Explore</Link>
            <span>/</span>
            <span className="text-white">{page.label}</span>
          </nav>

          <header className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">Local SEO Guide</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">{page.label} on TheOutHaven</h1>
            <p className="mt-5 text-lg leading-8 text-white/72">
              {localSeoDescription({
                area: page.type === "area" ? page.label : undefined,
                category: page.type === "category" ? page.label.toLowerCase() : "restaurants, activities, and outing ideas",
                count: locations.length,
              })}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
              These results come from searchable public TheOutHaven location data. Use this page to compare neighborhoods,
              cuisines, categories, and outing-friendly places, then open a location profile for public contact details and planning links.
            </p>
          </header>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Searchable places</h2>
                <p className="mt-1 text-sm text-white/55">Public, clean listings only. Hidden and private locations are excluded.</p>
              </div>
              <Link href="/explore" className="hidden rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white/75 hover:bg-white hover:text-black sm:inline-flex">All Explore</Link>
            </div>

            {locations.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {locations.map((location) => <LocationCard key={location.id} location={location} />)}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
                <h2 className="text-2xl font-black">No public listings yet</h2>
                <p className="mt-2 text-white/65">TheOutHaven will show locations here once searchable public data is available for this topic.</p>
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">Related areas and categories</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {related.map((link) => (
                <Link key={link.slug} href={`/explore/${link.slug}`} className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm font-black text-white/75 hover:bg-white hover:text-black">
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

async function loadLandingLocations(page: (typeof LANDING_PAGES)[LandingSlug]) {
  let query = supabaseAdmin
    .from("locations")
    .select(
      "id,source_table,source_id,location_type,name,restaurant_name,activity_name,main_image,image_url,images,city,borough,neighborhood,state,primary_category,primary_tag,cuisine,cuisine_type,food_type,activity_type,tags,vibe_tags,best_for_tags,google_types,atmosphere,best_for,date_style_tags,search_keywords,search_document,description,rating,review_count,theouthaven_score,popularity_score,is_featured,is_searchable,is_hidden,data_status,status,quality_status,duplicate_status,has_photos,photo_status,is_low_level,public_visibility_tier,curation_tier,source_quality_status,import_confidence"
    )
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("address", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("primary_category", "is", null)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .not("source_quality_status", "in", '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")')
    .not("import_confidence", "eq", "low")
    .not("status", "in", '("closed","archived")')
    .limit(18);

  if (page.type === "area" && page.column === "borough") {
    query = query.ilike("borough", page.terms[0]);
  }

  const { data } = await query;
  const rows = ((data || []) as LandingLocation[]).filter((location) => matchesLanding(location, page));
  return rows.slice(0, 12);
}

function matchesLanding(location: LandingLocation, page: (typeof LANDING_PAGES)[LandingSlug]) {
  const text = [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.city,
    location.borough,
    location.neighborhood,
    location.primary_category,
    location.primary_tag,
    location.cuisine,
    location.cuisine_type,
    location.food_type,
    location.activity_type,
    location.search_document,
    location.description,
    ...(Array.isArray(location.tags) ? location.tags : []),
    ...(Array.isArray(location.vibe_tags) ? location.vibe_tags : []),
    ...(Array.isArray(location.best_for_tags) ? location.best_for_tags : []),
    ...(Array.isArray(location.google_types) ? location.google_types : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (page.type === "area") return page.terms.some((term) => text.includes(term.toLowerCase()));
  return page.terms.some((term) => text.includes(term.toLowerCase()));
}

function LocationCard({ location }: { location: LandingLocation }) {
  const name = getLocationName(location as any, "TheOutHaven location");
  const image = getLocationImage(location as any);
  const category = getPrimaryCategory(location as any) || getCuisine(location as any) || "Outing spot";
  const area = [location.neighborhood, location.borough || location.city].filter(Boolean).join(", ");

  return (
    <Link href={getLocationDetailHref({ id: location.id, type: location.location_type || location.type || location.source_table })} className="group overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] transition hover:-translate-y-1 hover:border-red-400/40">
      <div className="relative h-52 bg-white/[0.04]">
        {image ? <Image src={image} alt={`${name} ${category} in ${area || "TheOutHaven"}`} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-500 group-hover:scale-105" /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
      </div>
      <div className="p-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">{category}</p>
        <h3 className="mt-2 text-xl font-black">{name}</h3>
        {area && <p className="mt-2 text-sm text-white/60">{area}</p>}
      </div>
    </Link>
  );
}
