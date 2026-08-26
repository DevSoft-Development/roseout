"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";

type LocationCard = Record<string, unknown> & {
  id?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  city?: string | null;
  state?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_category?: string | null;
  rating?: number | string | null;
  google_rating?: number | string | null;
  review_count?: number | string | null;
};

type SavedPair = {
  rank: number;
  distanceMiles?: number | null;
  restaurant: LocationCard;
  activity: LocationCard;
};

type SnapshotPayload = {
  ok: boolean;
  code: string;
  shortUrl: string;
  planTitle: string;
  prompt: string;
  planType: "outing" | "restaurant" | "activity";
  selected: {
    restaurantLocationId?: string | null;
    activityLocationId?: string | null;
  };
  pairs: SavedPair[];
  restaurants: LocationCard[];
  activities: LocationCard[];
};

function nameFor(location: LocationCard) {
  return getLocationName(location, "Location");
}

function imageFor(location: LocationCard) {
  return getLocationImage(location as never);
}

function numeric(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function ratingFor(location: LocationCard) {
  const rating = numeric(location.rating ?? location.google_rating);
  if (!rating || rating <= 0) return null;
  const reviews = numeric(location.review_count);
  return { value: rating.toFixed(1), reviews: reviews && reviews > 0 ? Math.round(reviews) : null };
}

function metaFor(location: LocationCard) {
  return [
    location.cuisine || location.cuisine_type || location.activity_type || location.primary_category,
    location.city,
    location.state,
  ].filter(Boolean).join(" · ");
}

function track(eventName: string, metadata: Record<string, unknown>) {
  try {
    trackClientEvent({ event_name: eventName, source: "saved_plan_results", metadata });
  } catch {
    // Analytics never blocks the planner.
  }
}

function RatingBadge({ location }: { location: LocationCard }) {
  const rating = ratingFor(location);
  if (!rating) return null;
  return (
    <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/80 px-2.5 py-1.5 text-[10px] font-black text-white shadow-lg backdrop-blur-md">
      <span className="text-amber-300">★</span>
      {rating.value}
      {rating.reviews ? <span className="font-bold text-white/45">({rating.reviews.toLocaleString()})</span> : null}
    </span>
  );
}

function VenuePhoto({ location, label }: { location: LocationCard; label: string }) {
  const image = imageFor(location);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101010]">
      <div className="relative h-40 overflow-hidden bg-white/[0.04] sm:h-44">
        {image ? <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">📍</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10" />
        <RatingBadge location={location} />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="p-3.5">
        <h3 className="truncate text-base font-black">{nameFor(location)}</h3>
        <p className="mt-1 truncate text-xs font-semibold text-white/45">{metaFor(location)}</p>
      </div>
    </div>
  );
}

