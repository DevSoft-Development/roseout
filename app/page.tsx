import type { Metadata } from "next";
import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getPrimaryCategory, getCuisine } from "@/lib/locationFields";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "TheOutHaven | Plan Better OUTings",
  description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
  alternates: { canonical: "https://www.theouthaven.com" },
  openGraph: {
    title: "TheOutHaven | Plan Better OUTings",
    description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
    url: "https://www.theouthaven.com",
    siteName: "TheOutHaven",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TheOutHaven | Plan Better OUTings",
    description: "Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.",
  },
};

type HomeLocation = {
  id: string;
  type: string | null;
  source_table: string | null;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  business_name: string | null;
  main_image: string | null;
  image_url: string | null;
  images: string[] | null;
  city: string | null;
  neighborhood: string | null;
  category: string | null;
  primary_category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  activity_type: string | null;
  tags: string[] | null;
  vibes: string[] | null;
  website: string | null;
  reservation_url: string | null;
  external_reservation_url: string | null;
  rating: number | null;
  score: number | null;
  total_reviews: number | null;
  views_count: number | null;
  saves_count: number | null;
  reservation_count: number | null;
  featured: boolean | null;
  price_level: number | null;
};

type HomeExperience = {
  key: string;
  title: string;
  subtitle: string;
  tags: string[];
  cta: string;
  planPrompt?: string;
  locations: HomeLocation[];
};

type HomeSections = Awaited<ReturnType<typeof loadHomepageSections>>;

export default async function HomePage() {
  const sections = await loadHomepageSections();

  return (
    <main className="min-h-screen bg-[#070303] text-white">
      <RecoveryRedirect />
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-9">
          <div className="space-y-5">
            <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">Plan better OUTings.</h1>
            <p className="max-w-3xl text-lg text-white/70">Discover restaurants, nightlife, experiences, and curated outing ideas personalized around your vibe, budget, and location.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/create" className="rounded-full bg-[#e1062a] px-7 py-3 text-sm font-black hover:bg-red-500">Create an Outing</Link>
              <Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-7 py-3 text-sm font-black">Explore Places</Link>
            </div>
          </div>

          <FeaturedExperienceGrid sections={sections} />

          <div className="space-y-6">
            <CarouselSection
              title="Recommended This Week"
              subtitle="A curated mix of restaurants, lounges, and experiences worth planning around."
              locations={sections.recommendedThisWeek}
            />
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,.26),transparent_38%),#120907] p-8"><h2 className="text-3xl font-black">Let AI plan your next outing.</h2><p className="mt-3 max-w-3xl text-white/70">Tell TheOutHaven what kind of experience you want and get personalized restaurant and activity recommendations.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Start Planning</Link><Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Explore Experiences</Link></div></div></section>

      <section className="px-5 py-10 sm:px-6"><div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl"><h2 className="text-2xl font-black">Own or manage a location?</h2><p className="mt-3 max-w-3xl text-white/70">Claim your business, manage visibility, and connect with customers planning nights out.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/location/apply" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Claim Your Business</Link><Link href="/business" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Learn More</Link></div></div></section>

    </main>
  );
}

