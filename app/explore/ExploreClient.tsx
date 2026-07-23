"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { classifyPublicLocation } from "@/lib/public-classification";
import { toDisplayLabel } from "@/lib/displayLabel";
import { getPublicTrustBadges, getRatingDisplay, getScoreConfidence } from "@/lib/public-trust";
import SafeLocationImage from "@/components/public-location/SafeLocationImage";

export type ExploreLocation = {
  id: string;
  type?: string | null;
  source_table: string | null;
  source_id?: string | null;
  location_type: string | null;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  business_name?: string | null;
  main_image: string | null;
  image_url: string | null;
  images: string[] | null;
  city: string | null;
  borough: string | null;
  neighborhood: string | null;
  state?: string | null;
  zip_code?: string | null;
  category?: string | null;
  primary_category: string | null;
  primary_tag?: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  food_type?: string | null;
  activity_type: string | null;
  tags: string[] | string | null;
  vibes?: string[] | string | null;
  vibe_tags?: string[] | string | null;
  best_for_tags?: string[] | string | null;
  google_types?: string[] | string | null;
  atmosphere: string[] | string | null;
  best_for: string[] | string | null;
  date_style_tags: string[] | string | null;
  search_keywords: string[] | string | null;
  search_document?: string | null;
  description?: string | null;
  reservation_url: string | null;
  reservation_link?: string | null;
  external_reservation_url: string | null;
  website: string | null;
  rating: number | null;
  score?: number | null;
  total_reviews?: number | null;
  review_count?: number | null;
  theouthaven_score?: number | null;
  popularity_score?: number | null;
  quality_score?: number | null;
  views_count?: number | null;
  saves_count?: number | null;
  reservation_count?: number | null;
  featured?: boolean | null;
  is_featured?: boolean | null;
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
  "date night in Queens",
  "rooftop dinner",
  "bowling in Long Island",
  "hookah after dinner",
];

