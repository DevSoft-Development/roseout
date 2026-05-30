import Link from "next/link";
import Image from "next/image";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getPrimaryCategory, getCuisine } from "@/lib/locationFields";

export const revalidate = 300;

type ExploreLocation = {
  id: string;
  type: string | null;
  source_table: string | null;
  location_type: string | null;
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
  atmosphere: string[] | string | null;
  best_for: string[] | string | null;
  date_style_tags: string[] | string | null;
  search_keywords: string[] | string | null;
  reservation_url: string | null;
  external_reservation_url: string | null;
  website: string | null;
  rating: number | null;
  score: number | null;
  total_reviews: number | null;
  views_count: number | null;
  saves_count: number | null;
  reservation_count: number | null;
  featured: boolean | null;
  created_at: string | null;
  is_searchable: boolean | null;
  is_hidden: boolean | null;
  data_status: string | null;
};

type ExploreSearchParams = {
  q?: string;
  kind?: string;
  area?: string;
};

const QUICK_CHIPS = [
  "Date Night",
  "Dinner",
  "Rooftops",
  "Brunch",
  "Hookah",
  "Activities",
  "Queens",
];

const KIND_FILTERS = [
  { label: "All", value: "all" },
  { label: "Restaurants", value: "restaurants" },
  { label: "Activities", value: "activities" },
  { label: "Rooftops", value: "rooftops" },
  { label: "Lounges", value: "lounges" },
  { label: "Brunch", value: "brunch" },
];

const AREA_FILTERS = [
  { label: "All Areas", value: "all" },
  { label: "Queens", value: "Queens" },
  { label: "Brooklyn", value: "Brooklyn" },
  { label: "Manhattan", value: "Manhattan" },
  { label: "Bronx", value: "Bronx" },
  { label: "Staten Island", value: "Staten Island" },
  { label: "Long Island", value: "Long Island" },
];

