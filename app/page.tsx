import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import RecoveryRedirect from "@/components/RecoveryRedirect";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getPrimaryCategory, getCuisine } from "@/lib/locationFields";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: "Plan the Whole Night",
  description:
    "TheOutHaven helps people plan restaurants, activities, lounges, date nights, birthdays, and full outings across NYC, Long Island, Northern New Jersey, and Connecticut.",
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
    icon: "♡",
    title: "Date Night",
    description: "Dinner, atmosphere, and something memorable after.",
    prompt: "romantic dinner and something fun after",
  },
  {
    icon: "✦",
    title: "Birthday Dinner",
    description: "Celebration-ready food with room for the next stop.",
    prompt: "birthday dinner with a lounge or activity",
  },
  {
    icon: "✨",
    title: "Girls’ Night",
    description: "Social dinner, drinks, and the right energy.",
    prompt: "girls night dinner and drinks",
  },
  {
    icon: "☀",
    title: "Brunch Plans",
    description: "Daytime food paired with something easy and fun.",
    prompt: "brunch and a fun daytime activity",
  },
  {
    icon: "⌁",
    title: "Rooftop Night",
    description: "Views, drinks, dinner, and a more elevated mood.",
    prompt: "rooftop dinner or drinks with a view",
  },
  {
    icon: "◐",
    title: "Dinner + Hookah",
    description: "Start with food, then keep the night relaxed nearby.",
    prompt: "steak dinner and hookah lounge nearby",
  },
  {
    icon: "◆",
    title: "After Work Drinks",
    description: "A polished reset with cocktails and light bites.",
    prompt: "after work drinks and light bites",
  },
  {
    icon: "○",
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

const trustPills = [
  "Restaurants",
  "Lounges",
  "Activities",
  "Date nights",
  "Birthdays",
  "NYC + nearby",
];

const planningSteps = [
  {
    title: "Tell us the vibe",
    copy: "Search by food, activity, occasion, neighborhood, borough, city, or what you want to do after.",
  },
  {
    title: "Get matched options",
    copy: "TheOutHaven helps surface restaurants, lounges, activities, and experiences that fit the full plan.",
  },
  {
    title: "Build the night",
    copy: "Save, book, call, visit, or share the next step without bouncing between endless tabs.",
  },
];

export default async function HomePage() {
  const sections = await loadHomepageSections();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070303] text-white">
      <RecoveryRedirect />

      <section className="relative overflow-hidden px-5 pb-16 pt-28 sm:px-6 lg:pt-36">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,rgba(225,6,42,0.28),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,.1),transparent_24%),linear-gradient(150deg,#080303_0%,#160807_48%,#080303_100%)]" />
        <div className="mx-auto max-w-7xl space-y-14">
          <HeroWithSearch />
          <PlanByOccasion />
          <HowTheOutHavenHelps />
          <FeaturedPlaces locations={sections.featuredLocations} />
          <PopularAreas />
          <AiPlanningCta />
          <BusinessCta />
          <FinalUserCta />
        </div>
      </section>
    </main>
  );
}

