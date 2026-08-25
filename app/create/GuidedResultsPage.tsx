"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationDetailHref } from "@/lib/locationLinks";
import {
  buildGoogleDirectionsUrl,
  buildGooglePlaceDirectionsUrl,
} from "@/lib/googleDirections";

type PlanType = "outing" | "restaurant" | "activity";

type LocationCard = Record<string, unknown> & {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  price_range?: string | null;
  atmosphere?: string | null;
  rating?: number | null;
  review_count?: number | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  detail_location_type?: string | null;
  location_type?: string | null;
  source_table?: string | null;
  sourceTable?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
  whyMatched?: string | null;
  why_it_matched?: string | null;
  matchReasons?: string[] | null;
};

type PairCard = {
  restaurant?: LocationCard | null;
  activity?: LocationCard | null;
  distanceMiles?: number | null;
  walkingMinutes?: number | null;
  score?: number | null;
  whyMatched?: string | null;
  why_it_matched?: string | null;
  matchReasons?: string[] | null;
};

type PlannedTime = {
  plannedFor?: string | null;
  timezone?: string | null;
  dateContext?: string | null;
  confidence?: "none" | "date_only" | "exact" | null;
  shouldSchedulePreOutingReminders?: boolean | null;
  nextMorningFollowupDate?: string | null;
};

type SearchPayload = {
  success?: boolean;
  message?: string | null;
  reply?: string | null;
  restaurants?: LocationCard[];
  activities?: LocationCard[];
  sameVenueResults?: LocationCard[];
  same_venue_results?: LocationCard[];
  pairs?: PairCard[];
  displayMode?: string | null;
  render_mode?: string | null;
  plannedTime?: PlannedTime | null;
  planned_time?: PlannedTime | null;
  outingDateTimeText?: string | null;
  outingDateLabel?: string | null;
  outingTimeLabel?: string | null;
  parsedDateText?: string | null;
  parsedTimeText?: string | null;
  searchV2?: SearchPayload | null;
};

type OutingTimeValue = {
  plannedFor: string | null;
  timezone: string;
  outingDateContext: string | null;
  outingTimeConfidence: "none" | "date_only" | "exact";
  remindersEnabled: boolean;
  nextMorningFollowupEnabled: boolean;
  nextMorningFollowupDate: string | null;
  outingDateTimeText: string | null;
  outingDateLabel: string | null;
  outingTimeLabel: string | null;
};

type SavedPlan = {
  restaurant?: LocationCard | null;
  activity?: LocationCard | null;
  locations?: LocationCard[];
  distancePreference?: "walking" | "miles";
  savedAt?: number;
  outingTime?: OutingTimeValue;
  outingTiming?: Record<string, unknown>;
};

const PLAN_KEY = "theouthaven_plan";
const LOCATION_KEY = "theouthaven_user_location";

function safelyTrack(eventName: string, metadata: Record<string, unknown>) {
  try {
    trackClientEvent({
      event_name: eventName,
      source: "guided_create",
      metadata,
    });
  } catch {
    // Planner analytics must never block the customer journey.
  }
}

function planTypeFrom(value: string | null): PlanType {
  if (value === "restaurant" || value === "activity") return value;
  return "outing";
}

function laneFor(planType: PlanType) {
  if (planType === "restaurant") return "restaurant";
  if (planType === "activity") return "activity";
  return "mixed";
}

function nameFor(location: LocationCard | null | undefined) {
  return location ? getLocationName(location, "Location") : "Location";
}

function imageFor(location: LocationCard | null | undefined) {
  return location ? getLocationImage(location as never) : null;
}

function detailHref(location: LocationCard) {
  return getLocationDetailHref({
    id: location.id,
    type: location.detail_location_type || location.location_type,
    sourceTable: location.source_table || location.sourceTable,
    location,
  });
}

function locationMeta(location: LocationCard) {
  return [
    location.cuisine || location.cuisine_type || location.activity_type || location.primary_category,
    location.city,
    location.state,
  ]
    .filter(Boolean)
    .join(" · ");
}

function whyFor(value: PairCard | LocationCard) {
  const direct = value.whyMatched || value.why_it_matched;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const reasons = Array.isArray(value.matchReasons) ? value.matchReasons.filter(Boolean) : [];
  return reasons.length ? reasons.slice(0, 2).join(" · ") : null;
}