function ChoiceCard({
  location,
  type,
  selected,
  onSelect,
}: {
  location: LocationCard;
  type: "restaurant" | "activity";
  selected: boolean;
  onSelect: () => void;
}) {
  const image = imageFor(location);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group w-full overflow-hidden rounded-[1.25rem] border text-left transition ${selected ? "border-[#e1062a]/75 bg-[#e1062a]/10 shadow-[0_0_0_1px_rgba(225,6,42,0.18)]" : "border-white/10 bg-[#101010] hover:border-white/25"}`}
    >
      <div className="relative h-40 overflow-hidden bg-white/[0.04] sm:h-48">
        {image ? <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center text-4xl">{type === "restaurant" ? "🍽️" : "✨"}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />
        <RatingBadge location={location} />
        <span className={`absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black ${selected ? "border-[#e1062a] bg-[#e1062a] text-white" : "border-white/20 bg-black/65 text-transparent"}`}>✓</span>
        <span className="absolute bottom-3 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em]">{type}</span>
      </div>
      <div className="p-4">
        <h4 className="truncate text-base font-black">{nameFor(location)}</h4>
        <p className="mt-1 truncate text-xs font-semibold text-white/45">{metaFor(location)}</p>
        <p className={`mt-3 text-[10px] font-black uppercase tracking-[0.12em] ${selected ? "text-[#ff7188]" : "text-white/35"}`}>{selected ? "Selected" : "Choose this stop"}</p>
      </div>
    </button>
  );
}

export default function GuidedSnapshotResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("snapshot")?.trim() || "";
  const [data, setData] = useState<SnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [restaurant, setRestaurant] = useState<LocationCard | null>(null);
  const [activity, setActivity] = useState<LocationCard | null>(null);

  useEffect(() => {
    document.title = "View Other Picks | TheOutHaven";
    if (!code) {
      setError("This saved-results link is missing.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/outings/short/${encodeURIComponent(code)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.message || "We could not load these saved picks.");
        return payload as SnapshotPayload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setData(payload);
        setRestaurant(payload.restaurants.find((item) => String(item.id) === payload.selected.restaurantLocationId) || null);
        setActivity(payload.activities.find((item) => String(item.id) === payload.selected.activityLocationId) || null);
        track("planner_results_revisited", {
          short_code: code,
          pair_count: payload.pairs.length,
          restaurant_count: payload.restaurants.length,
          activity_count: payload.activities.length,
        });
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "We could not load these saved picks.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [code]);

  const currentRestaurantId = data?.selected.restaurantLocationId || null;
  const currentActivityId = data?.selected.activityLocationId || null;
  const displayedPairs = useMemo(() => data?.pairs.slice(0, 6) || [], [data]);

  async function updatePick(nextRestaurant: LocationCard | null, nextActivity: LocationCard | null, resultType: string) {
    if (!data || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/outings/short/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantLocationId: nextRestaurant?.id || null,
          activityLocationId: nextActivity?.id || null,
          resultType,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || "We could not update your pick.");
      track("planner_pick_changed", {
        short_code: code,
        result_type: resultType,
        restaurant_id: nextRestaurant?.id || null,
        activity_id: nextActivity?.id || null,
      });
      window.location.assign(payload.planUrl || data.shortUrl || `/p/${code}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not update your pick.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050505] px-4 pb-16 pt-20 text-white sm:px-6">
        <GuidedJourneySteps activeStep={3} className="max-w-4xl" />
        <div className="mx-auto mt-12 max-w-6xl rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#e1062a]" />
          <p className="mt-4 text-sm font-bold text-white/50">Loading your original picks…</p>
        </div>
      </main>
    );
  }

  if (!data || error && !data) {
    return (
      <main className="min-h-screen bg-[#050505] px-4 pb-16 pt-20 text-white sm:px-6">
        <GuidedJourneySteps activeStep={3} className="max-w-4xl" />
        <div className="mx-auto mt-12 max-w-3xl rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="text-3xl font-black">These saved picks are unavailable.</h1>
          <p className="mt-3 text-sm font-semibold text-white/50">{error || "Start a new plan and we’ll build fresh options."}</p>
          <button type="button" onClick={() => router.push("/create")} className="mt-6 rounded-full bg-[#e1062a] px-6 py-3 text-xs font-black uppercase tracking-[0.1em]">Start a new plan</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-20 pt-20 text-white">
      <div className="px-4 sm:px-6">
        <GuidedJourneySteps activeStep={3} className="max-w-4xl" />
      </div>

      <section className="mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 3 of 4 · Pick</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">Your original picks.</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50">These are the options from when this plan was created. Your current choice is marked, and you can switch without starting over.</p>
          </div>
          <a href={data.shortUrl || `/p/${code}`} className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white/70 transition hover:border-white/30 hover:text-white">← Back to current plan</a>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div> : null}

        {data.planType === "outing" ? (
          <>
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">TheOutHaven Top Picks</p>
                <h2 className="mt-1 text-2xl font-black">Pick the outing that feels right.</h2>
              </div>
              <p className="hidden text-xs font-semibold text-white/35 sm:block">Same results · same order</p>
            </div>

            {displayedPairs.length ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                {displayedPairs.map((pair, index) => {
                  const isCurrent = String(pair.restaurant.id) === currentRestaurantId && String(pair.activity.id) === currentActivityId;
                  return (
                    <article key={`${pair.restaurant.id}-${pair.activity.id}-${pair.rank}`} className={`flex flex-col rounded-[1.5rem] border bg-[#0b0b0b] p-4 shadow-xl shadow-black/30 ${isCurrent ? "border-[#e1062a] shadow-[0_0_0_1px_rgba(225,6,42,0.2),0_18px_45px_rgba(0,0,0,0.35)]" : index < 3 ? "border-[#e1062a]/30" : "border-white/10"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] ${isCurrent ? "bg-white text-black" : index < 3 ? "bg-[#e1062a] text-white" : "border border-white/10 bg-white/[0.04] text-white/60"}`}>{isCurrent ? "Your Pick" : index < 3 ? "Top Pick" : `Plan ${index + 1}`}</span>
                        {pair.distanceMiles != null ? <span className="text-[10px] font-black text-white/40">{pair.distanceMiles.toFixed(1)} mi apart</span> : null}
                      </div>
                      <div className="mt-4 grid gap-3">
                        <VenuePhoto location={pair.restaurant} label="Restaurant" />
                        <VenuePhoto location={pair.activity} label="Activity" />
                      </div>
                      <button type="button" disabled={saving || isCurrent} onClick={() => updatePick(pair.restaurant, pair.activity, "saved_pair")} className={`mt-5 rounded-full px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] transition ${isCurrent ? "cursor-default border border-[#e1062a]/35 bg-[#e1062a]/10 text-[#ff8297]" : "bg-[#e1062a] text-white hover:bg-[#ff1744] disabled:opacity-50"}`}>{isCurrent ? "Current Plan" : saving ? "Updating…" : "Use This Plan →"}</button>
                    </article>
                  );
                })}
              </div>
            ) : <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm font-semibold text-white/50">The original pair cards are no longer available, but you can still build from the saved choices below.</p>}

            <section className="mt-12 border-t border-white/10 pt-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Build My Own</p>
                  <h2 className="mt-1 text-2xl font-black">Mix the original choices.</h2>
                  <p className="mt-2 text-sm font-semibold text-white/45">Choose one restaurant and one activity from the same result set.</p>
                </div>
                <button type="button" onClick={() => setShowBuilder((value) => !value)} className="rounded-full border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white/70">{showBuilder ? "Hide Builder" : "Build My Own"}</button>
              </div>

              {showBuilder ? (
                <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_310px]">
                  <div>
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.15em] text-white/40">1 · Restaurant</p>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                      {data.restaurants.slice(0, 12).map((item) => <ChoiceCard key={String(item.id)} location={item} type="restaurant" selected={String(restaurant?.id || "") === String(item.id)} onSelect={() => setRestaurant(item)} />)}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.15em] text-white/40">2 · Activity</p>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                      {data.activities.slice(0, 12).map((item) => <ChoiceCard key={String(item.id)} location={item} type="activity" selected={String(activity?.id || "") === String(item.id)} onSelect={() => setActivity(item)} />)}
                    </div>
                  </div>
                  <aside className="h-fit rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-5 xl:sticky xl:top-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e1062a]">Your Outing</p>
                    <div className="mt-4 space-y-3 text-sm font-bold">
                      <p className="rounded-xl bg-black/30 p-3"><span className="block text-[9px] uppercase tracking-[0.12em] text-white/30">Restaurant</span><span className="mt-1 block">{restaurant ? nameFor(restaurant) : "Choose a restaurant"}</span></p>
                      <p className="rounded-xl bg-black/30 p-3"><span className="block text-[9px] uppercase tracking-[0.12em] text-white/30">Activity</span><span className="mt-1 block">{activity ? nameFor(activity) : "Choose an activity"}</span></p>
                    </div>
                    <button type="button" disabled={!restaurant || !activity || saving} onClick={() => updatePick(restaurant, activity, "custom_pair")} className="mt-5 w-full rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Updating…" : "Use My Outing →"}</button>
                  </aside>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(data.planType === "restaurant" ? data.restaurants : data.activities).slice(0, 12).map((item, index) => {
              const isCurrent = String(item.id) === (data.planType === "restaurant" ? currentRestaurantId : currentActivityId);
              return (
                <article key={String(item.id)} className={`overflow-hidden rounded-[1.5rem] border bg-[#0b0b0b] p-4 ${isCurrent ? "border-[#e1062a]" : "border-white/10"}`}>
                  <VenuePhoto location={item} label={data.planType} />
                  <div className="mt-4 flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">{isCurrent ? "Your Pick" : `Option ${index + 1}`}</span><button type="button" disabled={isCurrent || saving} onClick={() => updatePick(data.planType === "restaurant" ? item : null, data.planType === "activity" ? item : null, "saved_single")} className="rounded-full bg-[#e1062a] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] disabled:opacity-40">{isCurrent ? "Current" : "Choose"}</button></div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
