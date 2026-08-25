"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { buildGoogleDirectionsUrl } from "@/lib/googleDirections";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";

type PlanType = "outing" | "restaurant" | "activity";
type LocationCard = Record<string, unknown> & {
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
  latitude?: number | string | null;
  longitude?: number | string | null;
  whyMatched?: string | null;
  why_it_matched?: string | null;
  matchReasons?: string[] | null;
};

type PairCard = {
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

const PLAN_KEY = "theouthaven_plan";
const LOCATION_KEY = "theouthaven_user_location";
const FLOW_VERSION = "guided_create_v1";

function safelyTrack(eventName: string, metadata: Record<string, unknown>) {
  try {
    trackClientEvent({ event_name: eventName, source: "guided_create", metadata });
  } catch {
    // Analytics must not block selection.
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

function locationMeta(location: LocationCard) {
  return [
    location.cuisine || location.cuisine_type || location.activity_type || location.primary_category,
    location.city,
    location.state,
  ].filter(Boolean).join(" · ");
}

function whyFor(value: PairCard | LocationCard) {
  const direct = value.whyMatched || value.why_it_matched;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return Array.isArray(value.matchReasons) && value.matchReasons.length
    ? value.matchReasons.filter(Boolean).slice(0, 2).join(" · ")
    : null;
}

function pairDistance(pair: PairCard) {
  const walking = Number(pair.walkingMinutes);
  if (Number.isFinite(walking) && walking > 0) return `${Math.round(walking)} min walk`;
  const miles = Number(pair.distanceMiles);
  return Number.isFinite(miles) && miles >= 0 ? `${miles.toFixed(1)} mi apart` : null;
}

function readSavedCoordinates() {
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

function LocationMiniCard({ location, label }: { location: LocationCard; label: string }) {
  const image = imageFor(location);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/35">
      <div className="grid grid-cols-[92px_1fr] sm:grid-cols-[128px_1fr]">
        <div className="relative min-h-24 bg-white/5">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={nameFor(location)} className="absolute inset-0 h-full w-full object-cover" />
          ) : <div className="flex h-full items-center justify-center text-2xl">📍</div>}
        </div>
        <div className="min-w-0 p-3.5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a]">{label}</p>
          <h3 className="mt-1 truncate text-base font-black sm:text-lg">{nameFor(location)}</h3>
          {locationMeta(location) ? <p className="mt-1 truncate text-xs font-semibold text-white/45">{locationMeta(location)}</p> : null}
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
    document.title = "Pick Your Plan | TheOutHaven";
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
        safelyTrack("planner_results_viewed", {
          step: 3,
          plan_type: planType,
          pair_count: result.pairs?.length || 0,
          restaurant_count: result.restaurants?.length || 0,
          activity_count: result.activities?.length || 0,
          flow_version: FLOW_VERSION,
          journey_version: "four_step",
        });
        safelyTrack("planner_pick_screen_viewed", {
          step: 3,
          plan_type: planType,
          flow_version: FLOW_VERSION,
          journey_version: "four_step",
        });
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
  const pairs = useMemo(() => (result?.pairs || []).filter((pair) => pair.restaurant && pair.activity).slice(0, 10), [result]);
  const restaurants = useMemo(() => (result?.restaurants || []).slice(0, 10), [result]);
  const activities = useMemo(() => (result?.activities || []).slice(0, 10), [result]);
  const sameVenue = useMemo(() => (result?.sameVenueResults || result?.same_venue_results || []).slice(0, 10), [result]);
  const singleResults = planType === "restaurant" ? restaurants : activities;
  const hasResults = planType === "outing" ? pairs.length > 0 || sameVenue.length > 0 : singleResults.length > 0;

  function openPlan(restaurant: LocationCard | null, activity: LocationCard | null, pair: PairCard | null, rank: number, resultType: string) {
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
    safelyTrack("planner_plan_selected", {
      step: 3,
      plan_type: planType,
      rank,
      result_type: resultType,
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

  return (
    <main className="min-h-screen bg-[#050505] pb-16 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.18),transparent_34%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-8 pt-8 sm:px-6 sm:pb-10 sm:pt-10">
        <div className="mx-auto max-w-6xl">
          <GuidedJourneySteps activeStep={3} className="mx-auto max-w-4xl" />
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step 3 of 4 · Pick</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-5xl">
                {planType === "outing" ? "Pick the outing that feels right." : planType === "restaurant" ? "Pick your restaurant." : "Pick your activity."}
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/50 sm:text-base">We already used your area, timing, and preferences. Choose one and move straight to completing the outing.</p>
            </div>
            <Link href="/create" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black text-white/65 hover:text-white">Start over</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">{[0,1,2,3].map((item) => <div key={item} className="h-64 animate-pulse rounded-[1.4rem] border border-white/10 bg-white/[0.035]" />)}</div>
        ) : error ? (
          <div className="rounded-[1.4rem] border border-red-400/20 bg-red-500/10 p-6"><h2 className="text-xl font-black">We couldn’t load your picks.</h2><p className="mt-2 text-sm font-semibold text-red-100/70">{error}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-5 rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Try Again</button></div>
        ) : !hasResults ? (
          <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-6 text-center"><h2 className="text-2xl font-black">No strong picks yet.</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-white/45">Adjust the area or preferences and we’ll try again.</p><Link href="/create" className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em]">Adjust My Plan</Link></div>
        ) : planType === "outing" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {sameVenue.map((location, index) => (
              <article key={`same-${location.id || index}`} className="rounded-[1.4rem] border border-white/10 bg-[#0b0b0b] p-4 shadow-xl shadow-black/30">
                <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-[#e1062a] px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em]">Same venue</span><span className="text-xs font-bold text-white/35">Pick {index + 1}</span></div>
                <div className="mt-4"><LocationMiniCard location={location} label="Restaurant + Activity" /></div>
                {whyFor(location) ? <p className="mt-4 text-sm font-semibold leading-6 text-white/50">{whyFor(location)}</p> : null}
                <div className="mt-5 flex items-center gap-3"><button type="button" onClick={() => openPlan(location, location, null, index + 1, "same_venue")} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">Use This Plan →</button><Link href={detailHref(location)} onClick={() => safelyTrack("planner_pick_details_clicked", { step: 3, rank: index + 1, result_type: "same_venue" })} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black text-white/65">Details</Link></div>
              </article>
            ))}
            {pairs.map((pair, index) => {
              const route = buildGoogleDirectionsUrl({ origin: pair.restaurant || null, destination: pair.activity || null, travelMode: Number(pair.walkingMinutes) > 0 ? "walking" : "driving" });
              const rank = sameVenue.length + index + 1;
              return (
                <article key={`${pair.restaurant?.id}-${pair.activity?.id}-${index}`} className="rounded-[1.4rem] border border-white/10 bg-[#0b0b0b] p-4 shadow-xl shadow-black/30">
                  <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e1062a]">Plan {rank}</span>{pairDistance(pair) ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black text-white/55">{pairDistance(pair)}</span> : null}</div>
                  <div className="mt-4 grid gap-3"><LocationMiniCard location={pair.restaurant!} label="Restaurant" /><LocationMiniCard location={pair.activity!} label="Activity" /></div>
                  {whyFor(pair) ? <p className="mt-4 text-sm font-semibold leading-6 text-white/50">{whyFor(pair)}</p> : null}
                  <div className="mt-5 flex items-center gap-3"><button type="button" onClick={() => openPlan(pair.restaurant!, pair.activity!, pair, rank, "pair")} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">Use This Plan →</button>{route ? <a href={route} target="_blank" rel="noopener noreferrer" onClick={() => safelyTrack("planner_pick_route_clicked", { step: 3, rank, result_type: "pair" })} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black text-white/65">Route</a> : null}</div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {singleResults.map((location, index) => (
              <article key={`${location.id || index}`} className="rounded-[1.4rem] border border-white/10 bg-[#0b0b0b] p-4 shadow-xl shadow-black/30">
                <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e1062a]">Pick {index + 1}</span></div>
                <div className="mt-4"><LocationMiniCard location={location} label={planType === "restaurant" ? "Restaurant" : "Activity"} /></div>
                {whyFor(location) ? <p className="mt-4 text-sm font-semibold leading-6 text-white/50">{whyFor(location)}</p> : null}
                <div className="mt-5 flex items-center gap-3"><button type="button" onClick={() => openPlan(planType === "restaurant" ? location : null, planType === "activity" ? location : null, null, index + 1, planType)} className="flex-1 rounded-full bg-[#e1062a] px-5 py-3.5 text-xs font-black uppercase tracking-[0.1em] hover:bg-[#ff1744]">Use This Plan →</button><Link href={detailHref(location)} onClick={() => safelyTrack("planner_pick_details_clicked", { step: 3, rank: index + 1, result_type: planType })} className="rounded-full border border-white/10 px-4 py-3 text-xs font-black text-white/65">Details</Link></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