function pairDistance(pair: PairCard) {
  const walking = Number(pair.walkingMinutes);
  if (Number.isFinite(walking) && walking > 0) return `${Math.round(walking)} min walk`;
  const miles = Number(pair.distanceMiles);
  if (Number.isFinite(miles) && miles >= 0) return `${miles.toFixed(miles < 1 ? 1 : 1)} mi apart`;
  return null;
}

function readSavedCoordinates() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latitude?: unknown; longitude?: unknown };
    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

function outingTimeFrom(payload: SearchPayload): OutingTimeValue {
  const time = payload.plannedTime || payload.planned_time || payload.searchV2?.plannedTime || null;
  const confidence =
    time?.confidence === "exact" || time?.confidence === "date_only" ? time.confidence : "none";

  return {
    plannedFor: time?.plannedFor || null,
    timezone: time?.timezone || "America/New_York",
    outingDateContext: time?.dateContext || null,
    outingTimeConfidence: confidence,
    remindersEnabled: Boolean(time?.shouldSchedulePreOutingReminders),
    nextMorningFollowupEnabled: Boolean(time?.nextMorningFollowupDate),
    nextMorningFollowupDate: time?.nextMorningFollowupDate || null,
    outingDateTimeText: payload.outingDateTimeText || null,
    outingDateLabel: payload.outingDateLabel || payload.parsedDateText || null,
    outingTimeLabel: payload.outingTimeLabel || payload.parsedTimeText || null,
  };
}

