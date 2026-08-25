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

type PlannedTime = {
  plannedFor?: string | null;
  timezone?: string | null;
  dateContext?: string | null;
  confidence?: "none" | "date_only" | "exact" | null;
  shouldSchedulePreOutingReminders?: boolean | null;
  nextMorningFollowupDate?: string | null;
};

type SearchPayload = {
  restaurants?: LocationCard[];
  activities?: LocationCard[];
  sameVenueResults?: LocationCard[];
  same_venue_results?: LocationCard[];
  pairs?: PairCard[];
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

function track(eventName: string, metadata: Record<string, unknown>) {
  try {
    trackClientEvent({ event_name: eventName, source: "guided_create", metadata });
  } catch {
    // Analytics must never interrupt picking a plan.
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

function detailHref(location: LocationCard) {
  return getLocationDetailHref({
    id: location.id,
    type: location.detail_location_type || location.location_type,
    sourceTable: location.source_table || location.sourceTable,
    location,
  });
}

function metaFor(location: LocationCard) {
  return [
    location.cuisine || location.cuisine_type || location.activity_type || location.primary_category,
    location.city,
    location.state,
  ].filter(Boolean).join(" · ");
}

function whyFor(value: PairCard | LocationCard | null) {
  if (!value) return null;
  const direct = value.whyMatched || value.why_it_matched;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return Array.isArray(value.matchReasons) && value.matchReasons.length
    ? value.matchReasons.filter(Boolean).slice(0, 2).join(" · ")
    : null;
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

function sponsorId(value: PlacementFields | null | undefined) {
  return value?.sponsor_id ? String(value.sponsor_id) : null;
}

function buildCompletePairs(payload: SearchPayload | null | undefined): CompletePair[] {
  if (!payload) return [];
  const paired = (payload.pairs || [])
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

  return [...paired, ...sameVenue];
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

function MiniLocation({ location, label }: { location: LocationCard; label: string }) {
  const image = imageFor(location);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/35">
      <div className="grid grid-cols-[92px_1fr] sm:grid-cols-[112px_1fr]">
        <div className="relative min-h-24 bg-white/5">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover" />
          ) : <div className="flex h-full items-center justify-center text-2xl">📍</div>}
        </div>
        <div className="min-w-0 p-3.5">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#e1062a]">{label}</p>
          <h3 className="mt-1 truncate text-base font-black">{nameFor(location)}</h3>
          {metaFor(location) ? <p className="mt-1 truncate text-xs font-semibold text-white/45">{metaFor(location)}</p> : null}
        </div>
      </div>
    </div>
  );
}

function PairCardView({
  item,
  rank,
  premium,
  onUse,
}: {
  item: CompletePair;
  rank: number;
  premium: boolean;
  onUse: () => void;
}) {
  const sponsored = isSponsored(item.placement);
  const distance = distanceFor(item.pair);
  const route = item.resultType === "pair"
    ? buildGoogleDirectionsUrl({
        origin: item.restaurant,
        destination: item.activity,
        travelMode: Number(item.pair?.walkingMinutes) > 0 ? "walking" : "driving",
      })
    : null;

  return (
    <article className={`rounded-[1.4rem] border bg-[#0b0b0b] p-4 shadow-xl shadow-black/30 ${premium ? "border-[#e1062a]/35" : "border-white/10"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${sponsored ? "bg-white text-black" : premium ? "bg-[#e1062a] text-white" : "border border-white/10 bg-white/[0.04] text-white/55"}`}>
          {sponsored ? "Sponsored" : premium ? "TheOutHaven Top Pick" : `Plan ${rank}`}
        </span>
        <div className="flex items-center gap-2">
          {distance ? <span className="text-[10px] font-black text-white/45">{distance}</span> : null}
          <span className="text-[10px] font-black text-white/25">#{rank}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {item.resultType === "same_venue" ? (
          <MiniLocation location={item.restaurant} label="Restaurant + Activity · Same venue" />
        ) : (
          <>
            <MiniLocation location={item.restaurant} label="Restaurant" />
            <MiniLocation location={item.activity} label="Activity" />
          </>
        )}
      </div>

      {whyFor(item.pair || item.restaurant) ? (
        <p className="mt-4 line-clamp-2 text-sm font-semibold leading-6 text-white/50">{whyFor(item.pair || item.restaurant)}</p>
      ) : null}

      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={onUse} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] transition hover:bg-[#ff1744]">
          Use This Plan →
        </button>
        {route ? (
          <a
            href={route}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("planner_pick_route_clicked", { step: 3, rank, placement_group: premium ? "premium" : "organic", sponsored })}
            className="rounded-full border border-white/10 px-4 py-3 text-xs font-black text-white/65"
          >
            Route
          </a>
        ) : null}
      </div>
    </article>
  );
}