async function loadHomepageSections() {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("*")
    .limit(500);

  let locations = ((data || []) as HomeLocation[]).filter((location) => Boolean(getLocationName(location, "")));
  if (!locations.length) {
    const [restaurantsRes, activitiesRes] = await Promise.all([
      supabaseAdmin
        .from("restaurants")
        .select("*")
        .limit(250),
      supabaseAdmin
        .from("activities")
        .select("*")
        .limit(250),
    ]);

    const restaurants = ((restaurantsRes.data || []) as Array<Partial<HomeLocation>>).map((location) => ({ ...location, activity_name: location.activity_name || null, activity_type: location.activity_type || null, type: location.type || "restaurants", source_table: "restaurants" })) as HomeLocation[];
    const activities = ((activitiesRes.data || []) as Array<Partial<HomeLocation>>).map((location) => ({ ...location, restaurant_name: location.restaurant_name || null, cuisine: location.cuisine || null, cuisine_type: location.cuisine_type || null, type: location.type || "activities", source_table: "activities" })) as HomeLocation[];
    locations = [...restaurants, ...activities];
  }

  const uniqueLocations = dedupeLocations(locations);
  const usedLocationIds = new Set<string>();

  const takeUnique = (items: HomeLocation[], limit = 4, registry: Set<string> = usedLocationIds) => {
    const selected: HomeLocation[] = [];
    for (const item of items) {
      if (!item.id || registry.has(item.id)) continue;
      registry.add(item.id);
      selected.push(item);
      if (selected.length >= limit) break;
    }
    return selected;
  };


  const featuredExperiences: HomeExperience[] = [
    {
      key: "date-night",
      title: "Date Night",
      subtitle: "Romantic Manhattan Spots",
      tags: ["Intimate", "Cocktails", "Late Night"],
      cta: "Plan OUTing",
      planPrompt: "Romantic Manhattan date night with intimate cocktails and late-night vibes",
      locations: takeUnique(
        matchingLocations(
          uniqueLocations,
          ["romantic", "date night", "date", "intimate", "cocktail", "lounge", "fine dining", "upscale"],
          { geo: ["manhattan", "new york"] }
        ),
        4,
        new Set<string>()
      ),
    },
    {
      key: "rooftops",
      title: "Rooftops",
      subtitle: "Best Rooftops in Brooklyn",
      tags: ["Skyline", "Golden Hour", "DJ Sets"],
      cta: "Plan OUTing",
      planPrompt: "Brooklyn rooftop outing with skyline views and DJ vibes",
      locations: takeUnique(
        matchingLocations(
          uniqueLocations,
          ["rooftop", "roof top", "skyline", "terrace", "views", "view", "dj", "lounge", "bar"],
          { geo: ["brooklyn"] }
        ),
        4,
        new Set<string>()
      ),
    },
    {
      key: "brunch",
      title: "Brunch or Dinner",
      subtitle: "Weekend Brunch Spots",
      tags: ["Day Party", "Bottomless", "Friends"],
      cta: "Plan OUTing",
      planPrompt: "Weekend brunch social outing with friends and lively energy",
      locations: takeUnique(
        matchingLocations(
          uniqueLocations,
          ["brunch", "bottomless", "breakfast", "day party", "daytime", "weekend brunch"],
          { restaurantOnly: true }
        ),
        4,
        new Set<string>()
      ),
    },
    {
      key: "group-outings",
      title: "Group Outings",
      subtitle: "Group-Friendly Lounges",
      tags: ["Large Parties", "Birthdays", "Celebrations"],
      cta: "Plan OUTing",
      planPrompt: "Group-friendly outing for birthdays and celebrations",
      locations: takeUnique(
        matchingLocations(
          uniqueLocations,
          ["group", "party", "birthday", "celebration", "private", "lounge", "vr", "arcade", "bowling", "karaoke"]
        ),
        4,
        new Set<string>()
      ),
    },
  ];

  const featuredIds = new Set<string>(
    featuredExperiences
      .flatMap((experience) => experience.locations.map((location) => location.id))
      .filter((id): id is string => Boolean(id))
  );

  return {
    recommendedThisWeek: takeUnique(rankByTrending(uniqueLocations), 4, featuredIds),
    experiences: featuredExperiences,
  };
}

