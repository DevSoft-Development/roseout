"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { buildGoogleDirectionsUrl } from "@/lib/googleDirections";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";

type PlanType = "outing" | "restaurant" | "activity";

type PlacementFields = {
  sponsored?: boolean | null;
  isSponsored?: boolean | null;
  is_sponsored?: boolean | null;
  placement_type?: string | null;
  sponsor_id?: string | number | null;
};

type LocationCard = Record<string, unknown> & PlacementFields & {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  city?: string | null;
  state?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  detail_location_type?: string | null;
  location_type?: string | null;
  source_table?: string | null;
  sourceTable?: string | null;
  whyMatched?: string | null;
  why_it_matched?: string | null;
  matchReasons?: string[] | null;
};

type PairCard = PlacementFields & {
  restaurant?: LocationCard | null;
  activity?: LocationCard | null;
  distanceMiles?: number | null;
  walkingMinutes?: number | null;
  whyMatched?: string | null;
  why_it_matched?: string | null;
  matchReasons?: string[] | null;
};

type SearchPayload = {
  restaurants?: LocationCard[];
  activities?: LocationCard[];
  sameVenueResults?: LocationCard[];
  same_venue_results?: LocationCard[];
  pairs?: PairCard[];
  plannedTime?: {
    plannedFor?: string | null;
    timezone?: string | null;
    dateContext?: string | null;
    confidence?: "none" | "date_only" | "exact" | null;
    shouldSchedulePreOutingReminders?: boolean | null;
    nextMorningFollowupDate?: string | null;
  } | null;
  planned_time?: SearchPayload["plannedTime"];
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

type CompletePair = {
  restaurant: LocationCard;
  activity: LocationCard;
  pair: PairCard | null;
  resultType: "pair" | "same_venue";
  placement: PlacementFields;
};

const PLAN_KEY = "theouthaven_plan";
const LOCATION_KEY = "theouthaven_user_location";
const FLOW_VERSION = "guided_create_v1";
const JOURNEY_VERSION = "four_step";
const INTERNAL_REASON = /qualified\s+as|general[_\s-]?activity|nearby options? outside|outside the requested|fallback|candidate pool|search radius|classification|domain qualification|geo relaxation/i;

function track(eventName: string, metadata: Record<string, unknown>) {
  try {
    trackClientEvent({ event_name: eventName, source: "guided_create", metadata });
  } catch {
    // Analytics must never interrupt the customer journey.
  }
}

function planTypeFrom(value: string | null): PlanType {
  return value === "restaurant" || value === "activity" ? value : "outing";
}

function laneFor(planType: PlanType) {
  return planType === "restaurant" ? "restaurant" : planType === "activity" ? "activity" : "mixed";
}

function nameFor(location: LocationCard | null | undefined) {
  return location ? getLocationName(location, "Location") : "Location";
}

function imageFor(location: LocationCard | null | undefined) {
  return location ? getLocationImage(location as never) : null;
}

function metaFor(location: LocationCard) {
  return [
    location.cuisine || location.cuisine_type || location.activity_type || location.primary_category,
    location.city,
    location.state,
  ].filter(Boolean).join(" · ");
}

function detailHref(location: LocationCard) {
  return getLocationDetailHref({
    id: location.id,
    type: location.detail_location_type || location.location_type,
    sourceTable: location.source_table || location.sourceTable,
    location,
  });
}

function cleanReason(value: unknown) {
  if (typeof value !== "string") return null;
  const pieces = value
    .split(/[;•]|\s+·\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .filter((piece) => !INTERNAL_REASON.test(piece));
  return pieces.length ? pieces.slice(0, 2).join(" · ") : null;
}

function customerWhy(value: PairCard | LocationCard | null) {
  if (!value) return null;
  const direct = cleanReason(value.whyMatched) || cleanReason(value.why_it_matched);
  if (direct) return direct;
  const reasons = Array.isArray(value.matchReasons)
    ? value.matchReasons.map(cleanReason).filter((reason): reason is string => Boolean(reason)).slice(0, 2)
    : [];
  return reasons.length ? reasons.join(" · ") : null;
}

function distanceFor(pair: PairCard | null) {
  if (!pair) return null;
  const walking = Number(pair.walkingMinutes);
  if (Number.isFinite(walking) && walking > 0) return `${Math.round(walking)} min walk`;
  const miles = Number(pair.distanceMiles);
  return Number.isFinite(miles) && miles >= 0 ? `${miles.toFixed(1)} mi apart` : null;
}

function isSponsored(value: PlacementFields | null | undefined) {
  return Boolean(
    value?.sponsored ||
      value?.isSponsored ||
      value?.is_sponsored ||
      String(value?.placement_type || "").toLowerCase() === "sponsored",
  );
}

function sponsoredPair(item: CompletePair) {
  return isSponsored(item.placement) || isSponsored(item.restaurant) || isSponsored(item.activity);
}

function sponsorId(item: CompletePair) {
  const value = item.placement.sponsor_id || item.restaurant.sponsor_id || item.activity.sponsor_id;
  return value ? String(value) : null;
}

function completePairs(payload: SearchPayload | null | undefined): CompletePair[] {
  if (!payload) return [];
  const pairs = (payload.pairs || [])
    .filter((pair) => pair.restaurant && pair.activity)
    .map((pair) => ({
      restaurant: pair.restaurant!,
      activity: pair.activity!,
      pair,
      resultType: "pair" as const,
      placement: pair,
    }));
  const sameVenue = (payload.sameVenueResults || payload.same_venue_results || []).map((location) => ({
    restaurant: location,
    activity: location,
    pair: null,
    resultType: "same_venue" as const,
    placement: location,
  }));
  return [...pairs, ...sameVenue];
}

function readCoordinates() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latitude?: unknown; longitude?: unknown };
    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  } catch {
    return null;
  }
}