const KIND_FILTERS = [
  { label: "All", value: "all" },
  { label: "Restaurants", value: "restaurants" },
  { label: "Activities", value: "activities" },
  { label: "Lounges", value: "lounges" },
  { label: "Date Night", value: "date-night" },
  { label: "Groups", value: "groups" },
  { label: "Open Now", value: "open-now" },
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

const AREA_CARDS = [
  {
    label: "Queens",
    value: "Queens",
    description: "Food, lounges, activities, and hidden gems across Queens.",
    fallbackGradient: "from-[#4b1020] via-[#141016] to-[#060303]",
    searchHint: "Queens nights",
  },
  {
    label: "Brooklyn",
    value: "Brooklyn",
    description:
      "Creative nights, date spots, rooftops, and after-dinner plans.",
    fallbackGradient: "from-[#321053] via-[#15101f] to-[#060303]",
    searchHint: "Brooklyn energy",
  },
  {
    label: "Manhattan",
    value: "Manhattan",
    description: "Classic NYC restaurants, experiences, and night-out energy.",
    fallbackGradient: "from-[#5b1c08] via-[#1b0f0b] to-[#060303]",
    searchHint: "NYC classics",
  },
  {
    label: "Bronx",
    value: "Bronx",
    description: "Local favorites, cultural stops, and neighborhood gems.",
    fallbackGradient: "from-[#173d25] via-[#101813] to-[#060303]",
    searchHint: "Bronx gems",
  },
  {
    label: "Staten Island",
    value: "Staten Island",
    description: "Relaxed outings, waterfront stops, and group-friendly plans.",
    fallbackGradient: "from-[#123859] via-[#0d1822] to-[#060303]",
    searchHint: "Waterfront plans",
  },
  {
    label: "Long Island",
    value: "Long Island",
    description:
      "Restaurants, activities, and polished nights out beyond the city.",
    fallbackGradient: "from-[#5c1832] via-[#170d13] to-[#060303]",
    searchHint: "Long Island",
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
  const safeInitialLocations = useMemo(
    () => dedupeRenderableLocations(initialLocations),
    [initialLocations],
  );
  const [locations, setLocations] = useState(safeInitialLocations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastHandledKey = useRef(
    buildSearchKey(initialQ, initialKind, initialArea),
  );

  const hasActiveSearch =
    Boolean(q.trim()) || selectedKind !== "all" || selectedArea !== "all";
  const displayLocations = useMemo(
    () =>
      dedupeRenderableLocations(
        hasActiveSearch ? locations : safeInitialLocations,
      ),
    [hasActiveSearch, safeInitialLocations, locations],
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
      void runSearch({
        q: nextQ,
        kind: nextKind,
        area: nextArea,
        replaceUrl: false,
      });
    } else {
      setLocations(safeInitialLocations);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, safeInitialLocations]);

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
    const hasSearch =
      Boolean(cleanQ) || cleanKind !== "all" || cleanArea !== "all";

    setQ(cleanQ);
    setSelectedKind(cleanKind);
    setSelectedArea(cleanArea);
    setError("");
    lastHandledKey.current = buildSearchKey(cleanQ, cleanKind, cleanArea);

    if (replaceUrl) {
      const queryString = params.toString();
      router.replace(queryString ? `/explore?${queryString}` : "/explore", {
        scroll: false,
      });
    }

    if (!hasSearch) {
      setLocations(safeInitialLocations);
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

      setLocations(
        dedupeRenderableLocations(Array.isArray(data.items) ? data.items : []),
      );
      setError("");
    } catch (err) {
      console.error("EXPLORE_CLIENT_SEARCH_ERROR", err);

      try {
        const fallbackParams = new URLSearchParams();

        if (cleanArea !== "all") {
          if (
            cleanArea === "Queens" ||
            cleanArea === "Brooklyn" ||
            cleanArea === "Manhattan" ||
            cleanArea === "Bronx" ||
            cleanArea === "Staten Island"
          ) {
            fallbackParams.set("borough", cleanArea);
          } else {
            fallbackParams.set("city", cleanArea);
          }
        }

        if (cleanKind !== "all") {
          fallbackParams.set("type", cleanKind);
        }

        fallbackParams.set("limit", "48");

        const fallbackResponse = await fetch(
          `/api/explore?${fallbackParams.toString()}`,
          {
            headers: { Accept: "application/json" },
          },
        );

        const fallbackData = await fallbackResponse.json();

        if (fallbackResponse.ok && Array.isArray(fallbackData.items)) {
          const fallbackItems = fallbackData.items.filter(
            (item: ExploreLocation) => {
              if (!cleanQ) return true;
              return searchableText(item).includes(normalizeSearch(cleanQ));
            },
          );

          setLocations(dedupeRenderableLocations(fallbackItems));
          setError("");
          return;
        }
      } catch (fallbackErr) {
        console.error("EXPLORE_CLIENT_FALLBACK_ERROR", fallbackErr);
      }

      setError(
        `Explore search failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
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
              Quick prompts
            </p>

            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() =>
                    void runSearch({
                      q: chip,
                      kind: "all",
                      area: "all",
                    })
                  }
                  className="shrink-0 rounded-full border border-white/12 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80 transition hover:border-[#e1062a]/70 hover:bg-[#e1062a]/15 hover:text-white"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <BrowseByArea
            q={q}
            selectedKind={selectedKind}
            selectedArea={selectedArea}
            runSearch={runSearch}
          />

          <section className="mt-10">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e1062a]">
                  Places to explore
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                  Places to build your outing around
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                  Browse curated places, then start an outing around the spot
                  that fits your vibe.
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
              q={q}
              loading={loading}
              hasActiveSearch={hasActiveSearch}
              error={error}
            />

            {displayLocations.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {displayLocations
                  .slice(0, 32)
                  .filter(isRenderableExploreLocation)
                  .map((location) => (
                    <LocationCard key={location.id} location={location} />
                  ))}
              </div>
            ) : (
              <EmptyState clearSearch={clearSearch} />
            )}
          </section>
        </div>
      </section>

      <BusinessOwnerCta />
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
            Explore places to build your outing around.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
            Find restaurants, lounges, activities, and things to do after across
            NYC and Long Island.
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
                placeholder="Search by place, vibe, food, activity, or neighborhood"
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

function BrowseByArea({
  q,
  selectedKind,
  selectedArea,
  runSearch,
}: {
  q: string;
  selectedKind: string;
  selectedArea: string;
  runSearch: (args: {
    q?: string;
    kind?: string;
    area?: string;
  }) => Promise<void>;
}) {
  return (
    <section className="mt-9">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e1062a]">
            Browse by area
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            Pick a neighborhood lane
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Start with an area, then narrow it by vibe, food, or activity.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AREA_CARDS.map((area) => {
          const active =
            selectedArea.toLowerCase() === area.value.toLowerCase();

          return (
            <button
              key={area.value}
              type="button"
              onClick={() =>
                void runSearch({
                  q,
                  kind: selectedKind,
                  area: area.value,
                })
              }
              className={`group relative min-h-[220px] overflow-hidden rounded-[1.75rem] border p-5 text-left shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:border-[#e1062a]/70 ${
                active
                  ? "border-[#e1062a] ring-2 ring-[#e1062a]/35"
                  : "border-white/10"
              }`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${area.fallbackGradient}`}
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,.20),transparent_28%),linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.78))]" />
              <img
                src="/toh_logo.png"
                alt=""
                aria-hidden="true"
                className="absolute right-5 top-5 h-12 w-12 rounded-full border border-white/10 bg-black/35 object-contain p-2 opacity-45"
              />
              <div className="relative flex h-full flex-col justify-end">
                <span className="mb-3 w-fit rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/70 backdrop-blur">
                  {area.searchHint}
                </span>
                <h3 className="text-2xl font-black tracking-tight text-white">
                  {area.label}
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-white/72">
                  {area.description}
                </p>
                <span className="mt-4 inline-flex text-sm font-black text-white">
                  Explore area →
                </span>
              </div>
            </button>
          );
        })}
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
  runSearch: (args: {
    q?: string;
    kind?: string;
    area?: string;
  }) => Promise<void>;
}) {
  return (
    <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-3">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {KIND_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() =>
              void runSearch({ q, kind: filter.value, area: selectedArea })
            }
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
            onClick={() =>
              void runSearch({ q, kind: selectedKind, area: filter.value })
            }
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
  q,
  loading,
  hasActiveSearch,
  error,
}: {
  q: string;
  loading: boolean;
  hasActiveSearch: boolean;
  error: string;
}) {
  const text = loading
    ? "Searching TheOutHaven…"
    : q.trim()
      ? `Results for “${q.trim()}”`
      : hasActiveSearch
        ? "Filtered places"
        : "Curated places from TheOutHaven";

  return (
    <div className="mt-5 flex flex-col gap-1 text-sm text-white/58 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-bold">{text}</p>
      {error ? <p className="font-bold text-[#ff8a9b]">{error}</p> : null}
    </div>
  );
}

