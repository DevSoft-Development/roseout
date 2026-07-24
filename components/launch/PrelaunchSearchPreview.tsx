"use client";

import { FormEvent, useState } from "react";

type LocationResult = Record<string, unknown>;
type PairResult = Record<string, unknown> & {
  restaurant?: LocationResult | null;
  activity?: LocationResult | null;
};

type SearchResponse = {
  reply?: string;
  restaurants?: LocationResult[];
  activities?: LocationResult[];
  cards?: LocationResult[];
  pairs?: PairResult[];
  matched_locations?: LocationResult[];
  error?: string;
  user_message?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nameOf(item: LocationResult) {
  return text(item.name) || text(item.restaurant_name) || text(item.activity_name) || "TheOutHaven match";
}

function categoryOf(item: LocationResult) {
  return text(item.primary_category) || text(item.cuisine) || text(item.activity_type) || text(item.location_type) || "Recommended place";
}

function areaOf(item: LocationResult) {
  return [text(item.neighborhood), text(item.city), text(item.borough)].filter(Boolean)[0] || "NYC + Long Island";
}

function imageOf(item: LocationResult) {
  const direct = text(item.main_image) || text(item.image_url);
  if (direct) return direct;
  if (Array.isArray(item.images)) return item.images.find((value) => typeof value === "string" && value.trim()) as string | undefined;
  return undefined;
}

function ratingOf(item: LocationResult) {
  const rating = number(item.rating);
  return rating ? rating.toFixed(1) : null;
}

function PairCard({ pair }: { pair: PairResult }) {
  const restaurant = pair.restaurant || (pair.restaurant_id || pair.restaurant_name ? pair : null);
  const activity = pair.activity || (pair.activity_id || pair.activity_name ? pair : null);
  const walk = number(pair.pair_walking_minutes) || number(pair.walking_minutes);

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4 sm:p-5" data-testid="prelaunch-pair-result">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8a9b]">Suggested outing</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {restaurant ? <LocationCard item={restaurant} label="Restaurant" /> : null}
        {activity ? <LocationCard item={activity} label="Activity" /> : null}
      </div>
      {walk ? <p className="mt-4 text-sm font-bold text-white/65">About {Math.round(walk)} minutes apart on foot.</p> : null}
    </article>
  );
}

function LocationCard({ item, label }: { item: LocationResult; label?: string }) {
  const image = imageOf(item);
  const rating = ratingOf(item);
  return (
    <div className="overflow-hidden rounded-[1.15rem] border border-white/10 bg-white/[.045]">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center bg-white/[.035] text-2xl" aria-hidden="true">✦</div>
      )}
      <div className="p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label || categoryOf(item)}</p>
        <h3 className="mt-1 text-lg font-black text-white">{nameOf(item)}</h3>
        <p className="mt-2 text-sm text-white/55">{categoryOf(item)} · {areaOf(item)}{rating ? ` · ${rating} ★` : ""}</p>
      </div>
    </div>
  );
}

export default function PrelaunchSearchPreview() {
  const [query, setQuery] = useState("Italian dinner and comedy show in Manhattan");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || loading) return;

    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: cleanQuery,
          query: cleanQuery,
          message: cleanQuery,
          prompt: cleanQuery,
          source: "homepage_prelaunch_preview",
          messages: [{ role: "user", content: cleanQuery }],
        }),
      });
      const payload = (await response.json()) as SearchResponse;
      if (!response.ok || payload.error) throw new Error(payload.user_message || payload.reply || "Preview results are unavailable right now.");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview results are unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  const pairs = (data?.pairs || []).slice(0, 2);
  const singles = (data?.cards || data?.matched_locations || [...(data?.restaurants || []), ...(data?.activities || [])]).slice(0, 3);
  const hasResults = pairs.length > 0 || singles.length > 0;

  return (
    <div className="mt-8" data-testid="prelaunch-search-preview">
      <form onSubmit={submit} className="rounded-[1.5rem] border border-white/10 bg-white/[.045] p-3 sm:flex sm:items-center sm:gap-3">
        <label className="sr-only" htmlFor="outing-prompt">Outing prompt</label>
        <input id="outing-prompt" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 w-full rounded-full border border-white/10 bg-black/40 px-5 text-base text-white outline-none focus:border-[#e1062a]" />
        <button type="submit" disabled={loading || !query.trim()} className="mt-3 inline-flex min-h-12 w-full min-w-fit items-center justify-center whitespace-nowrap rounded-full bg-white px-6 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-55 sm:mt-0 sm:w-auto">
          {loading ? "Finding matches…" : "Try it"}
        </button>
      </form>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-live="polite">
          {[0, 1].map((item) => <div key={item} className="h-44 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[.045]" />)}
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100" role="alert">{error}</p> : null}

      {data && !loading ? (
        <section className="mt-5 rounded-[1.75rem] border border-[#e1062a]/25 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.16),transparent_38%),rgba(255,255,255,.035)] p-4 sm:p-5" aria-live="polite">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff8a9b]">Preview results</p>
          <h2 className="mt-2 text-2xl font-black">A look at what TheOutHaven found</h2>
          <p className="mt-2 text-sm leading-6 text-white/58">TheOutHaven is currently in prelaunch. Full planning tools will be available at launch.</p>

          {hasResults ? (
            <div className="mt-5 space-y-3">
              {pairs.map((pair, index) => <PairCard key={String(pair.id || index)} pair={pair} />)}
              {pairs.length === 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{singles.map((item, index) => <LocationCard key={String(item.id || index)} item={item} />)}</div> : null}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/65">No preview matches were available for that request. Try another neighborhood, cuisine, or activity.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
