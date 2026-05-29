import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getPrimaryCategory, getCuisine } from "@/lib/locationFields";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: "Plan Better Outings",
  description:
    "TheOutHaven helps people discover restaurants, activities, and curated outing ideas across New York City and Long Island.",
  path: "/",
});

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
  borough: string | null;
  neighborhood: string | null;
  category: string | null;
  primary_category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  activity_type: string | null;
  tags: string[] | string | null;
  vibes: string[] | string | null;
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
};

type HomepageSections = {
  featuredLocations: HomeLocation[];
};

const occasionCards = [
  {
    title: "Date Night",
    description: "Dinner, a little atmosphere, and something fun after.",
    prompt: "romantic dinner and something fun after",
  },
  {
    title: "Birthday Dinner",
    description: "A celebration-worthy meal with room for the next stop.",
    prompt: "birthday dinner with a lounge or activity",
  },
  {
    title: "Girls’ Night",
    description: "Social dinner, drinks, and a place with the right energy.",
    prompt: "girls night dinner and drinks",
  },
  {
    title: "Brunch Plans",
    description: "A daytime meal paired with something easy and fun.",
    prompt: "brunch and a fun daytime activity",
  },
  {
    title: "Rooftop Night",
    description: "Dinner or drinks with views and a premium feel.",
    prompt: "rooftop dinner or drinks with a view",
  },
  {
    title: "Dinner + Hookah",
    description: "Start with food, then keep the night relaxed nearby.",
    prompt: "steak dinner and hookah lounge nearby",
  },
  {
    title: "After Work Drinks",
    description: "A polished reset with cocktails and light bites.",
    prompt: "after work drinks and light bites",
  },
  {
    title: "Chill Weekend",
    description: "Casual food and a low-pressure plan for the weekend.",
    prompt: "casual dinner and relaxed activity",
  },
];

const searchExamples = [
  "steak dinner and hookah in Queens",
  "romantic rooftop dinner in Manhattan",
  "birthday dinner with activities",
  "brunch and something fun in Brooklyn",
];

const planningSteps = [
  {
    title: "Tell us the kind of outing",
    copy: "Search by food, vibe, area, occasion, or what you want to do after.",
  },
  {
    title: "Get matched places",
    copy: "TheOutHaven helps pair restaurants, activities, lounges, and experiences that fit the plan.",
  },
  {
    title: "Save, call, book, or share",
    copy: "Keep your plan moving with clear next steps instead of jumping between tabs.",
  },
];

export default async function HomePage() {
  const sections = await loadHomepageSections();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070303] text-white">
      <RecoveryRedirect />

      <section className="relative overflow-hidden px-5 pb-14 pt-32 sm:px-6 lg:pt-40">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(225,6,42,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_50%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-10">
          <Hero />
          <HomeSearchPrompt />
          <PlanByOccasion />
          <FeaturedPlaces locations={sections.featuredLocations} />
          <PopularAreas />
          <HowTheOutHavenHelps />
          <AiPlanningCta />
          <BusinessCta />
        </div>
      </section>
    </main>
  );
}

function Hero() {
  return (
    <section className="space-y-5">
      <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">
        Plan better OUTings.
      </h1>
      <p className="max-w-3xl text-lg text-white/70">
        Find restaurants, activities, and full night-out ideas that match your
        vibe, area, and occasion.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/create"
          className="rounded-full bg-[#e1062a] px-7 py-3 text-center text-sm font-black hover:bg-red-500"
        >
          Start Planning
        </Link>
        <Link
          href="/explore"
          className="rounded-full border border-white/15 bg-white/[0.04] px-7 py-3 text-center text-sm font-black"
        >
          Explore Places
        </Link>
      </div>
    </section>
  );
}

function HomeSearchPrompt() {
  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/25 sm:p-8">
      <h2 className="text-2xl font-black sm:text-3xl">
        What kind of outing are you planning?
      </h2>
      <p className="mt-2 max-w-3xl text-white/70">
        Search by food, vibe, area, occasion, or what you want to do next.
      </p>
      <form action="/create" method="get" className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          name="prompt"
          placeholder="Try: steak dinner and hookah in Queens"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-5 py-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-[#e1062a]"
        />
        <button
          type="submit"
          className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black hover:bg-red-500"
        >
          Search
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {searchExamples.map((example) => (
          <Link
            key={example}
            href={createPromptHref(example)}
            className="rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-black text-white/80 transition hover:border-white/25 hover:bg-white/[0.08]"
          >
            {example}
          </Link>
        ))}
      </div>
    </section>
  );
}