function ResultLocation({ location, label }: { location: LocationCard; label: string }) {
  const image = imageFor(location);
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/35">
      <div className="grid grid-cols-[96px_1fr] sm:grid-cols-[132px_1fr]">
        <div className="relative min-h-24 bg-white/5 sm:min-h-28">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl" aria-hidden="true">📍</div>
          )}
        </div>
        <div className="min-w-0 p-3.5 sm:p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a]">{label}</p>
          <h3 className="mt-1 truncate text-base font-black text-white sm:text-lg">{nameFor(location)}</h3>
          {locationMeta(location) ? <p className="mt-1 truncate text-xs font-semibold text-white/45">{locationMeta(location)}</p> : null}
          <Link href={detailHref(location)} className="mt-3 inline-flex text-xs font-black text-white/65 transition hover:text-white">
            Details →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GuidedResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prompt = searchParams.get("prompt")?.trim() || "";
  const planType = planTypeFrom(searchParams.get("planType"));
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    document.title = "Your Plans | TheOutHaven";
    if (!prompt) {
      setLoading(false);
      setError("Your planner request is missing. Start a new plan and we’ll rebuild it.");
      return;
    }

    const controller = new AbortController();
    const coordinates = readSavedCoordinates();
    setLoading(true);
    setError("");

    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        input: prompt,
        selectedSearchLane: laneFor(planType),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
        useCurrentLocation: Boolean(coordinates),
        userLatitude: coordinates?.latitude,
        userLongitude: coordinates?.longitude,
        guidedFlow: "guided_create_v1",
      }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as SearchPayload & { error?: string; message?: string };
        if (!response.ok) throw new Error(data.message || data.error || "We couldn’t build your plans right now.");
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setPayload(data);
        safelyTrack("planner_results_viewed", {
          plan_type: planType,
          pair_count: data.pairs?.length || data.searchV2?.pairs?.length || 0,
          restaurant_count: data.restaurants?.length || data.searchV2?.restaurants?.length || 0,
          activity_count: data.activities?.length || data.searchV2?.activities?.length || 0,
          flow_version: "guided_create_v1",
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "We couldn’t build your plans right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [planType, prompt, retryKey]);

  const result = payload?.searchV2 || payload;
  const pairs = useMemo(() => (result?.pairs || []).filter((pair) => pair.restaurant && pair.activity).slice(0, 10), [result]);
  const restaurants = useMemo(() => (result?.restaurants || []).slice(0, 10), [result]);
  const activities = useMemo(() => (result?.activities || []).slice(0, 10), [result]);
  const sameVenueResults = useMemo(
    () => (result?.sameVenueResults || result?.same_venue_results || []).slice(0, 10),
    [result],
  );

  const hasResults =
    (planType === "outing" && (pairs.length > 0 || sameVenueResults.length > 0)) ||
    (planType === "restaurant" && restaurants.length > 0) ||
    (planType === "activity" && activities.length > 0);

  function openPlan(restaurant: LocationCard | null, activity: LocationCard | null, pair?: PairCard | null) {
    if (!restaurant && !activity) return;
    const outingTime = outingTimeFrom(result || {});
    const walkingRequested = /\bwalk|walking\b/i.test(prompt);
    const savedPlan: SavedPlan = {
      restaurant,
      activity,
      locations: [restaurant, activity].filter(Boolean) as LocationCard[],
      distancePreference: walkingRequested || Number(pair?.walkingMinutes) > 0 ? "walking" : "miles",
      savedAt: Date.now(),
      outingTime,
      outingTiming: {
        outingDateLabel: outingTime.outingDateLabel,
        outingTimeLabel: outingTime.outingTimeLabel,
        outingDateTimeText: outingTime.outingDateTimeText,
        outingTimeConfidence: outingTime.outingTimeConfidence,
      },
    };

    localStorage.setItem(PLAN_KEY, JSON.stringify(savedPlan));
    safelyTrack("planner_plan_selected", {
      plan_type: planType,
      restaurant_id: restaurant?.id || null,
      activity_id: activity?.id || null,
      has_pair: Boolean(restaurant && activity),
      flow_version: "guided_create_v1",
    });

    const params = new URLSearchParams({ q: prompt, guidedFlow: "guided_create_v1" });
    if (outingTime.plannedFor) params.set("plannedFor", outingTime.plannedFor);
    if (outingTime.timezone) params.set("timezone", outingTime.timezone);
    if (outingTime.outingDateContext) params.set("outingDateContext", outingTime.outingDateContext);
    params.set("outingTimeConfidence", outingTime.outingTimeConfidence);
    if (outingTime.outingDateTimeText) params.set("outingDateTimeText", outingTime.outingDateTimeText);
    if (outingTime.outingDateLabel) params.set("outingDateLabel", outingTime.outingDateLabel);
    if (outingTime.outingTimeLabel) params.set("outingTimeLabel", outingTime.outingTimeLabel);
    router.push(`/plan?${params.toString()}`);
  }

  const singleResults = planType === "restaurant" ? restaurants : activities;

  return (
    <main className="min-h-screen bg-[#050505] pb-16 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.18),transparent_34%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-8 pt-20 sm:px-6 sm:pb-10 sm:pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Your TheOutHaven picks</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">
                {planType === "outing" ? "Choose the plan that feels right." : planType === "restaurant" ? "Choose your restaurant." : "Choose your activity."}
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">
                We already used your plan, location, timing, and preferences. Pick one result and you’re done — no second setup flow.
              </p>
            </div>
            <button type="button" onClick={() => router.push("/create")} className="rounded-full border border-white/12 px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/65 transition hover:border-white/25 hover:text-white">
              Start over
            </button>
          </div>

          {prompt ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white/55">
              <span className="font-black text-white/80">You asked:</span> {prompt}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {loading ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-8 text-center sm:p-12">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[#e1062a]" />
            <h2 className="mt-5 text-xl font-black">Building your best matches…</h2>
            <p className="mt-2 text-sm font-semibold text-white/45">Ranking places around everything you already told us.</p>
          </div>
        ) : error ? (
          <div className="rounded-[1.5rem] border border-red-400/20 bg-red-500/10 p-6 sm:p-8">
            <h2 className="text-xl font-black">We couldn’t finish this search.</h2>
            <p className="mt-2 text-sm font-semibold text-red-100/70">{error}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white">Try again</button>
              <button type="button" onClick={() => router.push("/create")} className="rounded-full border border-white/15 px-5 py-3 text-sm font-black text-white/70">Edit plan</button>
            </div>
          </div>
        ) : !hasResults ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-7 sm:p-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">No strong match yet</p>
            <h2 className="mt-2 text-2xl font-black">Try broadening one detail.</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/50">Your preferences are still useful. Go back and adjust the area, timing, or one preference instead of starting a separate results wizard.</p>
            <button type="button" onClick={() => router.push("/create")} className="mt-5 rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white">Edit my plan</button>
          </div>
        ) : planType === "outing" ? (
          <div className="grid gap-5">
            {pairs.map((pair, index) => {
              const restaurant = pair.restaurant!;
              const activity = pair.activity!;
              const route = buildGoogleDirectionsUrl({ origin: restaurant, destination: activity, travelMode: "walking" });
              return (
                <article key={`${String(restaurant.id)}-${String(activity.id)}-${index}`} className={`rounded-[1.65rem] border bg-white/[0.025] p-4 sm:p-5 ${index === 0 ? "border-[#e1062a]/55 shadow-[0_0_36px_rgba(225,6,42,0.08)]" : "border-white/10"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e1062a]">Plan {index + 1}</span>
                        {index === 0 ? <span className="rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-red-100">Best match</span> : null}
                        {pairDistance(pair) ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold text-white/50">{pairDistance(pair)}</span> : null}
                      </div>
                      {whyFor(pair) ? <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/55">{whyFor(pair)}</p> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <ResultLocation location={restaurant} label="Restaurant" />
                    <ResultLocation location={activity} label="Activity" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => openPlan(restaurant, activity, pair)} className="rounded-full bg-[#e1062a] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff1744]">
                      Use This Plan →
                    </button>
                    {route ? <a href={route} target="_blank" rel="noreferrer" className="rounded-full border border-white/12 px-5 py-3 text-xs font-black text-white/65 transition hover:border-white/25 hover:text-white">Route</a> : null}
                  </div>
                </article>
              );
            })}

            {!pairs.length && sameVenueResults.map((location, index) => (
              <article key={`${String(location.id)}-${index}`} className={`rounded-[1.65rem] border bg-white/[0.025] p-4 sm:p-5 ${index === 0 ? "border-[#e1062a]/55" : "border-white/10"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e1062a]">Plan {index + 1}</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold text-white/50">Everything in one place</span>
                </div>
                <div className="mt-4"><ResultLocation location={location} label="Complete venue" /></div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => openPlan(location, null, null)} className="rounded-full bg-[#e1062a] px-6 py-3.5 text-sm font-black text-white">Use This Plan →</button>
                  {buildGooglePlaceDirectionsUrl({ destination: location }) ? <a href={buildGooglePlaceDirectionsUrl({ destination: location })} target="_blank" rel="noreferrer" className="rounded-full border border-white/12 px-5 py-3 text-xs font-black text-white/65">Directions</a> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {singleResults.map((location, index) => {
              const image = imageFor(location);
              const directions = buildGooglePlaceDirectionsUrl({ destination: location });
              return (
                <article key={`${String(location.id)}-${index}`} className={`overflow-hidden rounded-[1.5rem] border bg-white/[0.025] ${index === 0 ? "border-[#e1062a]/50" : "border-white/10"}`}>
                  <div className="relative aspect-[16/8] bg-white/5">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover" />
                    ) : <div className="flex h-full items-center justify-center text-5xl" aria-hidden="true">📍</div>}
                    {index === 0 ? <span className="absolute left-3 top-3 rounded-full bg-[#e1062a] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">Best match</span> : null}
                  </div>
                  <div className="p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e1062a]">{planType === "restaurant" ? "Restaurant" : "Activity"} {index + 1}</p>
                    <h2 className="mt-1 text-xl font-black">{nameFor(location)}</h2>
                    {locationMeta(location) ? <p className="mt-1 text-sm font-semibold text-white/45">{locationMeta(location)}</p> : null}
                    {whyFor(location) ? <p className="mt-3 text-sm font-semibold leading-6 text-white/55">{whyFor(location)}</p> : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openPlan(planType === "restaurant" ? location : null, planType === "activity" ? location : null, null)} className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white">Use This Plan →</button>
                      <Link href={detailHref(location)} className="rounded-full border border-white/12 px-4 py-3 text-xs font-black text-white/65">Details</Link>
                      {directions ? <a href={directions} target="_blank" rel="noreferrer" className="rounded-full border border-white/12 px-4 py-3 text-xs font-black text-white/65">Directions</a> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