function BuilderChoice({
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
    <article className={`overflow-hidden rounded-2xl border transition ${selected ? "border-[#e1062a]/70 bg-[#e1062a]/10" : "border-white/10 bg-[#0b0b0b]"}`}>
      <div className="grid grid-cols-[92px_1fr]">
        <div className="relative min-h-28 bg-white/5">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover" />
          ) : <div className="flex h-full items-center justify-center text-2xl">{type === "restaurant" ? "🍽️" : "✨"}</div>}
        </div>
        <div className="min-w-0 p-3.5">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#e1062a]">{type === "restaurant" ? "Restaurant" : "Activity"}</p>
          <h3 className="mt-1 truncate text-sm font-black">{nameFor(location)}</h3>
          <p className="mt-1 truncate text-[11px] font-semibold text-white/45">{metaFor(location)}</p>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={onSelect} className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] ${selected ? "bg-[#e1062a]" : "border border-white/10 bg-white/[0.04] text-white/70"}`}>
              {selected ? "✓ Selected" : "Choose"}
            </button>
            <Link href={detailHref(location)} className="text-[10px] font-black text-white/45 hover:text-white">Details</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function GuidedResultsPageV2() {
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
        const displayedPairs = buildCompletePairs(result).slice(0, 6);
        track("planner_results_viewed", {
          step: 3,
          plan_type: planType,
          pair_count: buildCompletePairs(result).length,
          displayed_pair_count: planType === "outing" ? displayedPairs.length : null,
          restaurant_count: result.restaurants?.length || 0,
          activity_count: result.activities?.length || 0,
          flow_version: FLOW_VERSION,
          journey_version: "four_step",
        });
        track("planner_pick_screen_viewed", { step: 3, plan_type: planType, flow_version: FLOW_VERSION, journey_version: "four_step" });

        if (planType === "outing") {
          displayedPairs.forEach((item, index) => {
            const sponsored = isSponsored(item.placement);
            track("planner_pair_impression", {
              step: 3,
              rank: index + 1,
              placement_group: index < 3 ? (sponsored ? "sponsored" : "top_pick") : "organic",
              placement_slot: index + 1,
              sponsored,
              sponsor_id: sponsorId(item.placement),
              restaurant_id: item.restaurant.id || null,
              activity_id: item.activity.id || null,
              flow_version: FLOW_VERSION,
              journey_version: "four_step",
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
  const completePairs = useMemo(() => buildCompletePairs(result).slice(0, 6), [result]);
  const topPicks = completePairs.slice(0, 3);
  const morePairs = completePairs.slice(3, 6);
  const restaurants = useMemo(() => (result?.restaurants || []).slice(0, 6), [result]);
  const activities = useMemo(() => (result?.activities || []).slice(0, 6), [result]);
  const singles = planType === "restaurant" ? restaurants : activities;
  const hasResults = planType === "outing" ? completePairs.length > 0 : singles.length > 0;

  function openPlan(
    restaurant: LocationCard | null,
    activity: LocationCard | null,
    pair: PairCard | null,
    rank: number | null,
    resultType: string,
    placementGroup: string,
    sponsored = false,
    sponsor = null as string | null,
  ) {
    if (!restaurant && !activity) return;
    const outingTime = outingTimeFrom(result || {});
    const savedPlan: SavedPlan = {
      restaurant,
      activity,
      locations: [restaurant, activity].filter(Boolean) as LocationCard[],
      distancePreference: /\bwalk|walking\b/i.test(prompt) || Number(pair?.walkingMinutes) > 0 ? "walking" : "miles",
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
      journey_version: "four_step",
    });

    const params = new URLSearchParams({ q: prompt, guidedFlow: FLOW_VERSION, journey: "four_step" });
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
    track("planner_build_own_opened", {
      step: 3,
      restaurant_count: restaurants.length,
      activity_count: activities.length,
      flow_version: FLOW_VERSION,
      journey_version: "four_step",
    });
    window.setTimeout(() => builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function useCustomPair() {
    if (!selectedRestaurant || !selectedActivity) return;
    track("planner_custom_pair_selected", {
      step: 3,
      restaurant_id: selectedRestaurant.id || null,
      activity_id: selectedActivity.id || null,
      flow_version: FLOW_VERSION,
      journey_version: "four_step",
    });
    openPlan(selectedRestaurant, selectedActivity, null, null, "custom_pair", "builder");
  }

  return (
    <main className="min-h-screen bg-[#050505] pb-16 text-white">
      <GuidedJourneySteps activeStep={3} className="mx-auto max-w-4xl" />

      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.16),transparent_34%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-7 pt-7 sm:px-6 sm:pb-9 sm:pt-9">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 3 of 4 · Pick</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">
                {planType === "outing" ? "Pick your complete outing." : planType === "restaurant" ? "Pick your restaurant." : "Pick your activity."}
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">
                {planType === "outing" ? "Start with our strongest complete pairs. If none feel right, build your own below." : "Choose the option that fits best and move straight to completing your outing."}
              </p>
            </div>
            <Link href="/create" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black text-white/65 hover:text-white">Start over</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-72 animate-pulse rounded-[1.4rem] border border-white/10 bg-white/[0.035]" />)}</div>
        ) : error ? (
          <div className="rounded-[1.4rem] border border-red-400/20 bg-red-500/10 p-6"><h2 className="text-xl font-black">We couldn’t load your picks.</h2><p className="mt-2 text-sm font-semibold text-red-100/70">{error}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-5 rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Try Again</button></div>
        ) : !hasResults ? (
          <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-6 text-center"><h2 className="text-2xl font-black">No strong picks yet.</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-white/45">Adjust the area or preferences and we’ll try again.</p><Link href="/create" className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Adjust My Plan</Link></div>
        ) : planType === "outing" ? (
          <>
            <div>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e1062a]">Featured first</p><h2 className="mt-1 text-2xl font-black">TheOutHaven top picks</h2></div>
                <p className="max-w-md text-right text-xs font-semibold leading-5 text-white/35">Sponsored placements will always be clearly labeled when enabled.</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                {topPicks.map((item, index) => {
                  const sponsored = isSponsored(item.placement);
                  return <PairCardView key={`${item.restaurant.id}-${item.activity.id}-${index}`} item={item} rank={index + 1} premium onUse={() => openPlan(item.restaurant, item.activity, item.pair, index + 1, item.resultType, sponsored ? "sponsored" : "top_pick", sponsored, sponsorId(item.placement))} />;
                })}
              </div>
            </div>

            {morePairs.length ? (
              <div className="mt-9">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">More strong matches</p>
                <h2 className="mt-1 text-2xl font-black">Three more complete outings</h2>
                <div className="mt-4 grid gap-5 lg:grid-cols-3">
                  {morePairs.map((item, index) => {
                    const rank = index + 4;
                    return <PairCardView key={`${item.restaurant.id}-${item.activity.id}-${rank}`} item={item} rank={rank} premium={false} onUse={() => openPlan(item.restaurant, item.activity, item.pair, rank, item.resultType, "organic", false, null)} />;
                  })}
                </div>
              </div>
            ) : null}

            {restaurants.length && activities.length ? (
              <div className="mt-9 rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-5 text-center sm:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Want more control?</p>
                <h2 className="mt-1 text-xl font-black">Mix your own restaurant and activity.</h2>
                <button type="button" onClick={revealBuilder} className="mt-4 rounded-full border border-[#e1062a]/45 bg-[#e1062a]/10 px-6 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#e1062a]/20">Build My Own Outing ↓</button>
              </div>
            ) : null}

            {showBuilder ? (
              <section ref={builderRef} className="scroll-mt-20 mt-10 rounded-[1.5rem] border border-white/10 bg-black/35 p-5 sm:p-7">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Build my own outing</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">Choose one restaurant and one activity.</h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/50">These are individual matches from the same search, so you can make the combination feel more like you.</p>

                <div className="mt-7 grid gap-8 lg:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between"><h3 className="text-lg font-black">1. Restaurant</h3>{selectedRestaurant ? <span className="text-xs font-black text-emerald-300">✓ Selected</span> : null}</div>
                    <div className="mt-3 grid gap-3">
                      {restaurants.map((location) => <BuilderChoice key={`r-${location.id}`} location={location} type="restaurant" selected={String(location.id) === String(selectedRestaurant?.id)} onSelect={() => { setSelectedRestaurant(location); track("planner_custom_restaurant_selected", { step: 3, location_id: location.id || null }); }} />)}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between"><h3 className="text-lg font-black">2. Activity</h3>{selectedActivity ? <span className="text-xs font-black text-emerald-300">✓ Selected</span> : null}</div>
                    <div className="mt-3 grid gap-3">
                      {activities.map((location) => <BuilderChoice key={`a-${location.id}`} location={location} type="activity" selected={String(location.id) === String(selectedActivity?.id)} onSelect={() => { setSelectedActivity(location); track("planner_custom_activity_selected", { step: 3, location_id: location.id || null }); }} />)}
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-3 mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl">
                  <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Your custom pair</p><p className="mt-1 truncate text-sm font-black">{selectedRestaurant ? nameFor(selectedRestaurant) : "Choose a restaurant"} + {selectedActivity ? nameFor(selectedActivity) : "choose an activity"}</p></div>
                  <button type="button" disabled={!selectedRestaurant || !selectedActivity} onClick={useCustomPair} className="rounded-full bg-[#e1062a] px-6 py-3 text-xs font-black uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-35">Use My Pair →</button>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {singles.map((location, index) => (
              <article key={`${location.id || index}`} className="rounded-[1.4rem] border border-white/10 bg-[#0b0b0b] p-4 shadow-xl shadow-black/30">
                <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e1062a]">Pick {index + 1}</span></div>
                <div className="mt-4"><MiniLocation location={location} label={planType === "restaurant" ? "Restaurant" : "Activity"} /></div>
                {whyFor(location) ? <p className="mt-4 text-sm font-semibold leading-6 text-white/50">{whyFor(location)}</p> : null}
                <div className="mt-5 flex items-center gap-3"><button type="button" onClick={() => openPlan(planType === "restaurant" ? location : null, planType === "activity" ? location : null, null, index + 1, planType, "organic")} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em]">Use This Plan →</button><Link href={detailHref(location)} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black text-white/65">Details</Link></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