function LocationCard({ location }: { location: ExploreLocation }) {
  const name = getLocationName(location);
  const detailHref = getLocationDetailHref({
    id: location.id,
    type: location.type || location.location_type,
    sourceTable: location.source_table,
    location,
  });

  const locationArea = [
    location.neighborhood,
    location.city || location.borough,
  ]
    .filter(Boolean)
    .join(", ");
  const classification = classifyPublicLocation(location);
  const typeLabel = classification.primaryLabel;
  const startOutingHref = `/create?q=${encodeURIComponent(
    `plan an outing around ${name} in ${locationArea || "New York"}`,
  )}&locationId=${encodeURIComponent(location.id)}&locationType=${encodeURIComponent(
    getStableLocationType(location),
  )}&source=explore`;

  const categoryLine = [classification.primaryLabel, locationArea || "New York"].filter(Boolean).join(" · ");
  const tags = [...classification.secondaryLabels, ...getPublicTrustBadges(location), ...cleanedTags(location)].slice(0, 2);
  const score = getScoreConfidence(location);
  const rating = getRatingDisplay(location);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-3 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.065]">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.2rem] bg-white/[0.04]">
        <SafeExploreImage src={getLocationImage(location)} alt={name} />

        <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white backdrop-blur">
          {typeLabel}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-4 sm:px-2">
        <h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-black leading-tight">
          {name}
        </h3>

        <p className="mt-1 line-clamp-1 text-sm font-semibold text-white/62">
          {categoryLine}
        </p>

        {score.publicScore ? (
          <p className="mt-1 text-sm font-black text-[#ff8a9b]">Verified TheOutHaven score {score.publicScore}</p>
        ) : rating ? (
          <p className="mt-1 text-sm font-black text-white/68">★ {rating}</p>
        ) : null}

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

        <div className="mt-auto pt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href={detailHref}
              className="flex min-h-[52px] items-center justify-center rounded-full bg-[#e1062a] px-4 text-center text-sm font-black leading-tight text-white transition hover:bg-red-500"
            >
              View details
            </Link>

            <Link
              href={startOutingHref}
              className="flex min-h-[52px] items-center justify-center rounded-full border border-white/15 bg-white/[0.055] px-4 text-center text-sm font-black leading-tight text-white/75 transition hover:bg-white hover:text-black"
            >
              Plan an outing
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function SafeExploreImage({ src, alt }: { src?: string | null; alt: string }) {
  if (!src || !isUsableImageSrc(src)) {
    return <BrandedImageFallback />;
  }

  return (
    <SafeLocationImage
      src={src}
      alt={alt}
      fallbackType="placeholder"
      className="transition duration-500 group-hover:scale-105"
    />
  );
}

function BrandedImageFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(225,6,42,.32),transparent_34%),linear-gradient(135deg,#1a0808,#050202)]">
      <img
        src="/toh_logo.png"
        alt="TheOutHaven"
        className="h-16 w-16 rounded-full border border-white/10 bg-black/35 object-contain p-3 opacity-80"
      />
    </div>
  );
}

function isUsableImageSrc(src: string) {
  const value = src.trim();
  return (
    Boolean(value) &&
    !value.includes("placeholder.jpg") &&
    !value.startsWith("data:,")
  );
}

function EmptyState({ clearSearch }: { clearSearch: () => void }) {
  return (
    <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-8 text-center shadow-xl shadow-black/20">
      <h3 className="text-2xl font-black">No places found for that search.</h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">
        Try a nearby neighborhood, a broader category, or search by vibe like
        date night, girls night, or something fun.
      </p>

      <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={clearSearch}
          className="inline-flex justify-center rounded-full border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
        >
          Clear search
        </button>
        <Link
          href="/create"
          className="inline-flex justify-center rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500"
        >
          Build an outing
        </Link>
      </div>
    </div>
  );
}

function BusinessOwnerCta() {
  return (
    <section className="bg-[#070303] px-5 pb-12 sm:px-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/30 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#e1062a]">
            For businesses
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
            Manage a location on TheOutHaven?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
            Claim your listing to update details, add photos, and help guests
            plan around your business.
          </p>
        </div>

        <Link
          href="/locations/apply/claim"
          className="mt-5 inline-flex rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500 lg:mt-0"
        >
          Claim your location
        </Link>
      </div>
    </section>
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

export function isRenderableExploreLocation(
  location: ExploreLocation,
): boolean {
  if (!location?.id) return false;
  const name = getLocationName(location, "").trim();
  if (!name || normalizeSearch(name) === "unknown location") return false;
  const classification = classifyPublicLocation(location);
  if (!classification.isPubliclyDiscoverable) return false;
  if (!getStableLocationType(location)) return false;
  if (location.data_status && location.data_status !== "clean") return false;
  return true;
}

function dedupeRenderableLocations(locations: ExploreLocation[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    if (!isRenderableExploreLocation(location) || seen.has(location.id))
      return false;
    seen.add(location.id);
    return true;
  });
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
      ...toList(location.tags),
      ...toList(location.vibe_tags),
      ...toList(location.best_for_tags),
      ...toList(location.google_types),
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

function getStableLocationType(location: ExploreLocation) {
  const text = searchableText(location);
  const rawType = String(
    location.source_table || location.location_type || location.type || "",
  ).toLowerCase();

  if (rawType.includes("restaurant") || text.includes("restaurant"))
    return "restaurants";
  if (rawType.includes("activity") || text.includes("activity"))
    return "activities";
  if (
    text.includes("lounge") ||
    text.includes("hookah") ||
    text.includes("nightlife")
  )
    return "lounges";
  if (rawType || location.primary_category) return "places";
  return "";
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

  return toDisplayLabel(cleaned);
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

  const cleanQ = q.trim();

  if (cleanQ) params.set("q", cleanQ);
  if (kind !== "all") params.set("kind", kind);
  if (area !== "all") params.set("area", area);

  return params;
}

function cleanParam(value: unknown) {
  return String(value || "")
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeKind(value: unknown) {
  const kind = cleanParam(value).toLowerCase();
  const allowed = new Set([
    "all",
    "restaurants",
    "activities",
    "lounges",
    "date-night",
    "groups",
    "open-now",
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

  return (
    allowed.find((item) => item.toLowerCase() === area.toLowerCase()) || "all"
  );
}

function normalizeSearch(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