function outingTimeFrom(payload: SearchPayload): OutingTimeValue {
  const time = payload.plannedTime || payload.planned_time || payload.searchV2?.plannedTime || null;
  const confidence = time?.confidence === "exact" || time?.confidence === "date_only" ? time.confidence : "none";
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

function VenuePanel({ location, label }: { location: LocationCard; label: string }) {
  const image = imageFor(location);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101010]">
      <div className="relative h-32 w-full overflow-hidden bg-white/[0.04] sm:h-36">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={nameFor(location)} className="absolute inset-0 block h-full w-full object-cover object-center" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">📍</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">{label}</span>
      </div>
      <div className="p-3.5">
        <h3 className="truncate text-base font-black">{nameFor(location)}</h3>
        {metaFor(location) ? <p className="mt-1 truncate text-xs font-semibold text-white/45">{metaFor(location)}</p> : null}
      </div>
    </div>
  );
}

function PairCardView({ item, rank, premium, onUse }: { item: CompletePair; rank: number; premium: boolean; onUse: () => void }) {
  const sponsored = sponsoredPair(item);
  const distance = distanceFor(item.pair);
  const reason = customerWhy(item.pair || item.restaurant) || "A strong match for the outing you described.";
  const route = item.resultType === "pair"
    ? buildGoogleDirectionsUrl({
        origin: item.restaurant,
        destination: item.activity,
        travelMode: Number(item.pair?.walkingMinutes) > 0 ? "walking" : "driving",
      })
    : null;

  return (
    <article className={`flex h-full flex-col rounded-[1.5rem] border bg-[#0b0b0b] p-4 shadow-xl shadow-black/30 ${premium ? "border-[#e1062a]/35" : "border-white/10"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] ${sponsored ? "bg-white text-black" : premium ? "bg-[#e1062a] text-white" : "border border-white/10 bg-white/[0.04] text-white/60"}`}>
          {sponsored ? "Sponsored" : premium ? "Top Pick" : `Plan ${rank}`}
        </span>
        <div className="flex items-center gap-2 text-[10px] font-black text-white/40">
          {distance ? <span>{distance}</span> : null}
          <span className="text-white/20">#{rank}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {item.resultType === "same_venue" ? (
          <VenuePanel location={item.restaurant} label="Restaurant + Activity · Same venue" />
        ) : (
          <>
            <VenuePanel location={item.restaurant} label="Restaurant" />
            <VenuePanel location={item.activity} label="Activity" />
          </>
        )}
      </div>

      <p className="mt-4 min-h-12 text-sm font-semibold leading-6 text-white/50">{reason}</p>

      <div className="mt-auto flex items-center gap-2 pt-5">
        <button type="button" onClick={onUse} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] transition hover:bg-[#ff1744]">
          Use This Plan →
        </button>
        {route ? (
          <a href={route} target="_blank" rel="noopener noreferrer" onClick={() => track("planner_pick_route_clicked", { step: 3, rank, placement_group: premium ? "premium" : "organic", sponsored })} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black text-white/65 hover:border-white/20 hover:text-white">
            Route
          </a>
        ) : null}
      </div>
    </article>
  );
}