function PlanByOccasion() {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-3xl font-black">Plan by Occasion</h2>
        <p className="mt-1 text-sm text-white/65">
          Start with the moment, and TheOutHaven will help shape the full plan.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {occasionCards.map((card) => (
          <Link
            key={card.title}
            href={occasionHref(card.title, card.prompt)}
            className="group flex min-h-[178px] flex-col rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            <h3 className="text-lg font-black">{card.title}</h3>
            <p className="mt-2 text-sm text-white/70">{card.description}</p>
            <p className="mt-auto pt-4 text-xs font-black uppercase tracking-[0.16em] text-white/75 group-hover:text-white">
              Use this prompt
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FeaturedPlaces({ locations }: { locations: HomeLocation[] }) {
  if (!locations.length) return null;

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-3xl font-black">Featured places to start with</h2>
        <p className="mt-1 max-w-3xl text-sm text-white/65">
          A few restaurants, activities, and outing-friendly spots to inspire
          your next plan.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {locations.slice(0, 4).map((location) => (
          <PlaceCard key={location.id} location={location} />
        ))}
      </div>
    </section>
  );
}

function PopularAreas() {
  const areas = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Long Island"];

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-3xl font-black">Popular Areas</h2>
        <p className="mt-1 text-sm text-white/65">
          Browse outing ideas around the areas people search most.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {areas.map((area) => (
          <Link
            key={area}
            href={areaHref(area)}
            className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/85 transition hover:border-white/25 hover:bg-white/[0.08]"
          >
            {area}
          </Link>
        ))}
      </div>
    </section>
  );
}

function HowTheOutHavenHelps() {
  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="mb-5">
        <h2 className="text-3xl font-black">How TheOutHaven helps you plan</h2>
        <p className="mt-1 max-w-3xl text-sm text-white/65">
          Designed for full outings, not just one reservation.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {planningSteps.map((step, index) => (
          <article
            key={step.title}
            className="flex min-h-[164px] flex-col rounded-[1.25rem] border border-white/10 bg-black/25 p-4"
          >
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
              Step {index + 1}
            </p>
            <h3 className="mt-3 text-lg font-black">{step.title}</h3>
            <p className="mt-2 text-sm text-white/70">{step.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AiPlanningCta() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,.26),transparent_38%),#120907] p-6 shadow-2xl shadow-black/25 sm:p-8">
      <h2 className="text-3xl font-black">Not sure where to start?</h2>
      <p className="mt-3 max-w-3xl text-white/70">
        Describe the night you want, and TheOutHaven will help turn it into a
        plan.
      </p>
      <div className="mt-5">
        <Link
          href="/create"
          className="inline-flex rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black hover:bg-red-500"
        >
          Plan My Outing
        </Link>
      </div>
    </section>
  );
}

function BusinessCta() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/25 sm:p-8">
      <h2 className="text-2xl font-black">Own or manage a location?</h2>
      <p className="mt-3 max-w-3xl text-white/70">
        Claim or verify your business so guests can discover your location,
        view details, and take the next step.
      </p>
      <div className="mt-5">
        <Link
          href="/business"
          className="inline-flex rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black hover:bg-red-500"
        >
          Claim or Verify Your Business
        </Link>
      </div>
    </section>
  );
}

async function loadHomepageSections(): Promise<HomepageSections> {
  const { data } = await supabaseAdmin
    .from("locations")
    .select(
      "id,type,source_table,name,restaurant_name,activity_name,business_name,main_image,image_url,images,city,borough,neighborhood,category,primary_category,cuisine,cuisine_type,activity_type,tags,vibes,website,reservation_url,external_reservation_url,rating,score,total_reviews,views_count,saves_count,reservation_count,featured,is_searchable,is_hidden,data_status",
    )
    .eq("is_searchable", true)
    .neq("is_hidden", true)
    .eq("data_status", "clean")
    .limit(500);

  const uniqueLocations = dedupeLocations(
    ((data || []) as HomeLocation[]).filter((location) =>
      Boolean(getLocationName(location, "").trim()),
    ),
  );

  return {
    featuredLocations: buildFeaturedLocations(uniqueLocations),
  };
}

function buildFeaturedLocations(locations: HomeLocation[]) {
  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 6));
  const ranked = [...locations].sort((a, b) => score(b) - score(a));
  const rotate = (items: HomeLocation[], offset: number) => {
    if (!items.length) return items;
    const pivot = (seed + offset) % items.length;
    return [...items.slice(pivot), ...items.slice(0, pivot)];
  };

  const restaurants = rotate(ranked.filter(isRestaurant), 1);
  const activities = rotate(ranked.filter((location) => !isRestaurant(location)), 3);
  const featured = rotate(ranked.filter((location) => location.featured), 5);
  const broadMatches = rotate(
    matchingLocations(ranked, [
      "restaurant",
      "activity",
      "lounge",
      "rooftop",
      "brunch",
      "date night",
      "experience",
      "cocktail",
      "hookah",
    ]),
    7,
  );

  return pickUnique([restaurants, activities, restaurants, activities, featured, broadMatches, ranked], 4);
}