const COLLECTIONS = [
  {
    title: "Date Night",
    description: "Romantic, polished, and easy to plan.",
    query: "date night",
  },
  {
    title: "Rooftop Views",
    description: "Dinner, drinks, and a skyline moment.",
    query: "rooftop",
  },
  {
    title: "Brunch Plans",
    description: "Weekend spots with a social vibe.",
    query: "brunch",
  },
  {
    title: "Weekend Fun",
    description: "Activities, lounges, and after-dinner ideas.",
    query: "weekend fun",
  },
];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<ExploreSearchParams>;
}) {
  const params = await searchParams;

  const q = cleanParam(params.q);
  const selectedKind = normalizeKind(params.kind);
  const selectedArea = normalizeArea(params.area);

  const locations = await loadExploreData();

  const filteredLocations = rankLocations(
    locations.filter((location) => {
      const text = searchableText(location);

      const matchesQuery = !q || text.includes(normalizeSearch(q));
      const matchesKind =
        selectedKind === "all" || matchesKindFilter(location, selectedKind);
      const matchesArea =
        selectedArea === "all" || matchesAreaFilter(location, selectedArea);

      return matchesQuery && matchesKind && matchesArea;
    }),
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070303] text-white">
      <TheOutHavenHeader />

      <section className="relative px-5 pb-14 pt-28 sm:px-6 lg:pt-36">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(225,6,42,0.26),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(255,255,255,.08),transparent_24%),linear-gradient(150deg,#070303_0%,#120605_48%,#070303_100%)]" />

        <div className="mx-auto max-w-7xl">
          <HeroSearch q={q} />

          <div className="mt-5">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Popular
            </p>

            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {QUICK_CHIPS.map((chip) => (
                <Link
                  key={chip}
                  href={exploreHref({
                    q: chip,
                    kind: selectedKind,
                    area: selectedArea,
                  })}
                  className="shrink-0 rounded-full border border-white/12 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80 transition hover:border-[#e1062a]/70 hover:bg-[#e1062a]/15 hover:text-white"
                >
                  {chip}
                </Link>
              ))}
            </div>
          </div>

          <FeaturedCollections selectedKind={selectedKind} selectedArea={selectedArea} />

          <section className="mt-10">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e1062a]">
                  Browse
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                  All Places
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                  Browse places first, then view details or start a full outing around a spot.
                </p>
              </div>

              <Link
                href="/create"
                className="w-fit rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
              >
                Build an outing
              </Link>
            </div>

            <FilterPills selectedKind={selectedKind} selectedArea={selectedArea} q={q} />

            {filteredLocations.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {filteredLocations.slice(0, 32).map((location) => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </section>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

async function loadExploreData() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id,type,source_table,location_type,name,restaurant_name,activity_name,business_name,main_image,image_url,images,city,borough,neighborhood,category,primary_category,cuisine,cuisine_type,activity_type,tags,vibes,atmosphere,best_for,date_style_tags,search_keywords,reservation_url,external_reservation_url,website,rating,score,total_reviews,views_count,saves_count,reservation_count,featured,created_at,is_searchable,is_hidden,data_status",
    )
    .eq("is_searchable", true)
    .neq("is_hidden", true)
    .eq("data_status", "clean")
    .limit(96);

  if (error) {
    console.error("EXPLORE_LOAD_ERROR", error.message);
    return [];
  }

  return dedupeById((data || []) as ExploreLocation[]).filter((row) =>
    Boolean(getLocationName(row, "").trim()),
  );
}

function HeroSearch({ q }: { q: string }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/45 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.05fr_.95fr] lg:p-10">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#e1062a]">
            Explore
          </p>

          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
            Find your next place out.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
            Browse restaurants, activities, rooftops, lounges, brunch spots, and date-night ideas.
            Want the full plan? Start from any place or build an outing.
          </p>
        </div>

        <div className="flex flex-col justify-end">
          <form
            action="/explore"
            method="get"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search by vibe, food, activity, or area"
                className="min-h-12 min-w-0 flex-1 rounded-full border border-white/10 bg-black/45 px-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-[#e1062a]"
              />

              <button
                type="submit"
                className="min-h-12 w-full whitespace-nowrap rounded-full bg-[#e1062a] px-6 text-sm font-black text-white transition hover:bg-red-500 sm:w-auto sm:min-w-[112px]"
              >
                Search
              </button>
            </div>
          </form>

          <Link
            href="/create"
            className="mt-3 text-center text-sm font-black text-white/65 transition hover:text-white"
          >
            Need the full plan? Build an outing →
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeaturedCollections({
  selectedKind,
  selectedArea,
}: {
  selectedKind: string;
  selectedArea: string;
}) {
  return (
    <section className="mt-9">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
            Curated
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            Featured Collections
          </h2>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COLLECTIONS.map((collection) => (
          <Link
            key={collection.title}
            href={exploreHref({
              q: collection.query,
              kind: selectedKind,
              area: selectedArea,
            })}
            className="group relative min-h-[150px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-[#e1062a]/60 hover:bg-white/[0.075]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(225,6,42,.32),transparent_36%),linear-gradient(145deg,rgba(255,255,255,.08),transparent_55%)] opacity-80 transition group-hover:opacity-100" />

            <div className="relative flex h-full flex-col justify-between">
              <span className="w-fit rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/65">
                Explore
              </span>

              <div className="pt-8">
                <h3 className="text-xl font-black">{collection.title}</h3>
                <p className="mt-1 text-sm leading-5 text-white/62">
                  {collection.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FilterPills({
  selectedKind,
  selectedArea,
  q,
}: {
  selectedKind: string;
  selectedArea: string;
  q: string;
}) {
  return (
    <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-3">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {KIND_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={exploreHref({ q, kind: filter.value, area: selectedArea })}
            className={pillClass(selectedKind === filter.value)}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {AREA_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={exploreHref({ q, kind: selectedKind, area: filter.value })}
            className={pillClass(
              selectedArea.toLowerCase() === filter.value.toLowerCase(),
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function LocationCard({ location }: { location: ExploreLocation }) {
  const name = getLocationName(location);
  const reserveHref =
    location.external_reservation_url || location.reservation_url || location.website;

  const detailHref = getLocationDetailHref({
    id: location.id,
    type: location.type || location.location_type || location.source_table,
  });

  const startOutingHref = `/create?placeId=${encodeURIComponent(
    location.id,
  )}&placeName=${encodeURIComponent(name)}`;

  const locationArea = [location.neighborhood, location.city || location.borough]
    .filter(Boolean)
    .join(", ");

  const categoryLine =
    [getCuisine(location), location.activity_type, getPrimaryCategory(location)]
      .map((item) => cleanLabel(item))
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ") || "Curated on TheOutHaven";

  const tags = cleanedTags(location).slice(0, 2);
  const typeLabel = getTypeLabel(location);

  return (
    <article className="group overflow-hidden rounded-[1.55rem] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.065]">
      <div className="relative h-48 overflow-hidden rounded-[1.2rem] bg-white/[0.04]">
        <Image
          src={getLocationImage(location)}
          alt={name}
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />

        <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white backdrop-blur">
          {typeLabel}
        </div>
      </div>

      <div className="flex min-h-[215px] flex-col px-1 pb-1 pt-4">
        <h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-black leading-tight">
          {name}
        </h3>

        <p className="mt-1 line-clamp-1 text-sm font-semibold text-white/62">
          {locationArea || "New York"}
        </p>

        <p className="mt-1 line-clamp-1 text-sm text-white/50">
          {categoryLine}
        </p>

        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-xs font-bold text-white/62"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto grid gap-2 pt-4">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={detailHref}
              className="rounded-full bg-[#e1062a] px-4 py-2.5 text-center text-xs font-black text-white transition hover:bg-red-500"
            >
              View Details
            </Link>

            <Link
              href={startOutingHref}
              className="rounded-full border border-white/15 bg-white/[0.055] px-4 py-2.5 text-center text-xs font-black text-white/75 transition hover:bg-white hover:text-black"
            >
              Start Outing
            </Link>
          </div>

          {reserveHref ? (
            <a
              href={reserveHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/15 bg-black/35 px-4 py-2.5 text-center text-xs font-black text-white/65 transition hover:border-[#e1062a]/60 hover:text-white"
            >
              Reserve
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-8 text-center shadow-xl shadow-black/20">
      <h3 className="text-2xl font-black">No places found yet.</h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">
        Try a different search, area, or category — or build a guided outing instead.
      </p>

      <Link
        href="/create"
        className="mt-5 inline-flex rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500"
      >
        Build an outing
      </Link>
    </div>
  );
}

function PublicFooter() {
  const links = [
    ["Home", "/"],
    ["Explore", "/explore"],
    ["Create Outing", "/create"],
    ["Business", "/business"],
    ["Sign In", "/signup"],
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
    ["SMS Terms", "/sms-terms"],
    ["Contact", "/contact"],
  ] as const;

  return (
    <footer className="border-t border-white/10 bg-black/50 px-5 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap gap-4 text-sm text-white/60">
          {links.map(([label, href]) => (
            <Link key={label} href={href} className="hover:text-white">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

function dedupeById(locations: ExploreLocation[]) {
  const seen = new Set<string>();

  return locations.filter((location) => {
    if (!location.id || seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}

function rankLocations(locations: ExploreLocation[]) {
  return [...locations].sort((a, b) => rankScore(b) - rankScore(a));
}

function rankScore(location: ExploreLocation) {
  return (
    (location.featured ? 100 : 0) +
    Number(location.rating || location.score || 0) * 35 +
    Number(location.total_reviews || 0) * 1.4 +
    Number(location.saves_count || 0) * 0.8 +
    Number(location.reservation_count || 0) * 1.2 +
    Number(location.views_count || 0) * 0.04
  );
}

function searchableText(location: ExploreLocation) {
  return normalizeSearch(
    [
      location.type,
      location.source_table,
      location.location_type,
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
      ...toList(location.tags),
      ...toList(location.vibes),
      ...toList(location.atmosphere),
      ...toList(location.best_for),
      ...toList(location.date_style_tags),
      ...toList(location.search_keywords),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function matchesKindFilter(location: ExploreLocation, kind: string) {
  const text = searchableText(location);

  if (kind === "restaurants") {
    return isRestaurant(location);
  }

  if (kind === "activities") {
    return isActivity(location);
  }

  if (kind === "rooftops") {
    return text.includes("rooftop");
  }

  if (kind === "lounges") {
    return (
      text.includes("lounge") ||
      text.includes("hookah") ||
      text.includes("bar") ||
      text.includes("nightlife")
    );
  }

  if (kind === "brunch") {
    return text.includes("brunch") || text.includes("breakfast");
  }

  return true;
}

function matchesAreaFilter(location: ExploreLocation, area: string) {
  const normalizedArea = normalizeSearch(area);

  const text = normalizeSearch(
    [location.borough, location.city, location.neighborhood]
      .filter(Boolean)
      .join(" "),
  );

  if (normalizedArea === "long island") {
    return [
      "long island",
      "nassau",
      "suffolk",
      "hempstead",
      "freeport",
      "garden city",
      "mineola",
      "westbury",
      "huntington",
      "melville",
      "babylon",
      "islip",
      "patchogue",
      "riverhead",
    ].some((term) => text.includes(term));
  }

  return text.includes(normalizedArea);
}

function isRestaurant(location: ExploreLocation) {
  const text = searchableText(location);

  return (
    Boolean(location.restaurant_name) ||
    text.includes("restaurant") ||
    text.includes("dinner") ||
    text.includes("brunch") ||
    text.includes("cuisine") ||
    text.includes("steak") ||
    text.includes("seafood") ||
    text.includes("cafe") ||
    text.includes("bakery")
  );
}

function isActivity(location: ExploreLocation) {
  const text = searchableText(location);

  return (
    Boolean(location.activity_name) ||
    text.includes("activity") ||
    text.includes("sip and paint") ||
    text.includes("bowling") ||
    text.includes("arcade") ||
    text.includes("museum") ||
    text.includes("comedy") ||
    text.includes("escape room") ||
    text.includes("paint") ||
    text.includes("karaoke")
  );
}

function getTypeLabel(location: ExploreLocation) {
  const text = searchableText(location);

  if (text.includes("rooftop")) return "Rooftop";
  if (text.includes("hookah") || text.includes("lounge")) return "Lounge";
  if (isRestaurant(location)) return "Restaurant";
  if (isActivity(location)) return "Activity";

  return cleanLabel(location.location_type || location.type || location.source_table) || "Place";
}

function cleanedTags(location: ExploreLocation) {
  const rawTags = [
    ...toList(location.best_for),
    ...toList(location.vibes),
    ...toList(location.atmosphere),
    ...toList(location.date_style_tags),
    ...toList(location.tags),
  ];

  const seen = new Set<string>();

  const blocked = new Set([
    "",
    "[]",
    "null",
    "undefined",
    "theouthaven friendly outing",
  ]);

  return rawTags
    .map((tag) => cleanLabel(tag))
    .filter((tag): tag is string => Boolean(tag))
    .filter((tag) => {
      const key = tag.toLowerCase();

      if (blocked.has(key) || seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

function cleanLabel(value: unknown) {
  if (!value) return "";

  const cleaned = String(value)
    .replace(/[\[\]"]/g, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !cleaned ||
    cleaned.toLowerCase() === "null" ||
    cleaned.toLowerCase() === "undefined"
  ) {
    return "";
  }

  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function toList(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed || trimmed === "[]" || trimmed.toLowerCase() === "null") {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      // Not JSON. Continue with comma split.
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(value)];
}

function cleanParam(value: string | undefined) {
  return String(value || "").trim();
}

function normalizeSearch(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKind(value: string | undefined) {
  const normalized = normalizeSearch(value || "all");

  return KIND_FILTERS.some((filter) => filter.value === normalized)
    ? normalized
    : "all";
}

function normalizeArea(value: string | undefined) {
  const normalized = String(value || "all").trim();

  return AREA_FILTERS.some(
    (filter) => filter.value.toLowerCase() === normalized.toLowerCase(),
  )
    ? normalized
    : "all";
}

function exploreHref({
  q,
  kind,
  area,
}: {
  q?: string;
  kind?: string;
  area?: string;
}) {
  const params = new URLSearchParams();

  const cleanQ = cleanParam(q);
  const cleanKind = normalizeKind(kind);
  const cleanArea = normalizeArea(area);

  if (cleanQ) params.set("q", cleanQ);
  if (cleanKind && cleanKind !== "all") params.set("kind", cleanKind);
  if (cleanArea && cleanArea.toLowerCase() !== "all") {
    params.set("area", cleanArea);
  }

  const query = params.toString();

  return query ? `/explore?${query}` : "/explore";
}

function pillClass(active: boolean) {
  return [
    "shrink-0 rounded-full border px-4 py-2 text-sm font-black transition",
    active
      ? "border-[#e1062a] bg-[#e1062a]/20 text-white"
      : "border-white/12 bg-black/25 text-white/60 hover:border-white/25 hover:bg-white/[0.06] hover:text-white",
  ].join(" ");
}