function SelectorRow({ location, type, selected, onSelect }: { location: LocationCard; type: "restaurant" | "activity"; selected: boolean; onSelect: () => void }) {
  const image = imageFor(location);
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={`grid w-full grid-cols-[72px_minmax(0,1fr)_28px] items-center gap-3 rounded-2xl border p-2.5 text-left transition ${selected ? "border-[#e1062a]/70 bg-[#e1062a]/10" : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]"}`}>
      <div className="relative h-[68px] w-[72px] overflow-hidden rounded-xl bg-white/[0.05]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={nameFor(location)} className="absolute inset-0 block h-full w-full object-cover object-center" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl">{type === "restaurant" ? "🍽️" : "✨"}</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#e1062a]">{type === "restaurant" ? "Restaurant" : "Activity"}</p>
        <h4 className="mt-1 truncate text-sm font-black text-white">{nameFor(location)}</h4>
        <p className="mt-1 truncate text-[11px] font-semibold text-white/40">{metaFor(location)}</p>
      </div>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black ${selected ? "border-[#e1062a] bg-[#e1062a] text-white" : "border-white/15 text-transparent"}`}>✓</span>
    </button>
  );
}

function SelectedSummary({ location, label }: { location: LocationCard | null; label: string }) {
  const image = imageFor(location);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
      {location ? (
        <div className="mt-2 flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0"><p className="truncate text-sm font-black">{nameFor(location)}</p><p className="mt-0.5 truncate text-[11px] font-semibold text-white/40">{metaFor(location)}</p></div>
        </div>
      ) : <p className="mt-2 text-sm font-semibold text-white/35">Not selected yet</p>}
    </div>
  );
}

export default function GuidedResultsPageV3() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prompt = searchParams.get("prompt")?.trim() || "";
  const planType = planTypeFrom(searchParams.get("planType"));
  const builderRef = useRef<HTMLElement | null>(null);
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<LocationCard | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<LocationCard | null>(null);

  useEffect(() => {
    document.title = "Pick Your Plan | TheOutHaven";
    if (!prompt) {
      setLoading(false);
      setError("Your planner request is missing. Start a new plan and we’ll rebuild it.");
      return;
    }
    const controller = new AbortController();
    const coordinates = readCoordinates();
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
        guidedFlow: FLOW_VERSION,
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || data.error || "We couldn’t build your picks right now.");
        return data as SearchPayload;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setPayload(data);
        const result = data.searchV2 || data;
        const displayedPairs = completePairs(result).slice(0, 6);
        track("planner_results_viewed", {
          step: 3,
          plan_type: planType,
          pair_count: completePairs(result).length,
          displayed_pair_count: planType === "outing" ? displayedPairs.length : null,
          restaurant_count: result.restaurants?.length || 0,
          activity_count: result.activities?.length || 0,
          flow_version: FLOW_VERSION,
          journey_version: JOURNEY_VERSION,
        });
        track("planner_pick_screen_viewed", { step: 3, plan_type: planType, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
        if (planType === "outing") {
          displayedPairs.forEach((item, index) => {
            const sponsored = sponsoredPair(item);
            track("planner_pair_impression", {
              step: 3,
              rank: index + 1,
              placement_group: index < 3 ? (sponsored ? "sponsored" : "top_pick") : "organic",
              placement_slot: index + 1,
              sponsored,
              sponsor_id: sponsorId(item),
              restaurant_id: item.restaurant.id || null,
              activity_id: item.activity.id || null,
              flow_version: FLOW_VERSION,
              journey_version: JOURNEY_VERSION,
            });
          });
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "We couldn’t build your picks right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [planType, prompt, retryKey]);

  const result = payload?.searchV2 || payload;
  const displayedPairs = useMemo(() => completePairs(result).slice(0, 6), [result]);
  const topPicks = displayedPairs.slice(0, 3);
  const morePairs = displayedPairs.slice(3, 6);
  const restaurants = useMemo(() => (result?.restaurants || []).slice(0, 6), [result]);
  const activities = useMemo(() => (result?.activities || []).slice(0, 6), [result]);
  const singles = planType === "restaurant" ? restaurants : activities;
  const hasResults = planType === "outing" ? displayedPairs.length > 0 : singles.length > 0;

  function openPlan(restaurant: LocationCard | null, activity: LocationCard | null, pair: PairCard | null, rank: number | null, resultType: string, placementGroup: string, sponsored = false, sponsor: string | null = null) {
    if (!restaurant && !activity) return;
    const outingTime = outingTimeFrom(result || {});
    localStorage.setItem(PLAN_KEY, JSON.stringify({
      restaurant,
      activity,
      locations: [restaurant, activity].filter(Boolean),
      distancePreference: /\bwalk|walking\b/i.test(prompt) || Number(pair?.walkingMinutes) > 0 ? "walking" : "miles",
      savedAt: Date.now(),
      outingTime,
      outingTiming: {
        outingDateLabel: outingTime.outingDateLabel,
        outingTimeLabel: outingTime.outingTimeLabel,
        outingDateTimeText: outingTime.outingDateTimeText,
        outingTimeConfidence: outingTime.outingTimeConfidence,
      },
    }));
    track("planner_plan_selected", {
      step: 3,
      plan_type: planType,
      rank,
      result_type: resultType,
      placement_group: placementGroup,
      sponsored,
      sponsor_id: sponsor,
      restaurant_id: restaurant?.id || null,
      activity_id: activity?.id || null,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    const params = new URLSearchParams({ q: prompt, guidedFlow: FLOW_VERSION, journey: JOURNEY_VERSION });
    if (outingTime.plannedFor) params.set("plannedFor", outingTime.plannedFor);
    params.set("timezone", outingTime.timezone);
    if (outingTime.outingDateContext) params.set("outingDateContext", outingTime.outingDateContext);
    params.set("outingTimeConfidence", outingTime.outingTimeConfidence);
    if (outingTime.outingDateTimeText) params.set("outingDateTimeText", outingTime.outingDateTimeText);
    if (outingTime.outingDateLabel) params.set("outingDateLabel", outingTime.outingDateLabel);
    if (outingTime.outingTimeLabel) params.set("outingTimeLabel", outingTime.outingTimeLabel);
    router.push(`/plan?${params.toString()}`);
  }

  function revealBuilder() {
    setShowBuilder(true);
    track("planner_build_own_opened", { step: 3, restaurant_count: restaurants.length, activity_count: activities.length, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function useCustomPair() {
    if (!selectedRestaurant || !selectedActivity) return;
    track("planner_custom_pair_selected", {
      step: 3,
      restaurant_id: selectedRestaurant.id || null,
      activity_id: selectedActivity.id || null,
      flow_version: FLOW_VERSION,
      journey_version: JOURNEY_VERSION,
    });
    openPlan(selectedRestaurant, selectedActivity, null, null, "custom_pair", "builder");
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-16 text-white">
      <GuidedJourneySteps activeStep={3} className="max-w-5xl" />

      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-7 pt-7 sm:px-6 sm:pb-9 sm:pt-9">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 3 of 4 · Pick</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">{planType === "outing" ? "Pick your complete outing." : planType === "restaurant" ? "Pick your restaurant." : "Pick your activity."}</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">{planType === "outing" ? "Start with our strongest complete pairs. If none feel right, you can build your own combination." : "Choose the option that fits best and move straight to completing your outing."}</p>
            </div>
            <Link href="/create" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black text-white/65 hover:text-white">Start over</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {loading ? (
          <div className="grid gap-5 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-[520px] animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.035]" />)}</div>
        ) : error ? (
          <div className="rounded-[1.4rem] border border-red-400/20 bg-red-500/10 p-6"><h2 className="text-xl font-black">We couldn’t load your picks.</h2><p className="mt-2 text-sm font-semibold text-red-100/70">{error}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-5 rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Try Again</button></div>
        ) : !hasResults ? (
          <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-6 text-center"><h2 className="text-2xl font-black">No strong picks yet.</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-white/45">Adjust the area or preferences and we’ll try again.</p><Link href="/create" className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Adjust My Plan</Link></div>
        ) : planType === "outing" ? (
          <>
            <div>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Curated for your plan</p><h2 className="mt-1 text-2xl font-black">TheOutHaven Top Picks</h2></div>
                <p className="max-w-md text-xs font-semibold leading-5 text-white/35">Paid placements will always be clearly marked Sponsored.</p>
              </div>
              <div className="grid items-stretch gap-5 lg:grid-cols-3">
                {topPicks.map((item, index) => {
                  const sponsored = sponsoredPair(item);
                  return <PairCardView key={`${item.restaurant.id}-${item.activity.id}-${index}`} item={item} rank={index + 1} premium onUse={() => openPlan(item.restaurant, item.activity, item.pair, index + 1, item.resultType, sponsored ? "sponsored" : "top_pick", sponsored, sponsorId(item))} />;
                })}
              </div>
            </div>

            {morePairs.length ? (
              <div className="mt-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">More strong matches</p>
                <h2 className="mt-1 text-2xl font-black">More complete outings</h2>
                <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-3">
                  {morePairs.map((item, index) => {
                    const rank = index + 4;
                    return <PairCardView key={`${item.restaurant.id}-${item.activity.id}-${rank}`} item={item} rank={rank} premium={false} onUse={() => openPlan(item.restaurant, item.activity, item.pair, rank, item.resultType, "organic")} />;
                  })}
                </div>
              </div>
            ) : null}

            {restaurants.length && activities.length ? (
              <div className="mt-10 rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Prefer to choose each stop?</p><h2 className="mt-1 text-xl font-black">Build your own complete outing.</h2><p className="mt-1 text-sm font-semibold text-white/45">Mix a restaurant and activity from the same search results.</p></div>
                <button type="button" onClick={revealBuilder} className="mt-4 shrink-0 rounded-full border border-[#e1062a]/45 bg-[#e1062a]/10 px-6 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#e1062a]/20 sm:mt-0">Build My Own Outing ↓</button>
              </div>
            ) : null}

            {showBuilder ? (
              <section ref={builderRef} className="scroll-mt-20 mt-10 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0b0b] shadow-2xl shadow-black/35">
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_left,rgba(225,6,42,0.13),transparent_40%)] px-5 py-5 sm:px-7">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Outing Builder</p><h2 className="mt-1 text-2xl font-black sm:text-3xl">Build your own outing</h2><p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-white/45">Choose one restaurant and one activity. Your selections stay visible while you compare options.</p></div>
                    <button type="button" onClick={() => setShowBuilder(false)} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/55 hover:text-white">Close</button>
                  </div>
                </div>

                <div className="grid gap-5 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_310px]">
                  <div className="rounded-[1.3rem] border border-white/10 bg-black/25 p-4">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#e1062a]">Restaurant</p><h3 className="mt-1 text-lg font-black">Choose where to eat</h3></div>{selectedRestaurant ? <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-black text-emerald-300">✓ Selected</span> : null}</div>
                    <div className="mt-4 max-h-[500px] space-y-2.5 overflow-y-auto pr-1">
                      {restaurants.map((location) => <SelectorRow key={`r-${location.id}`} location={location} type="restaurant" selected={String(location.id) === String(selectedRestaurant?.id)} onSelect={() => { setSelectedRestaurant(location); track("planner_custom_restaurant_selected", { step: 3, location_id: location.id || null, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION }); }} />)}
                    </div>
                  </div>

                  <div className="rounded-[1.3rem] border border-white/10 bg-black/25 p-4">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#e1062a]">Activity</p><h3 className="mt-1 text-lg font-black">Choose what to do</h3></div>{selectedActivity ? <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-black text-emerald-300">✓ Selected</span> : null}</div>
                    <div className="mt-4 max-h-[500px] space-y-2.5 overflow-y-auto pr-1">
                      {activities.map((location) => <SelectorRow key={`a-${location.id}`} location={location} type="activity" selected={String(location.id) === String(selectedActivity?.id)} onSelect={() => { setSelectedActivity(location); track("planner_custom_activity_selected", { step: 3, location_id: location.id || null, flow_version: FLOW_VERSION, journey_version: JOURNEY_VERSION }); }} />)}
                    </div>
                  </div>

                  <aside className="self-start rounded-[1.3rem] border border-[#e1062a]/25 bg-[#e1062a]/[0.055] p-4 xl:sticky xl:top-24">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a]">Your Outing</p>
                    <h3 className="mt-1 text-xl font-black">Your custom pair</h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-white/40">Pick one from each column, then continue directly to Complete Outing.</p>
                    <div className="mt-4 space-y-3"><SelectedSummary location={selectedRestaurant} label="Restaurant" /><SelectedSummary location={selectedActivity} label="Activity" /></div>
                    <button type="button" disabled={!selectedRestaurant || !selectedActivity} onClick={useCustomPair} className="mt-5 w-full rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744] disabled:cursor-not-allowed disabled:opacity-35">Use My Pair →</button>
                  </aside>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {singles.map((location, index) => {
              const reason = customerWhy(location) || "A strong match for the outing you described.";
              return (
                <article key={`${location.id || index}`} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b0b0b] shadow-xl shadow-black/30">
                  <VenuePanel location={location} label={planType === "restaurant" ? "Restaurant" : "Activity"} />
                  <div className="p-5"><p className="text-sm font-semibold leading-6 text-white/50">{reason}</p><div className="mt-5 flex items-center gap-3"><button type="button" onClick={() => openPlan(planType === "restaurant" ? location : null, planType === "activity" ? location : null, null, index + 1, planType, "organic")} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em]">Use This Plan →</button><Link href={detailHref(location)} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black text-white/65">Details</Link></div></div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