function FeaturedExperienceGrid({ sections }: { sections: HomeSections }) {
  const filled = sections.experiences.filter((experience: HomeExperience) => experience.locations[0]);
  if (!filled.length) return <PolishedEmptyState />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {filled.map((experience, index) => {
        const primary = experience.locations[0];
        if (!primary) return null;
        const name = getLocationName(primary);
        const neighborhood = primary.neighborhood || primary.city || "NYC";
        return (
          <article
            key={experience.key}
            className="group relative min-h-[360px] overflow-hidden rounded-[1.8rem] border border-white/10"
          >
            <img src={getLocationImage(primary)} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.15)_0%,rgba(7,3,3,0.75)_58%,rgba(7,3,3,0.96)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.35),transparent_45%)]" />
            <div className="relative flex h-full flex-col justify-end p-5 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.26em] text-white/70">{experience.title}</p>
              <h3 className="mt-2 text-2xl font-black sm:text-3xl">{experience.subtitle}</h3>
              <p className="mt-2 text-sm text-white/75">Featuring {name} · {neighborhood}</p>
              <div className="mt-4 flex flex-wrap gap-2">{experience.tags.map((tag) => <span key={tag} className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-black">{tag}</span>)}</div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="line-clamp-1 text-xs text-white/70">{experience.locations.slice(1, 4).map((l) => getLocationName(l)).join(" · ") || "Curated by TheOutHaven"}</p>
                <Link href={`/create?prompt=${encodeURIComponent(experience.planPrompt || `${experience.title} outing`)}`} className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black whitespace-nowrap">{experience.cta}</Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CarouselSection({ title, subtitle, locations }: { title: string; subtitle: string; locations: HomeLocation[] }) {
  if (!locations.length) return null;
  const visibleLocations = locations.slice(0, 4);
  return <section><div className="mb-4"><h2 className="text-3xl font-black">{title}</h2><p className="mt-1 text-sm text-white/65">{subtitle}</p></div><div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{visibleLocations.map((location) => <PlaceCard key={`${title}-${location.id}`} location={location} />)}</div></section>;
}

function PlaceCard({ location }: { location: HomeLocation }) {
  const name = getLocationName(location);
  const neighborhood = location.neighborhood || location.city || "New York";
  const numericRating = location.rating || location.score || null;
  const rating = numericRating ? numericRating.toFixed(1) : null;
  const tags = getCardChips(location);
  const category = getPrimaryCategory(location);
  const cuisineOrActivity = getCuisine(location) || location.activity_type || null;
  const reserveHref = location.external_reservation_url || location.reservation_url || location.website || null;

  return (
    <article className="group flex h-full min-h-[340px] min-w-[285px] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-3 shadow-2xl shadow-black/30 sm:min-w-[320px]">
      <div className="relative h-44 w-full overflow-hidden rounded-2xl">
        <img src={getLocationImage(location)} alt={name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="space-y-1">
        <h4 className="line-clamp-2 min-h-[3.5rem] text-lg font-black">{name}</h4>
        <p className="line-clamp-1 text-sm text-white/65">{category} · {neighborhood}</p>
        <p className="line-clamp-1 text-xs text-white/60">{[cuisineOrActivity, rating ? `${rating} ★` : null].filter(Boolean).join(" · ") || "Freshly added on TheOutHaven"}</p>
        </div>
      <div className="mt-2 min-h-[3rem]">
        {tags.length ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-black text-white/80">{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-4">
        <Link href={getLocationDetailHref({ id: location.id, type: location.type })} className="inline-block rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black">View Experience</Link>
        {reserveHref ? <a href={reserveHref} target="_blank" rel="noreferrer" className="inline-block rounded-full border border-white/20 bg-white/[0.05] px-4 py-2 text-xs font-black">Reserve / Visit</a> : null}
      </div>
      </div>
    </article>
  );
}

function normalizeLabel(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => normalizeLabel(item)).filter(Boolean).join(", ");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || ["[]", "{}", "null", "undefined"].includes(trimmed)) return "";
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try { return normalizeLabel(JSON.parse(trimmed)); } catch {}
    }
    const cleaned = trimmed.replace(/^"|"$/g, "");
    const labelMap: Record<string, string> = { "theouthaven-friendly outing": "TheOutHaven Pick", "date-night": "Date Night", "group-outing": "Group Outing", "group-outings": "Group Outing" };
    const lower = cleaned.toLowerCase();
    if (labelMap[lower]) return labelMap[lower];
    return cleaned.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return String(value).trim();
}

function normalizeLabels(values: unknown, limit = 3): string[] {
  const rawValues = Array.isArray(values) ? values : [values];
  return rawValues.flatMap((value) => normalizeLabel(value).split(",").map((part) => part.trim()).filter(Boolean))
    .filter((label) => !["[]", "{}", "null", "undefined"].includes(label.toLowerCase()))
    .filter((label, index, arr) => arr.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index)
    .slice(0, limit);
}

function getCardChips(location: HomeLocation): string[] {
  return normalizeLabels([
    location.primary_category,
    location.category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
    ...(Array.isArray(location.vibes) ? location.vibes : normalizeLabels(location.vibes, 3)),
    ...(Array.isArray(location.tags) ? location.tags : normalizeLabels(location.tags, 3)),
  ], 3);
}

function rankByTrending(locations: HomeLocation[]) {
  return [...locations].sort((a, b) => score(b) - score(a));
}

function byKeywords(locations: HomeLocation[], keywords: string[]) {
  return [...locations]
    .filter((location) => keywords.some((keyword) => searchableText(location).includes(keyword)))
    .sort((a, b) => score(b) - score(a));
}

function searchableText(location: HomeLocation) {
  return [
    location.source_table,
    location.type,
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.business_name,
    location.city,
    location.neighborhood,
    location.category,
    location.primary_category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
    ...(location.tags || []),
    ...(location.vibes || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(location: HomeLocation, keywords: string[]) {
  const hay = searchableText(location);
  return keywords.some((keyword) => hay.includes(keyword.toLowerCase()));
}

function inGeo(location: HomeLocation, keywords: string[]) {
  const hay = `${location.city || ""} ${location.neighborhood || ""}`.toLowerCase();
  return keywords.some((keyword) => hay.includes(keyword.toLowerCase()));
}

function matchingLocations(
  locations: HomeLocation[],
  keywords: string[],
  options?: {
    geo?: string[];
    restaurantOnly?: boolean;
    activityOnly?: boolean;
  }
) {
  return locations
    .filter((location) => {
      if (options?.restaurantOnly && !isRestaurant(location)) return false;
      if (options?.activityOnly && isRestaurant(location)) return false;
      if (options?.geo?.length && !inGeo(location, options.geo)) return false;
      return hasAny(location, keywords);
    })
    .sort((a, b) => score(b) - score(a));
}

function score(location: HomeLocation) {
  return (location.rating || location.score || 0) * 35 + (location.total_reviews || 0) * 1.5 + (location.views_count || 0) * 0.05 + (location.saves_count || 0) * 0.7 + (location.reservation_count || 0) * 1.2 + (location.featured ? 30 : 0);
}

function isRestaurant(location: HomeLocation) {
  const hay = searchableText(location);
  return hay.includes("restaurant") || Boolean(location.restaurant_name) || String(location.source_table || "").toLowerCase() === "restaurants";
}


function dedupeLocations(locations: HomeLocation[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    if (!location.id || seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}

function PolishedEmptyState() {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-white/20 bg-white/[0.03] p-8 text-center">
      <h3 className="text-2xl font-black">Your city feed is warming up.</h3>
      <p className="mt-3 text-sm text-white/70">We don&apos;t have location records to feature yet. Import places or sync from Google Places, then return here for live trending restaurants and activities.</p>
      <div className="mt-5 flex justify-center gap-3">
        <Link href="/create" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black">Plan My Outing</Link>
        <Link href="/explore" className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black">Explore</Link>
      </div>
    </div>
  );
}