function HeroWithSearch() {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-[1.03fr_0.97fr] lg:gap-12">
      <div className="space-y-7">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-white/70 shadow-lg shadow-black/20">
          TheOutHaven
        </div>

        <div className="space-y-5">
          <h1 className="max-w-4xl text-5xl font-black tracking-[-0.05em] text-white sm:text-7xl lg:text-8xl">
            Plan the whole night, not just dinner.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/70 sm:text-xl">
            Find restaurants, lounges, rooftops, activities, and date-night
            ideas matched by vibe, area, occasion, and what you want to do
            after.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-black/35 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-5">
          <form action="/create" method="get" className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              name="prompt"
              placeholder="Try: steak dinner and hookah in Queens"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-white/45 focus:border-[#e1062a] focus:bg-black/35"
              aria-label="Describe your outing"
            />
            <button
              type="submit"
              className="rounded-full bg-[#e1062a] px-7 py-4 text-sm font-black text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
            >
              Plan My Outing
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {searchExamples.map((example) => (
              <Link
                key={example}
                href={createPromptHref(example)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70 transition hover:border-[#e1062a]/60 hover:bg-[#e1062a]/10 hover:text-white"
              >
                {example}
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {trustPills.map((pill) => (
              <span
                key={pill}
                className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-black text-white/75 ring-1 ring-white/10"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>

      <OutingPreviewCard />
    </section>
  );
}

function OutingPreviewCard() {
  const rows = [
    {
      title: "Start with dinner",
      copy: "Steakhouse, Italian, sushi, brunch, or whatever fits the mood.",
    },
    {
      title: "Add the next stop",
      copy: "Hookah, rooftop, lounge, bowling, comedy, views, or something chill.",
    },
    {
      title: "Match the area",
      copy: "Keep the plan nearby with smarter area and vibe matching.",
    },
  ];

  return (
    <aside className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/40 sm:p-6 lg:ml-auto lg:max-w-[34rem]">
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#e1062a]/30 blur-3xl" />
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="relative rounded-[1.5rem] border border-white/10 bg-black/35 p-5 backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff6b80]">
          Sample outing
        </p>
        <h2 className="mt-3 max-w-sm text-3xl font-black tracking-tight text-white sm:text-4xl">
          Dinner, then something worth staying out for
        </h2>

        <div className="mt-6 space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.title}
              className="flex gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e1062a] text-sm font-black text-white shadow-lg shadow-red-950/40">
                {index + 1}
              </div>
              <div>
                <h3 className="font-black text-white">{row.title}</h3>
                <p className="mt-1 text-sm leading-6 text-white/62">{row.copy}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2 rounded-3xl border border-white/10 bg-[#e1062a]/10 p-3 text-xs font-black uppercase tracking-[0.18em] text-white/80 sm:flex-row sm:items-center sm:justify-between">
          <span>Built for full plans</span>
          <span className="text-[#ff8a9a]">Not endless tabs</span>
        </div>
      </div>
    </aside>
  );
}

function PlanByOccasion() {
  return (
    <section>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Plan by occasion</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            Start with the moment. TheOutHaven helps shape the restaurant, the
            next stop, and the overall vibe.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {occasionCards.map((card) => (
          <Link
            key={card.title}
            href={occasionHref(card.title, card.prompt)}
            className="group relative flex min-h-[210px] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:border-[#e1062a]/50 hover:bg-white/[0.06] hover:shadow-2xl hover:shadow-black/30"
          >
            <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#e1062a]/0 blur-2xl transition group-hover:bg-[#e1062a]/20" />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-lg text-white shadow-lg shadow-black/25">
              {card.icon}
            </span>
            <h3 className="relative mt-5 text-xl font-black">{card.title}</h3>
            <p className="relative mt-2 text-sm leading-6 text-white/68">{card.description}</p>
            <p className="relative mt-auto pt-5 text-xs font-black uppercase tracking-[0.16em] text-[#ff7285] transition group-hover:text-white">
              Plan this night
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HowTheOutHavenHelps() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/25 sm:p-8">
      <div className="mb-6">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">How it works</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
          Made for complete outings — dinner, the next stop, and the mood around
          it.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {planningSteps.map((step, index) => (
          <article
            key={step.title}
            className="flex min-h-[190px] flex-col rounded-[1.5rem] border border-white/10 bg-black/25 p-5"
          >
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff7285]">
              Step {index + 1}
            </p>
            <h3 className="mt-4 text-xl font-black">{step.title}</h3>
            <p className="mt-3 text-sm leading-6 text-white/70">{step.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FeaturedPlaces({ locations }: { locations: HomeLocation[] }) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Tonight-worthy places</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
          A rotating mix of restaurants, activities, lounges, and
          outing-friendly spots to inspire your next plan.
        </p>
      </div>
      {locations.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {locations.slice(0, 4).map((location) => (
            <PlaceCard key={location.id} location={location} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-white/65">
          Fresh tonight-worthy places are being curated. Start with a prompt and
          we’ll help build the plan.
        </div>
      )}
    </section>
  );
}

function PopularAreas() {
  const areas = [
    "Manhattan",
    "Brooklyn",
    "Queens",
    "Bronx",
    "Staten Island",
    "Long Island",
    "Northern New Jersey",
    "Connecticut",
  ];

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Popular areas</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
          Browse outing ideas by area, borough, city, or nearby market.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {areas.map((area) => (
          <Link
            key={area}
            href={areaHref(area)}
            className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/85 transition hover:border-[#e1062a]/50 hover:bg-[#e1062a]/10 hover:text-white"
          >
            {area}
          </Link>
        ))}
      </div>
    </section>
  );
}

function AiPlanningCta() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,.30),transparent_40%),linear-gradient(135deg,#180807,#080303)] p-6 shadow-2xl shadow-black/25 sm:p-8 lg:p-10">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-[#ff7285]">
        AI outing planning
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Not sure where to start?</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70 sm:text-base">
        Describe the night you want — the food, the area, the occasion, or the
        thing you want to do after — and TheOutHaven will help turn it into a
        plan.
      </p>
      <div className="mt-6">
        <Link
          href="/create"
          className="inline-flex rounded-full bg-[#e1062a] px-7 py-3 text-sm font-black text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
        >
          Plan My Outing
        </Link>
      </div>
    </section>
  );
}

function BusinessCta() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.025))] p-6 shadow-2xl shadow-black/25 sm:p-8 lg:p-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">
            Business growth
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
            Own a restaurant, lounge, or activity space?
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70 sm:text-base">
            Get discovered by people planning date nights, birthdays, girls’
            nights, weekend plans, and full outings near you.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Link
            href="/business"
            className="rounded-full bg-[#e1062a] px-7 py-3 text-center text-sm font-black text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
          >
            Claim Your Location
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-white/15 bg-black/25 px-7 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
          >
            See Business Plans
          </Link>
        </div>
      </div>
    </section>
  );
}

function FinalUserCta() {
  return (
    <section className="rounded-[2rem] border border-[#e1062a]/30 bg-[#e1062a]/10 p-6 text-center shadow-2xl shadow-black/25 sm:p-8 lg:p-10">
      <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
        Ready to plan your next outing?
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
        Tell us the vibe, area, and occasion. We’ll help you find places that
        fit the full plan.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/create"
          className="rounded-full bg-[#e1062a] px-7 py-3 text-sm font-black text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
        >
          Start Planning
        </Link>
        <Link
          href="/explore"
          className="rounded-full border border-white/15 bg-black/25 px-7 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
        >
          Explore places
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
    .order("featured", { ascending: false })
    .order("score", { ascending: false })
    .limit(80);

  const uniqueLocations = dedupeLocations(
    ((data || []) as HomeLocation[]).filter((location) =>
      Boolean(getLocationName(location, "").trim()),
    ),
  );
  const imageReadyLocations = uniqueLocations.filter(hasUsableImage);
  const homepageCandidates =
    imageReadyLocations.length >= 4 ? imageReadyLocations : uniqueLocations;

  return {
    featuredLocations: buildFeaturedLocations(homepageCandidates),
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
    <article className="group flex h-full min-h-[382px] flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-zinc-950/80 p-3 shadow-2xl shadow-black/30 transition duration-300 hover:-translate-y-1 hover:border-white/20">
      <div className="relative h-44 w-full overflow-hidden rounded-[1.25rem] bg-white/[0.04]">
        <Image
          src={getLocationImage(location)}
          alt={getLocationName(location)}
          loading="lazy"
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
      </div>
      <div className="mt-4 flex flex-1 flex-col px-1 pb-1">
        <h4 className="line-clamp-2 min-h-[3.5rem] text-lg font-black leading-7">
          {getLocationName(location)}
        </h4>
        <p className="line-clamp-1 text-sm text-white/65">
          {getPrimaryCategory(location)} · {location.neighborhood || location.borough || location.city || "New York"}
        </p>
        <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/50">
          {[getCuisine(location) || location.activity_type, ratingLabel(location)]
            .filter(Boolean)
            .join(" · ") || "Curated on TheOutHaven"}
        </p>
        <div className="mt-4 min-h-[3rem]">
          {tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black text-white/75"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-2">
          <Link
            href={getLocationDetailHref({ id: location.id, type: location.type || location.source_table })}
            className="rounded-full bg-[#e1062a] px-4 py-2.5 text-center text-xs font-black text-white transition hover:bg-red-500"
          >
            View Details
          </Link>
          {reserveHref ? (
            <a
              href={reserveHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-center text-xs font-black text-white/82 transition hover:bg-white hover:text-black"
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
  return `/explore/${area.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

function ratingLabel(location: HomeLocation) {
  return location.rating ? `${location.rating.toFixed(1)} ★` : null;
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

function hasUsableImage(location: HomeLocation) {
  return (
    isUsableImageValue(location.main_image) ||
    isUsableImageValue(location.image_url) ||
    (Array.isArray(location.images) && location.images.some(isUsableImageValue))
  );
}

function isUsableImageValue(value: unknown) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLowerCase();
  if (["null", "undefined", "none", "n/a", "placeholder", "#", "?"].includes(lowered)) return false;
  if (lowered.includes("placeholder")) return false;
  return trimmed.length >= 8;
}

function dedupeLocations(locations: HomeLocation[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    if (!location.id || seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}