function PlaceCard({ location }: { location: HomeLocation }) {
  const tags = getCardChips(location);
  const reserveHref = location.external_reservation_url || location.reservation_url || location.website || null;

  return (
    <article className="group flex h-full min-h-[352px] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-3 shadow-2xl shadow-black/30">
      <div className="relative h-44 w-full overflow-hidden rounded-2xl">
        <Image
          src={getLocationImage(location)}
          alt={getLocationName(location)}
          loading="lazy"
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <h4 className="line-clamp-2 min-h-[3.5rem] text-lg font-black">
          {getLocationName(location)}
        </h4>
        <p className="line-clamp-1 text-sm text-white/65">
          {getPrimaryCategory(location)} · {location.neighborhood || location.borough || location.city || "New York"}
        </p>
        <p className="line-clamp-1 text-xs text-white/60">
          {[getCuisine(location) || location.activity_type, ratingLabel(location)]
            .filter(Boolean)
            .join(" · ") || "Curated on TheOutHaven"}
        </p>
        <div className="mt-3 min-h-[3rem]">
          {tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-black text-white/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <Link
            href={getLocationDetailHref({ id: location.id, type: location.type || location.source_table })}
            className="inline-block rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black"
          >
            View Experience
          </Link>
          {reserveHref ? (
            <a
              href={reserveHref}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full border border-white/20 bg-white/[0.05] px-4 py-2 text-xs font-black"
            >
              Reserve / Visit
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function createPromptHref(prompt: string) {
  return `/create?prompt=${encodeURIComponent(prompt)}`;
}

function occasionHref(title: string, prompt: string) {
  const landingPages: Record<string, string> = {
    "Date Night": "/explore/date-night",
    "Brunch Plans": "/explore/brunch-spots",
    "Rooftop Night": "/explore/rooftop-restaurants",
    "Dinner + Hookah": "/explore/hookah-lounges",
  };

  return landingPages[title] || createPromptHref(prompt);
}

function areaHref(area: string) {
  return `/explore/${area.toLowerCase().replace(/\s+/g, "-")}`;
}

function ratingLabel(location: HomeLocation) {
  const rating = location.rating || location.score;
  return rating ? `${rating.toFixed(1)} ★` : null;
}

function normalizeLabel(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => normalizeLabel(item)).filter(Boolean).join(", ");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || ["[]", "{}", "null", "undefined"].includes(trimmed.toLowerCase())) return "";
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        return normalizeLabel(JSON.parse(trimmed));
      } catch {
        return "";
      }
    }
    return trimmed.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  }
  return String(value).trim();
}

function normalizeLabels(values: unknown, limit = 3): string[] {
  const rawValues = Array.isArray(values) ? values : [values];
  return rawValues
    .flatMap((value) =>
      normalizeLabel(value)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .filter((label) => !["[]", "{}", "null", "undefined"].includes(label.toLowerCase()))
    .filter((label, index, arr) => arr.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index)
    .slice(0, limit);
}

function getCardChips(location: HomeLocation): string[] {
  return normalizeLabels(
    [
      location.primary_category,
      location.category,
      location.cuisine,
      location.cuisine_type,
      location.activity_type,
      ...normalizeLabels(location.vibes, 3),
      ...normalizeLabels(location.tags, 3),
    ],
    3,
  );
}

function matchingLocations(locations: HomeLocation[], keywords: string[]) {
  return locations.filter((location) => hasAny(location, keywords)).sort((a, b) => score(b) - score(a));
}

function pickUnique(pools: HomeLocation[][], limit: number) {
  const picked: HomeLocation[] = [];
  const usedIds = new Set<string>();

  for (const pool of pools) {
    for (const location of pool) {
      if (!location.id || usedIds.has(location.id)) continue;
      picked.push(location);
      usedIds.add(location.id);
      if (picked.length === limit) return picked;
    }
  }

  return picked;
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
    location.borough,
    location.neighborhood,
    location.category,
    location.primary_category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
    ...normalizeLabels(location.tags, 12),
    ...normalizeLabels(location.vibes, 12),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(location: HomeLocation, keywords: string[]) {
  const haystack = searchableText(location);
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function score(location: HomeLocation) {
  return (
    (location.rating || location.score || 0) * 35 +
    (location.total_reviews || 0) * 1.5 +
    (location.views_count || 0) * 0.05 +
    (location.saves_count || 0) * 0.7 +
    (location.reservation_count || 0) * 1.2 +
    (location.featured ? 30 : 0)
  );
}

function isRestaurant(location: HomeLocation) {
  const haystack = searchableText(location);
  return (
    haystack.includes("restaurant") ||
    Boolean(location.restaurant_name) ||
    String(location.source_table || "").toLowerCase() === "restaurants"
  );
}

function dedupeLocations(locations: HomeLocation[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    if (!location.id || seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}
