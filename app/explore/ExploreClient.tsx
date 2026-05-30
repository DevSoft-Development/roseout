"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getPrimaryCategory, getCuisine } from "@/lib/locationFields";

export type ExploreLocation = {
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
  search_document?: string | null;
  reservation_url: string | null;
  external_reservation_url: string | null;
  website: string | null;
  rating: number | null;
  score: number | null;
  total_reviews: number | null;
  views_count?: number | null;
  saves_count?: number | null;
  reservation_count?: number | null;
  featured: boolean | null;
  created_at: string | null;
  is_searchable: boolean | null;
  is_hidden: boolean | null;
  data_status: string | null;
};

type ExploreClientProps = {
  initialLocations: ExploreLocation[];
  initialQ: string;
  initialKind: string;
  initialArea: string;
};

type SearchResponse = {
  success?: boolean;
  items?: ExploreLocation[];
  error?: string;
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

export default function ExploreClient({
  initialLocations,
  initialQ,
  initialKind,
  initialArea,
}: ExploreClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [selectedKind, setSelectedKind] = useState(normalizeKind(initialKind));
  const [selectedArea, setSelectedArea] = useState(normalizeArea(initialArea));
  const [locations, setLocations] = useState(initialLocations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastHandledKey = useRef(buildSearchKey(initialQ, initialKind, initialArea));

  const hasActiveSearch = Boolean(q.trim()) || selectedKind !== "all" || selectedArea !== "all";
  const displayLocations = useMemo(
    () => (hasActiveSearch ? locations : initialLocations),
    [hasActiveSearch, initialLocations, locations],
  );

  useEffect(() => {
    const nextQ = cleanParam(searchParams.get("q"));
    const nextKind = normalizeKind(searchParams.get("kind"));
    const nextArea = normalizeArea(searchParams.get("area"));

    const nextKey = buildSearchKey(nextQ, nextKind, nextArea);

    setQ(nextQ);
    setSelectedKind(nextKind);
    setSelectedArea(nextArea);

    if (lastHandledKey.current === nextKey) return;

    lastHandledKey.current = nextKey;

    if (nextQ || nextKind !== "all" || nextArea !== "all") {
      void runSearch({ q: nextQ, kind: nextKind, area: nextArea, replaceUrl: false });
    } else {
      setLocations(initialLocations);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, initialLocations]);

  async function runSearch({
    q: nextQ = q,
    kind: nextKind = selectedKind,
    area: nextArea = selectedArea,
    replaceUrl = true,
  }: {
    q?: string;
    kind?: string;
    area?: string;
    replaceUrl?: boolean;
  }) {
    const cleanQ = cleanParam(nextQ);
    const cleanKind = normalizeKind(nextKind);
    const cleanArea = normalizeArea(nextArea);
    const params = buildParams(cleanQ, cleanKind, cleanArea);
    const hasSearch = Boolean(cleanQ) || cleanKind !== "all" || cleanArea !== "all";

    setQ(cleanQ);
    setSelectedKind(cleanKind);
    setSelectedArea(cleanArea);
    setError("");
    lastHandledKey.current = buildSearchKey(cleanQ, cleanKind, cleanArea);

    if (replaceUrl) {
      const queryString = params.toString();
      router.replace(queryString ? `/explore?${queryString}` : "/explore", { scroll: false });
    }

    if (!hasSearch) {
      setLocations(initialLocations);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/explore/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as SearchResponse;

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Explore search failed");
      }

      setLocations(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.error("EXPLORE_CLIENT_SEARCH_ERROR", err);

      try {
        const fallbackParams = new URLSearchParams();

        if (cleanArea !== "all") {
          if (cleanArea === "Queens" || cleanArea === "Brooklyn" || cleanArea === "Manhattan" || cleanArea === "Bronx" || cleanArea === "Staten Island") {
            fallbackParams.set("borough", cleanArea);
          } else {
            fallbackParams.set("city", cleanArea);
          }
        }

        if (cleanKind !== "all") {
          fallbackParams.set("type", cleanKind);
        }

        fallbackParams.set("limit", "48");

        const fallbackResponse = await fetch(`/api/explore?${fallbackParams.toString()}`, {
          headers: { Accept: "application/json" },
        });

        const fallbackData = await fallbackResponse.json();

        if (fallbackResponse.ok && Array.isArray(fallbackData.items)) {
          const fallbackItems = fallbackData.items.filter((item: ExploreLocation) => {
            if (!cleanQ) return true;
            return searchableText(item).includes(normalizeSearch(cleanQ));
          });

          setLocations(fallbackItems);
          setError("");
          return;
        }
      } catch (fallbackErr) {
        console.error("EXPLORE_CLIENT_FALLBACK_ERROR", fallbackErr);
      }

      setError("Search is having trouble right now. Try a different query or clear the filters.");
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch({ q, kind: selectedKind, area: selectedArea });
  }

  function clearSearch() {
    void runSearch({ q: "", kind: "all", area: "all" });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070303] text-white">
      <TheOutHavenHeader />

      <section className="relative px-5 pb-14 pt-28 sm:px-6 lg:pt-36">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgba(225,6,42,0.26),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(255,255,255,.08),transparent_24%),linear-gradient(150deg,#070303_0%,#120605_48%,#070303_100%)]" />

        <div className="mx-auto max-w-7xl">
          <HeroSearch q={q} setQ={setQ} handleSubmit={handleSubmit} />

          <div className="mt-5">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Popular
            </p>

            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void runSearch({ q: chip, kind: selectedKind, area: selectedArea })}
                  className="shrink-0 rounded-full border border-white/12 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80 transition hover:border-[#e1062a]/70 hover:bg-[#e1062a]/15 hover:text-white"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <FeaturedCollections
            selectedKind={selectedKind}
            selectedArea={selectedArea}
            runSearch={runSearch}
          />

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
                  Explore helps you browse places first. When you’re ready, start an outing from a place or build the full plan.
                </p>
              </div>

              <Link
                href="/create"
                className="w-fit rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
              >
                Build an outing
              </Link>
            </div>

            <FilterPills
              selectedKind={selectedKind}
              selectedArea={selectedArea}
              q={q}
              runSearch={runSearch}
            />

            <ResultsHeader
              count={displayLocations.length}
              q={q}
              loading={loading}
              hasActiveSearch={hasActiveSearch}
              error={error}
            />

            {displayLocations.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {displayLocations.slice(0, 32).map((location) => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            ) : (
              <EmptyState clearSearch={clearSearch} />
            )}
          </section>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

function HeroSearch({
  q,
  setQ,
  handleSubmit,
}: {
  q: string;
  setQ: (value: string) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
            onSubmit={handleSubmit}
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                name="q"
                value={q}
                onChange={(event) => setQ(event.target.value)}
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
  runSearch,
}: {
  selectedKind: string;
  selectedArea: string;
  runSearch: (args: { q?: string; kind?: string; area?: string }) => Promise<void>;
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
          <button
            key={collection.title}
            type="button"
            onClick={() => void runSearch({ q: collection.query, kind: selectedKind, area: selectedArea })}
            className="group relative min-h-[150px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-[#e1062a]/60 hover:bg-white/[0.075]"
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
          </button>
        ))}
      </div>
    </section>
  );
}

function FilterPills({
  selectedKind,
  selectedArea,
  q,
  runSearch,
}: {
  selectedKind: string;
  selectedArea: string;
  q: string;
  runSearch: (args: { q?: string; kind?: string; area?: string }) => Promise<void>;
}) {
  return (
    <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-3">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {KIND_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => void runSearch({ q, kind: filter.value, area: selectedArea })}
            className={pillClass(selectedKind === filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {AREA_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => void runSearch({ q, kind: selectedKind, area: filter.value })}
            className={pillClass(
              selectedArea.toLowerCase() === filter.value.toLowerCase(),
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultsHeader({
  count,
  q,
  loading,
  hasActiveSearch,
  error,
}: {
  count: number;
  q: string;
  loading: boolean;
  hasActiveSearch: boolean;
  error: string;
}) {
  const text = loading
    ? "Searching TheOutHaven…"
    : q.trim()
      ? `Showing results for “${q.trim()}”`
      : `Showing ${count} ${count === 1 ? "place" : "places"}`;

  return (
    <div className="mt-5 flex flex-col gap-1 text-sm text-white/58 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-bold">{text}</p>
      {!loading && q.trim() ? (
        <p className="text-white/42">
          {count} {count === 1 ? "place" : "places"} found
        </p>
      ) : null}
      {!loading && !q.trim() && hasActiveSearch ? (
        <p className="text-white/42">
          {count} {count === 1 ? "place" : "places"} match these filters
        </p>
      ) : null}
      {error ? <p className="text-[#ff8a9b]">{error}</p> : null}
    </div>
  );
}

function LocationCard({ location }: { location: ExploreLocation }) {
  const name = getLocationName(location);
  const reserveHref =
    location.external_reservation_url || location.reservation_url || location.website;

  const detailHref = getLocationDetailHref({
    id: location.id,
    type: location.type || location.location_type,
    sourceTable: location.source_table,
    location,
  });

  const startOutingHref = `/create?locationId=${encodeURIComponent(
    location.id,
  )}&locationName=${encodeURIComponent(name)}&source=explore`;

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

function EmptyState({ clearSearch }: { clearSearch: () => void }) {
  return (
    <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-8 text-center shadow-xl shadow-black/20">
      <h3 className="text-2xl font-black">No matching places found.</h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">
        Try a different vibe, cuisine, activity, or area. You can also build a full outing and let TheOutHaven guide the plan.
      </p>

      <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/create"
          className="inline-flex justify-center rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500"
        >
          Build an outing
        </Link>
        <button
          type="button"
          onClick={clearSearch}
          className="inline-flex justify-center rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
        >
          Clear search
        </button>
      </div>
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
      location.search_document,
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

function isRestaurant(location: ExploreLocation) {
  const text = searchableText(location);

  return (
    Boolean(location.restaurant_name) ||
    text.includes("restaurant") ||
    text.includes("dinner") ||
    text.includes("brunch") ||
    text.includes("food") ||
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
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(value)];
}

function pillClass(active: boolean) {
  return [
    "shrink-0 rounded-full px-4 py-2 text-sm font-black transition",
    active
      ? "bg-[#e1062a] text-white shadow-lg shadow-[#e1062a]/20"
      : "border border-white/12 bg-white/[0.055] text-white/68 hover:border-[#e1062a]/60 hover:text-white",
  ].join(" ");
}

function buildSearchKey(q: string, kind: string, area: string) {
  return `${cleanParam(q)}::${normalizeKind(kind)}::${normalizeArea(area)}`;
}

function buildParams(q: string, kind: string, area: string) {
  const params = new URLSearchParams();

  if (q.trim()) params.set("q", q.trim());
  if (kind !== "all") params.set("kind", kind);
  if (area !== "all") params.set("area", area);

  return params;
}

function cleanParam(value: unknown) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeKind(value: unknown) {
  const kind = cleanParam(value).toLowerCase();
  const allowed = new Set([
    "all",
    "restaurants",
    "activities",
    "rooftops",
    "lounges",
    "brunch",
  ]);

  return allowed.has(kind) ? kind : "all";
}

function normalizeArea(value: unknown) {
  const area = cleanParam(value);

  if (!area) return "all";

  const allowed = [
    "all",
    "Queens",
    "Brooklyn",
    "Manhattan",
    "Bronx",
    "Staten Island",
    "Long Island",
  ];

  return allowed.find((item) => item.toLowerCase() === area.toLowerCase()) || "all";
}

function normalizeSearch(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
