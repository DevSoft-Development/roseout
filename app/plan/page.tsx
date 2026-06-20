"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  trackLocationEvent,
  type LocationAnalyticsMetadata,
} from "@/lib/location-analytics";
import { useTrackLocationView } from "@/hooks/useTrackLocationView";
import { useSearchParams } from "next/navigation";
import {
  buildGoogleDirectionsUrl,
  buildGooglePlaceDirectionsUrl,
} from "@/lib/googleDirections";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationDetailHref } from "@/lib/locationLinks";
import { getCuisine, getPrimaryCategory } from "@/lib/locationFields";
import { toDisplayLabel } from "@/lib/displayLabel";
import OutingTimeSelector from "@/components/outings/OutingTimeSelector";
import { emptyOutingTimeValue, getBrowserTimezone, type OutingTimeValue } from "@/lib/outings/planned-time-client";
import { formatDistanceFromRestaurant } from "@/lib/search/enterprise/distance";
import { formatFullAddress } from "@/lib/address-utils";
import type { LocationScoreFields } from "@/lib/locationScore";
import {
  getExternalReservationUrl,
  getInternalReservationHref,
} from "@/lib/reservation";

type PlanLocation = LocationScoreFields & {
  id?: string;
  restaurant_name?: string | null;
  activity_name?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  google_maps_url?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  food_type?: string | null;
  cuisine_type?: string | null;
  cuisine_tags?: string[] | null;
  activity_type?: string | null;
  tags?: string[] | null;
  google_types?: string[] | null;
  detail_location_type?: "restaurants" | "activities" | null;
  source_table?: string | null;
  sourceTable?: string | null;
  location_type?: string | null;
  type?: string | null;
  primary_tag?: string | null;
  price_range?: string | null;
  atmosphere?: string | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  rating?: number | null;
  review_count?: number | null;
  website?: string | null;
  phone?: string | null;
  external_reservation_url?: string | null;
  reservation_url?: string | null;
  reservation_link?: string | null;
  reservation_enabled?: boolean | null;
  booking_url?: string | null;
  smart_match_score?: number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  pair_distance_miles?: number | null;
  pair_walking_minutes?: number | null;
  walkingDurationMinutes?: number | null;
  googleWalkingDurationMinutes?: number | null;
  routeDurationMinutes?: number | null;
  walking_route_minutes?: number | null;
  pair_walking_label?: string | null;
};

type SavedPlan = {
  restaurant?: PlanLocation | null;
  activity?: PlanLocation | null;
  locations?: PlanLocation[];
  distancePreference?: "walking" | "miles";
  campaignSlug?: string;
  planExact?: boolean;
  savedAt?: number;
  outingTime?: OutingTimeValue;
};

type ExactCampaignLocation = {
  id: string;
  sourceTable: string;
  sourceId: string;
  name: string;
  type: "restaurant" | "activity";
  imageUrl?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  description?: string | null;
  primaryCategory?: string | null;
  [key: string]: unknown;
};

type CampaignLocationResponse = {
  location?: ExactCampaignLocation;
  error?: string;
};

const PLAN_KEY = "theouthaven_plan";
const PLAN_ANALYTICS_METADATA: LocationAnalyticsMetadata = {
  source_page: "/plan",
  source_section: "outing_card",
};

type ExternalPlanEvent =
  | "reservation_started"
  | "phone_click"
  | "website_click"
  | "share_click"
  | "directions_click"
  | "search_click";

function trackPlanExternalAction(
  locationId: string | null | undefined,
  eventType: ExternalPlanEvent,
  metadata: Record<string, unknown> = {},
) {
  if (!locationId) return;

  fetch("/api/analytics/location-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      location_id: locationId,
      event_type: eventType,
      event_source: "plan",
      source_page: "/plan",
      source_section: "outing_actions",
      metadata,
    }),
  }).catch(() => undefined);
}

function buildTrackedOutboundHref({
  to,
  outingId,
  locationId,
  sourceLocationId,
  type,
  locationType,
  planTitle,
}: {
  to: string;
  outingId?: string | null;
  locationId?: string | null;
  sourceLocationId?: string | null;
  type: "details" | "directions" | "reservation" | "phone" | "website" | "share" | "replace" | "add_stop" | "other";
  locationType?: "restaurant" | "activity" | "mixed" | "unknown";
  planTitle?: string | null;
}) {
  const params = new URLSearchParams({
    to,
    type,
    locationType: locationType || "unknown",
    source: "plan_page",
  });
  if (outingId) params.set("outingId", outingId);
  if (locationId) params.set("locationId", locationId);
  if (sourceLocationId) params.set("sourceLocationId", sourceLocationId);
  if (planTitle) params.set("planTitle", planTitle);
  return `/api/track/outbound?${params.toString()}`;
}

function trackPlanAnalyticsEvent(payload: Record<string, unknown>) {
  fetch("/api/analytics/plan-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ page_path: "/plan", source: "plan_page", ...payload }),
  }).catch(() => undefined);
}

function buildCreateHref(prompt: string) {
  const params = new URLSearchParams({ prompt });
  return `/create?${params.toString()}`;
}

export default function PlanPage() {
  return (
    <Suspense fallback={<PlanLoading />}>
      <PlanPageInner />
    </Suspense>
  );
}

function PlanPageInner() {
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loadingExactCampaign, setLoadingExactCampaign] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [bookingSaveStatus, setBookingSaveStatus] = useState("");
  const [showBookingDetails, setShowBookingDetails] = useState(false);
  const [outingTime, setOutingTime] = useState<OutingTimeValue>(() =>
    emptyOutingTimeValue(getBrowserTimezone()),
  );
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [emailOptIn, setEmailOptIn] = useState(true);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [contactMethod, setContactMethod] = useState<"text" | "email">("email");
  const [showTimingAdjustments, setShowTimingAdjustments] = useState(false);
  const [mainEventMinutes, setMainEventMinutes] = useState(120);
  const [afterPlanMinutes, setAfterPlanMinutes] = useState<number | null>(90);
  const [startStatus, setStartStatus] = useState("");
  const [activeOutingId, setActiveOutingId] = useState<string | null>(null);
  const [activePlanUrl, setActivePlanUrl] = useState<string | null>(null);
  const [confirmationTrackedFor, setConfirmationTrackedFor] = useState<string | null>(null);

  function toPlanLocation(location: ExactCampaignLocation): PlanLocation {
    return {
      ...location,
      id: location.sourceId || location.id,
      name: location.name,
      restaurant_name: location.type === "restaurant" ? location.name : null,
      activity_name: location.type === "activity" ? location.name : null,
      address: location.address || null,
      city: location.city || null,
      state: location.state || null,
      description: location.description || null,
      primary_category: location.primaryCategory || null,
      cuisine_type:
        location.type === "restaurant"
          ? location.primaryCategory || null
          : null,
      activity_type:
        location.type === "activity" ? location.primaryCategory || null : null,
      detail_location_type:
        location.type === "activity" ? "activities" : "restaurants",
      main_image: location.imageUrl || null,
      image_url: location.imageUrl || null,
    } as PlanLocation;
  }

  async function loadExactCampaignPlan(campaignSlug: string) {
    setLoadingExactCampaign(true);

    try {
      const params = new URLSearchParams({
        campaignSlug,
        planExact: "true",
      });
      const locationId = searchParams.get("locationId");
      if (locationId) params.set("locationId", locationId);
      const sourceTable = searchParams.get("sourceTable");
      if (sourceTable) params.set("sourceTable", sourceTable);

      const response = await fetch(
        `/api/marketing/campaign-location?${params.toString()}`,
      );
      const data: CampaignLocationResponse = await response.json();

      if (!response.ok || !data.location) {
        throw new Error(data.error || "Campaign location not found.");
      }

      const card = toPlanLocation(data.location);
      const nextPlan: SavedPlan = {
        restaurant: data.location.type === "restaurant" ? card : null,
        activity: data.location.type === "activity" ? card : null,
        locations: [card],
        distancePreference: "miles",
        campaignSlug,
        planExact: true,
        savedAt: Date.now(),
        outingTime,
      };

      localStorage.setItem(PLAN_KEY, JSON.stringify(nextPlan));
      setPlan(nextPlan);
    } catch {
      setPlan(null);
    } finally {
      setLoadingExactCampaign(false);
    }
  }


  function outingTimeFromUrl(base: OutingTimeValue) {
    const confidence = searchParams.get("outingTimeConfidence");
    if (!confidence && !searchParams.get("plannedFor") && !searchParams.get("outingDateContext")) return base;
    return {
      plannedFor: searchParams.get("plannedFor"),
      timezone: searchParams.get("timezone") || base.timezone,
      outingDateContext: searchParams.get("outingDateContext"),
      outingTimeConfidence:
        confidence === "exact" || confidence === "date_only" || confidence === "none"
          ? confidence
          : base.outingTimeConfidence,
      remindersEnabled: searchParams.get("remindersEnabled") === "true",
      nextMorningFollowupEnabled: false,
      nextMorningFollowupDate: null,
      outingDateTimeText: searchParams.get("outingDateTimeText"),
      outingDateLabel: searchParams.get("outingDateLabel"),
      outingTimeLabel: searchParams.get("outingTimeLabel"),
    } as OutingTimeValue;
  }

  useEffect(() => {
    document.title = "Your TheOutHaven Plan | TheOutHaven";

    window.setTimeout(() => {
      setMounted(true);

      const campaignSlug = searchParams.get("campaignSlug");
      const planExact = searchParams.get("planExact") === "true";

      try {
        const active = localStorage.getItem("theouthaven_active_outing");
        if (active) {
          const parsedActive = JSON.parse(active) as { outingId?: string; planUrl?: string };
          setActiveOutingId(parsedActive.outingId || null);
          setActivePlanUrl(parsedActive.planUrl || null);
        }
        const saved = localStorage.getItem(PLAN_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as SavedPlan;
          const savedMatchesCampaign =
            !campaignSlug ||
            parsed.campaignSlug === campaignSlug ||
            parsed.planExact;
          if (savedMatchesCampaign && (parsed.restaurant || parsed.activity)) {
            const nextOutingTime = outingTimeFromUrl(parsed.outingTime || emptyOutingTimeValue(getBrowserTimezone()));
            const nextPlan = { ...parsed, outingTime: nextOutingTime };
            setOutingTime(nextOutingTime);
            setPlan(nextPlan);
            localStorage.setItem(PLAN_KEY, JSON.stringify(nextPlan));
            return;
          }
        }
      } catch {
        setPlan(null);
      }

      if (planExact && campaignSlug) {
        loadExactCampaignPlan(campaignSlug);
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const restaurant = plan?.restaurant || null;
  const activity = plan?.activity || null;

  const hasPlan = Boolean(restaurant || activity);
  const distancePreference = plan?.distancePreference || "miles";
  const walkingRouteUrl = buildGoogleDirectionsUrl({
    origin: restaurant,
    destination: activity,
    travelMode: "walking",
  });
  const drivingRouteUrl = buildGoogleDirectionsUrl({
    origin: restaurant,
    destination: activity,
    travelMode: "driving",
  });

  const planTitle = useMemo(() => {
    const names = [
      restaurant ? getLocationName(restaurant, "") : "",
      activity ? getLocationName(activity, "") : "",
    ].filter(Boolean);

    return names.length ? names.join(" + ") : "Your TheOutHaven Plan";
  }, [restaurant, activity]);


  async function saveBookedOutingToDashboard() {
    setBookingSaveStatus("");
    const payload = {
      title: planTitle,
      prompt: searchParams.get("q") || planTitle,
      outing_date: outingTime.plannedFor || null,
      restaurant_id: restaurant?.id || null,
      restaurant_name: restaurant ? getLocationName(restaurant, "") : null,
      restaurant_address: restaurant?.address || null,
      restaurant_image: getLocationImage(restaurant as any) || null,
      restaurant_url: getExternalReservationUrl(restaurant as any) || restaurant?.website || null,
      activity_id: activity?.id || null,
      activity_name: activity ? getLocationName(activity, "") : null,
      activity_address: activity?.address || null,
      activity_image: getLocationImage(activity as any) || null,
      activity_url: activity?.website || null,
      plan_payload: { plan, outingTime, activeOutingId, activePlanUrl },
      source: "book_my_outing",
      status: "booked",
    };
    try {
      const response = await fetch("/api/user/outings/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        try { localStorage.setItem("theouthaven_pending_booked_outing", JSON.stringify(payload)); } catch {}
        setBookingSaveStatus("Create a free account or log in to save this outing to your dashboard.");
        return;
      }
      setBookingSaveStatus(data.success ? "Your outing was saved to your dashboard." : "We could not save this to your dashboard yet, but you can continue booking.");
    } catch {
      setBookingSaveStatus("We could not save this to your dashboard yet, but you can continue booking.");
    }
  }
  useEffect(() => {
    if (!activeOutingId || confirmationTrackedFor === activeOutingId) return;
    setConfirmationTrackedFor(activeOutingId);
    trackPlanAnalyticsEvent({
      event_name: "plan_confirmation_viewed",
      event_type: "conversion",
      conversion_step: "saved_plan",
      outing_id: activeOutingId,
      location_id: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null,
      source_location_id: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null,
      query: planTitle,
      metadata: { plan_title: planTitle, plan_url: activePlanUrl },
    });
  }, [activeOutingId, activePlanUrl, activity, confirmationTrackedFor, planTitle, restaurant]);

  const completionPrompt =
    restaurant && activity
      ? `Find another idea like ${getLocationName(restaurant)} and ${getLocationName(activity)}`
      : restaurant
        ? `Add an activity near ${getLocationName(restaurant)}`
        : activity
          ? `Add a restaurant near ${getLocationName(activity)}`
          : "Plan a restaurant and activity nearby";

  function saveCurrentPlan() {
    if (!plan) return;

    const nextPlan = { ...plan, outingTime, savedAt: Date.now() };
    localStorage.setItem(PLAN_KEY, JSON.stringify(nextPlan));
    setPlan(nextPlan);
    setSaveStatus("Saved — you can come back to this plan from this device.");

    [restaurant, activity].forEach((location) => {
      if (location?.id)
        trackLocationEvent(
          String(location.id),
          "save",
          PLAN_ANALYTICS_METADATA,
        );
    });
  }

  async function shareCurrentPlan() {
    const url = window.location.href;
    const text = `TheOutHaven plan: ${planTitle}`;
    const hasNativeShare = typeof navigator.share === "function";

    try {
      if (hasNativeShare) {
        await navigator.share({ title: planTitle, text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }

      setShareStatus(
        hasNativeShare ? "Share sheet opened." : "Plan link copied.",
      );
      [restaurant, activity].forEach((location) => {
        if (location?.id)
          trackPlanExternalAction(String(location.id), "share_click", {
            plan_title: planTitle,
          });
      });
    } catch {
      setShareStatus("Share was cancelled — your plan is still saved here.");
    }
  }


  async function savePlanAndFollowUp() {
    if (!plan) return;
    const primaryLocation = restaurant || activity;
    if (!primaryLocation?.id) {
      setStartStatus("Choose a location before saving your outing.");
      return;
    }
    if (contactMethod === "email" && !guestEmail.trim()) {
      setStartStatus("Add an email so we can send your outing plan.");
      return;
    }
    if (contactMethod === "text" && !guestPhone.trim()) {
      setStartStatus("Add a phone number so we can text your outing plan.");
      return;
    }
    setStartStatus("Saving your outing...");
    try {
      const response = await fetch("/api/outings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: String(primaryLocation.id),
          restaurantLocationId: restaurant?.id ? String(restaurant.id) : null,
          activityLocationId: activity?.id ? String(activity.id) : null,
          source: "plan_page",
          planTitle,
          sourceQuery: searchParams.get("q") || planTitle,
          page_path: "/plan",
          selectedLocations: { restaurant, activity },
          plannedFor: outingTime.plannedFor,
          timezone: outingTime.timezone,
          outingDateContext: outingTime.outingDateContext,
          outingTimeConfidence: outingTime.outingTimeConfidence,
          remindersEnabled: outingTime.remindersEnabled,
          outingTiming: { outingDateLabel: outingTime.outingDateLabel ?? null, outingTimeLabel: outingTime.outingTimeLabel ?? null, outingDateTimeText: outingTime.outingDateTimeText ?? null, outingTimeConfidence: outingTime.outingTimeConfidence, parsedDateText: outingTime.parsedDateText ?? null, parsedTimeText: outingTime.parsedTimeText ?? null, parsedDateTimeISO: outingTime.parsedDateTimeISO ?? null },
          guestEmail,
          guestPhone,
          contact_method: contactMethod,
          emailOptIn: contactMethod === "email" ? true : emailOptIn,
          smsOptIn: contactMethod === "text" ? true : smsOptIn,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setStartStatus(data.message || "We could not save your outing yet.");
        return;
      }
      const nextOutingId = data.outing?.id || data.outing_id || null;
      localStorage.setItem("theouthaven_active_outing", JSON.stringify({ outingId: nextOutingId, planUrl: data.planUrl }));
      setActiveOutingId(nextOutingId);
      setActivePlanUrl(data.planUrl || null);
      if (contactMethod === "email") {
        if (data.emailStatus === "sent") setStartStatus("Your outing is saved. Check your email for the plan.");
        else if (data.emailStatus === "skipped") setStartStatus("Your outing is saved. Email sending is not configured in this environment.");
        else if (data.emailStatus === "error") setStartStatus("Your outing is saved, but the email could not be sent. You can still open your secure plan link.");
        else setStartStatus("Your outing is saved.");
      } else {
        setStartStatus("Your outing is saved.");
      }
    } catch {
      setStartStatus("We could not save your outing yet.");
    }
  }


  function trackPlanClick(eventName: string, linkType: string) {
    const primaryLocation = restaurant || activity;
    trackPlanAnalyticsEvent({
      event_name: eventName,
      event_type: "plan_click",
      conversion_step: "clicked_outbound_link",
      outing_id: activeOutingId,
      location_id: primaryLocation?.id ? String(primaryLocation.id) : null,
      source_location_id: primaryLocation?.id ? String(primaryLocation.id) : null,
      query: planTitle,
      metadata: { plan_title: planTitle, link_type: linkType },
    });
  }

  if (!mounted) return <PlanLoading />;

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-black text-white">
      <section className="relative border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.22),transparent_34%),linear-gradient(180deg,#050505_0%,#0b0b0b_100%)] px-3 pb-6 pt-24 sm:px-6 sm:pb-10 sm:pt-28 lg:pt-32">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-red-100 sm:px-4 sm:py-2 sm:text-[11px]">
              TheOutHaven Plan
            </div>

            <h1 className="text-[2.35rem] font-black leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Your outing is <span className="text-[#e1062a]">ready.</span>
            </h1>

            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/55 sm:text-base">
              Review your selected places, timeline, and travel details before making your plan official.
            </p>
          </div>

          <div className="rounded-[1.2rem] border border-white/10 bg-[#111]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl sm:rounded-[1.35rem] sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">
              Your Outing Picks
            </p>

            <h2 className="mt-2 break-words text-2xl font-black tracking-[-0.04em] sm:text-3xl">
              {planTitle}
            </h2>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                href="/create"
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-white/70 transition hover:text-white"
              >
                Edit Outing
              </Link>

              <button
                type="button"
                onClick={() => {
                  setShowBookingDetails(true);
                  void saveBookedOutingToDashboard();
                  trackPlanAnalyticsEvent({
                    event_name: "book_my_outing_clicked",
                    event_type: "plan_click",
                    conversion_step: "booking_details_opened",
                    outing_id: activeOutingId,
                    location_id: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null,
                    source_location_id: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null,
                    query: planTitle,
                    metadata: { plan_title: planTitle },
                  });
                  window.setTimeout(() => document.getElementById("booking-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                }}
                className="rounded-full bg-[#e1062a] px-5 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff1744]"
              >
                Book My Outing
              </button>
            </div>
            {bookingSaveStatus && <p className="mt-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs font-bold text-white/70">{bookingSaveStatus}</p>}

          </div>
        </div>
      </section>

      {hasPlan && (
        <section className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
          <div className="mb-4 max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
              Your Outing Picks
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
              Your Outing Picks
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/45">
              Review your selected places, check the details, and make changes before making your plan official.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {restaurant && (
              <PlanActionCard
                label="The Main Event"
                chipLabel="Restaurant pick"
                type="restaurant"
                location={restaurant}
                directionsUrl={buildGooglePlaceDirectionsUrl({
                  destination: restaurant,
                  travelMode: "driving",
                })}
                activeOutingId={activeOutingId}
                planTitle={planTitle}
                showActions={false}
              />
            )}

            {activity && (
              <PlanActionCard
                label="The After Plan"
                chipLabel="Activity pick"
                type="activity"
                location={activity}
                directionsUrl={buildGooglePlaceDirectionsUrl({
                  destination: activity,
                  travelMode: "driving",
                })}
                activeOutingId={activeOutingId}
                planTitle={planTitle}
                showActions={false}
              />
            )}
          </div>
        </section>
      )}

      <section
        id="plan-timeline"
        className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8"
      >
        {!hasPlan ? (
          loadingExactCampaign ? (
            <PlanLoading />
          ) : (
            <EmptyPlan />
          )
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.18fr_0.82fr]">
            <aside className="order-2 h-fit rounded-[1.2rem] border border-white/10 bg-[#080808] p-4 shadow-2xl shadow-black/40 sm:p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
                Review Your Outing
              </p>

              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
                {restaurant && activity
                  ? "Main Event → After Plan"
                  : restaurant
                    ? "Main event selected"
                    : "After plan selected"}
              </h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-white/45">
                Make sure your picks, timing, and travel details look right before making your plan official. {buildPlanSummaryText(restaurant, activity, distancePreference)}
              </p>

              <div className="mt-5 rounded-2xl border border-[#e1062a]/20 bg-[#e1062a]/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-100/70">
                  Next Step
                </p>
                <p className="mt-1 text-sm font-bold leading-6 text-white">
                  Review your timeline, then book your outing when you are ready. Booking actions stay tucked away until you open them.
                </p>
              </div>

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowBookingDetails(true);
                    void saveBookedOutingToDashboard();
                    trackPlanAnalyticsEvent({
                      event_name: "book_my_outing_clicked",
                      event_type: "plan_click",
                      conversion_step: "booking_details_opened",
                      outing_id: activeOutingId,
                      location_id: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null,
                      source_location_id: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null,
                      query: planTitle,
                      metadata: { plan_title: planTitle },
                    });
                    window.setTimeout(() => document.getElementById("booking-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                  }}
                  className="rounded-full bg-[#e1062a] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744]"
                >
                  Book My Outing
                </button>

                <Link
                  href="/create"
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
                >
                  Edit Outing
                </Link>

                <Link
                  href={buildCreateHref(completionPrompt)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
                >
                  Need Another Idea?
                </Link>
              </div>

              {showBookingDetails && (walkingRouteUrl || drivingRouteUrl) && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                    Google Routes
                  </p>
                  <div className="mt-3 grid gap-2">
                    {walkingRouteUrl ? (
                      <a
                        href={buildTrackedOutboundHref({ to: walkingRouteUrl, outingId: activeOutingId, locationId: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null, type: "directions", locationType: "mixed", planTitle })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
                      >
                        Google Walking Route
                      </a>
                    ) : null}

                    {drivingRouteUrl ? (
                      <a
                        href={buildTrackedOutboundHref({ to: drivingRouteUrl, outingId: activeOutingId, locationId: restaurant?.id ? String(restaurant.id) : activity?.id ? String(activity.id) : null, type: "directions", locationType: "mixed", planTitle })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-[#e1062a] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744]"
                      >
                        Drive Main Event → After Plan
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
            </aside>

            <div className="order-1 rounded-[1.2rem] border border-white/10 bg-[#080808] p-3 shadow-2xl shadow-black/40 sm:p-4">
              <div className="mb-4 border-b border-white/10 pb-4">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a] sm:text-[10px]">
                  Timeline
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                  Your Timeline
                </h2>
                <p className="mt-1 text-sm font-semibold text-white/40">
                  Start with your main pick, then continue into the after plan.
                </p>
              </div>

              <div className="mb-3 rounded-2xl border border-white/10 bg-white/[.04] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Outing time</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{outingTime.outingDateTimeText || outingTime.outingDateLabel || (outingTime.plannedFor ? "Exact time selected" : "Time not selected")}</p>
                  <span className="text-xs font-black text-rose-200">{outingTime.outingDateTimeText || outingTime.outingDateLabel || outingTime.plannedFor ? "Change" : "Add time"}</span>
                </div>
              </div>

              <OutingTimeSelector value={outingTime} onChange={setOutingTime} variant="panel" />

              <TimelineTimingSummary
                outingTime={outingTime}
                restaurant={restaurant}
                activity={activity}
                distancePreference={distancePreference}
                mainEventMinutes={mainEventMinutes}
                afterPlanMinutes={afterPlanMinutes}
                showTimingAdjustments={showTimingAdjustments}
                onToggleTimingAdjustments={() => setShowTimingAdjustments((value) => !value)}
                onMainEventMinutesChange={setMainEventMinutes}
                onAfterPlanMinutesChange={setAfterPlanMinutes}
              />

              <div className="relative">
                <div className="absolute left-[17px] top-8 h-[calc(100%-64px)] w-px bg-gradient-to-b from-[#e1062a] via-white/15 to-fuchsia-400/40 sm:left-[19px]" />

                <TimelineLocation
                  step="1"
                  label="The Main Event"
                  location={restaurant}
                  fallbackTitle="Choose your main pick"
                  fallbackMeta="Main pick"
                  type="restaurant"
                />

                <div className="my-2 ml-[46px] rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 sm:ml-[52px] sm:px-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 sm:text-[10px]">
                    Then
                  </p>
                  <p className="mt-1 text-xs font-bold leading-5 text-white/60 sm:text-sm">
                    {restaurant && activity
                      ? buildFlowText(restaurant, activity, distancePreference)
                      : "Add the second stop to complete the outing."}
                  </p>
                </div>

                <TimelineLocation
                  step="2"
                  label="The After Plan"
                  location={activity}
                  fallbackTitle="Choose your after plan"
                  fallbackMeta="After plan"
                  type="activity"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {hasPlan && showBookingDetails && (
        <section id="booking-details" className="mx-auto max-w-7xl px-3 pb-10 sm:px-6">
          <div className="rounded-[1.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.16),transparent_34%),#080808] p-4 shadow-2xl shadow-black/40 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
              Booking Details
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
              Booking Details
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/45">
              Everything you need to lock in your outing is here.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {restaurant && (
                <PlanActionCard label="The Main Event" chipLabel="Restaurant pick" type="restaurant" location={restaurant} directionsUrl={buildGooglePlaceDirectionsUrl({ destination: restaurant, travelMode: "driving" })} activeOutingId={activeOutingId} planTitle={planTitle} showActions />
              )}
              {activity && (
                <PlanActionCard label="The After Plan" chipLabel="Activity pick" type="activity" location={activity} directionsUrl={buildGooglePlaceDirectionsUrl({ destination: activity, travelMode: "driving" })} activeOutingId={activeOutingId} planTitle={planTitle} showActions />
              )}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <p className="text-sm font-black text-white">Send Your Plan</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setContactMethod("text"); setSmsOptIn(true); setEmailOptIn(false); }}
                    className={`rounded-full border px-4 py-3 text-xs font-black uppercase tracking-[0.1em] transition ${contactMethod === "text" ? "border-[#e1062a]/60 bg-[#e1062a]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"}`}
                  >
                    Text My Outing
                  </button>
                  <button
                    type="button"
                    onClick={() => { setContactMethod("email"); setEmailOptIn(true); setSmsOptIn(false); }}
                    className={`rounded-full border px-4 py-3 text-xs font-black uppercase tracking-[0.1em] transition ${contactMethod === "email" ? "border-[#e1062a]/60 bg-[#e1062a]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"}`}
                  >
                    Email My Outing
                  </button>
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-white/45">
                  Send yourself a secure link so you can open your outing details anytime.
                </p>
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                {contactMethod === "text" ? (
                  <input type="tel" value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="Phone number" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#e1062a]/70" />
                ) : (
                  <input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="Email address" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#e1062a]/70" />
                )}
                <p className="text-xs font-semibold leading-5 text-white/40">If your outing has a clear date or time, we may check in after to see how it went.</p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={savePlanAndFollowUp} className="rounded-full bg-[#e1062a] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744]">{contactMethod === "email" ? "Email My Outing" : "Text My Outing"}</button>
                  <button type="button" onClick={saveCurrentPlan} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white">Save on this device instead</button>
                </div>

                {startStatus ? <p className="text-xs font-bold leading-5 text-white/55">{startStatus}</p> : null}
                {saveStatus ? <p className="text-xs font-bold leading-5 text-white/45">{saveStatus}</p> : null}
                {activeOutingId ? (
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                    <p className="text-sm font-black text-emerald-100">Your outing is saved</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-white/65">We saved your plan. Use the buttons above when you’re ready.</p>
                    {activePlanUrl ? (
                      <Link href={activePlanUrl} className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-black">Open secure plan link</Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 bg-black px-3 py-7 text-white sm:px-6 sm:py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xl font-black">
              The<span className="text-[#e1062a]">Out</span>Haven
            </p>
            <p className="mt-1 text-sm font-semibold text-white/40">
              AI outing plans for food, activities, and better nights out.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm font-bold text-white/40">
            <Link href="/create" className="hover:text-white">
              Create
            </Link>
            <Link href="/location/apply" className="hover:text-white">
              For Businesses
            </Link>
            <Link href="/pricing" className="hover:text-white">
              Pricing
            </Link>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        html,
        body {
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
          background: #000;
        }

        * {
          box-sizing: border-box;
        }

        @keyframes cardReveal {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </main>
  );
}


function TimelineTimingSummary({
  outingTime,
  restaurant,
  activity,
  distancePreference,
  mainEventMinutes,
  afterPlanMinutes,
  showTimingAdjustments,
  onToggleTimingAdjustments,
  onMainEventMinutesChange,
  onAfterPlanMinutesChange,
}: {
  outingTime: OutingTimeValue;
  restaurant: PlanLocation | null;
  activity: PlanLocation | null;
  distancePreference: "walking" | "miles";
  mainEventMinutes: number;
  afterPlanMinutes: number | null;
  showTimingAdjustments: boolean;
  onToggleTimingAdjustments: () => void;
  onMainEventMinutesChange: (minutes: number) => void;
  onAfterPlanMinutesChange: (minutes: number | null) => void;
}) {
  const travelMinutes = getEstimatedTravelMinutes(restaurant, activity, distancePreference);
  const schedule = buildEstimatedSchedule({
    outingTime,
    mainEventMinutes,
    afterPlanMinutes,
    travelMinutes,
  });
  const mainOptions = [60, 90, 120, 150, 180];
  const afterOptions: Array<number | null> = [60, 90, 120, null];

  return (
    <div className="my-4 rounded-2xl border border-white/10 bg-black/35 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
            Estimated Schedule
          </p>
          <h3 className="mt-1 text-lg font-black text-white">
            {schedule ? "Auto-estimated from your start time" : "Timing not set yet"}
          </h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-white/50">
            {schedule
              ? "We’ll use your start time, default durations, and travel details to shape the timeline."
              : "Add a start time if you want a full timeline."}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleTimingAdjustments}
          className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-white/70 transition hover:text-white sm:w-auto"
        >
          Adjust timing
        </button>
      </div>

      {schedule ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {schedule.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e1062a]">{item.time}</p>
              <p className="mt-1 text-sm font-black text-white">{item.label}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showTimingAdjustments ? (
        <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
          <DurationChipGroup
            label="Main Event length"
            options={mainOptions}
            value={mainEventMinutes}
            onChange={(value) => value && onMainEventMinutesChange(value)}
          />
          <DurationChipGroup
            label="After Plan length"
            options={afterOptions}
            value={afterPlanMinutes}
            onChange={onAfterPlanMinutesChange}
          />
        </div>
      ) : null}
    </div>
  );
}

function DurationChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<number | null>;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option ?? "open"}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full border px-3 py-2 text-[11px] font-black transition ${value === option ? "border-[#e1062a]/60 bg-[#e1062a]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/60 hover:text-white"}`}
          >
            {formatDurationOption(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildEstimatedSchedule({
  outingTime,
  mainEventMinutes,
  afterPlanMinutes,
  travelMinutes,
}: {
  outingTime: OutingTimeValue;
  mainEventMinutes: number;
  afterPlanMinutes: number | null;
  travelMinutes: number | null;
}) {
  if (outingTime.outingTimeConfidence !== "exact" || !outingTime.plannedFor) return null;
  const start = new Date(outingTime.plannedFor);
  if (Number.isNaN(start.getTime())) return null;
  const mainEnds = addMinutes(start, mainEventMinutes);
  const afterStarts = addMinutes(mainEnds, travelMinutes ?? 0);
  const afterEnds = afterPlanMinutes ? addMinutes(afterStarts, afterPlanMinutes) : null;
  return [
    { label: "The Main Event", time: formatScheduleTime(start, outingTime.timezone), detail: `Plan for ${formatDurationOption(mainEventMinutes)}.` },
    { label: "Travel", time: formatScheduleTime(mainEnds, outingTime.timezone), detail: travelMinutes ? `About ${travelMinutes} min between picks.` : "Travel time will depend on the route." },
    { label: "The After Plan", time: formatScheduleTime(afterStarts, outingTime.timezone), detail: afterEnds ? `Arrive around ${formatScheduleTime(afterStarts, outingTime.timezone)}.` : "Arrive when you’re ready." },
    { label: "Wrap", time: afterEnds ? formatScheduleTime(afterEnds, outingTime.timezone) : "Open", detail: afterPlanMinutes ? `After about ${formatDurationOption(afterPlanMinutes)}.` : "Open-ended after plan." },
  ];
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function formatScheduleTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

function formatDurationOption(minutes: number | null) {
  if (minutes === null) return "Open-ended";
  if (minutes === 60) return "1 hr";
  if (minutes % 60 === 0) return `${minutes / 60} hr`;
  return `${Math.floor(minutes / 60)}.5 hr`;
}

function getEstimatedTravelMinutes(
  restaurant: PlanLocation | null,
  activity: PlanLocation | null,
  distancePreference: "walking" | "miles",
) {
  if (!restaurant || !activity) return null;
  const explicit =
    activity.routeDurationMinutes ??
    activity.googleWalkingDurationMinutes ??
    activity.walkingDurationMinutes ??
    activity.walking_route_minutes ??
    activity.pair_walking_minutes ??
    null;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const distance = activity.pair_distance_miles ?? distanceBetweenLocations(restaurant, activity);
  if (!distance) return null;
  const speedMilesPerHour = distancePreference === "walking" ? 3 : 18;
  return Math.max(5, Math.round((distance / speedMilesPerHour) * 60));
}

function TimelineLocation({
  step,
  label,
  location,
  fallbackTitle,
  fallbackMeta,
  type,
}: {
  step: string;
  label: string;
  location: PlanLocation | null;
  fallbackTitle: string;
  fallbackMeta: string;
  type: "restaurant" | "activity";
}) {
  const active = Boolean(location);
  const title = location
    ? getLocationName(location, fallbackTitle)
    : fallbackTitle;

  const meta = [
    type === "restaurant" ? getCuisine(location) : getPrimaryCategory(location),
    location?.city,
    location?.rating ? `★ ${location.rating}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="relative flex min-w-0 gap-2 py-3 sm:gap-3">
      <div
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-black sm:h-10 sm:w-10 sm:text-sm ${
          active
            ? "border-[#e1062a] bg-[#e1062a] text-white"
            : "border-white/10 bg-[#151515] text-white/40"
        }`}
      >
        {step}
      </div>

      <div
        className={`min-w-0 flex-1 rounded-2xl border p-2.5 sm:p-3 ${
          active
            ? "border-white/10 bg-white/[0.05]"
            : "border-white/10 bg-white/[0.025]"
        }`}
      >
        <div className="flex min-w-0 gap-2.5 sm:gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.06] sm:h-16 sm:w-16">
            {active && location ? (
              <Image
                src={getLocationImage(location) as string}
                alt={title}
                fill
                unoptimized
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-lg">
                {type === "restaurant" ? "🍽️" : "✨"}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a] sm:text-[10px]">
              {label}
            </p>

            <h3 className="mt-1 line-clamp-1 text-sm font-black tracking-[-0.02em] text-white sm:text-base">
              {title}
            </h3>

            <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-white/45 sm:text-xs">
              {meta || fallbackMeta}
            </p>

            <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-4 text-white/55 sm:mt-2 sm:text-xs sm:leading-5">
              {active
                ? type === "restaurant"
                  ? "Start with the pick that anchors your outing."
                  : "Continue into the after plan that completes the outing."
                : type === "restaurant"
                  ? "Go back to Create and choose your main pick."
                  : "Go back to Create and choose your after plan."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanActionCard({
  label,
  chipLabel,
  type,
  location,
  directionsUrl,
  activeOutingId,
  planTitle,
  showActions = true,
}: {
  label: string;
  chipLabel?: string;
  type: "restaurant" | "activity";
  location: PlanLocation;
  directionsUrl?: string | null;
  activeOutingId?: string | null;
  planTitle?: string | null;
  showActions?: boolean;
}) {
  const title = getLocationName(
    location,
    type === "restaurant" ? "Restaurant" : "Activity",
  );

  const detailHref = `${getLocationDetailHref({
    id: location.id,
    type,
    location,
  })}?from=/plan`;

  const reservationUrl = getExternalReservationUrl(location);
  const internalReservationHref = getInternalReservationHref(location, type);
  const locationId = location.id ? String(location.id) : null;
  const phoneHref = location.phone
    ? `tel:${String(location.phone).replace(/[^+\d]/g, "")}`
    : null;
  const trackedDirectionsUrl = directionsUrl && locationId ? buildTrackedOutboundHref({ to: directionsUrl, outingId: activeOutingId, locationId, type: "directions", locationType: type, planTitle }) : directionsUrl;
  const trackedReservationUrl = reservationUrl && locationId ? buildTrackedOutboundHref({ to: reservationUrl, outingId: activeOutingId, locationId, type: "reservation", locationType: type, planTitle }) : reservationUrl;
  const trackedPhoneHref = phoneHref && locationId ? buildTrackedOutboundHref({ to: phoneHref, outingId: activeOutingId, locationId, type: "phone", locationType: type, planTitle }) : phoneHref;
  const trackedWebsiteUrl = location.website && locationId ? buildTrackedOutboundHref({ to: String(location.website), outingId: activeOutingId, locationId, type: "website", locationType: type, planTitle }) : location.website;
  const viewRef = useTrackLocationView<HTMLElement>(
    locationId,
    PLAN_ANALYTICS_METADATA,
  );
  const trackClick = () =>
    trackLocationEvent(locationId, "click", PLAN_ANALYTICS_METADATA);
  const trackBooking = () =>
    trackLocationEvent(locationId, "booking", PLAN_ANALYTICS_METADATA);
  const trackReserve = () => {
    trackClick();
    trackBooking();
    trackPlanExternalAction(locationId, "reservation_started", {
      location_type: type,
      destination: reservationUrl ? "external" : "theouthaven",
    });
  };
  const trackWebsite = () => {
    trackClick();
    trackPlanExternalAction(locationId, "website_click", {
      location_type: type,
    });
  };
  const trackPhone = () => {
    trackClick();
    trackPlanExternalAction(locationId, "phone_click", { location_type: type });
  };
  const trackDirections = () => {
    trackClick();
    trackPlanExternalAction(locationId, "directions_click", {
      location_type: type,
    });
  };

  return (
    <article
      ref={viewRef}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a,button")) return;
        trackClick();
      }}
      className="overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#101010] shadow-xl shadow-black/30"
    >
      <div className="relative h-[170px] bg-neutral-950">
        {getLocationImage(location) ? (
          <Image
            src={getLocationImage(location) as string}
            alt={title}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-white/30">
            {type === "restaurant" ? "🍽️" : "✨"}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-black/40 to-black/5" />

        <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/75 px-3 py-1.5 backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
            {chipLabel || label}
          </p>
        </div>

        {location.rating ? (
          <div className="absolute bottom-3 right-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-black">
            ★ {location.rating}
          </div>
        ) : null}
      </div>

      <div className="p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">
          {label}
        </p>
        <p className="mt-1 text-[11px] font-bold text-white/45">
          {titleCase(
            type === "restaurant"
              ? getCuisine(location) || "Restaurant"
              : getPrimaryCategory(location),
          )}
        </p>

        <h3 className="mt-1 line-clamp-1 text-xl font-black tracking-[-0.03em] text-white">
          {title}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/45">
          {formatAddress(location) || "Location details available on listing."}
        </p>

        {showActions ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href={detailHref}
            onClick={() => { trackClick(); trackPlanAnalyticsEvent({ event_name: "outing_details_clicked", event_type: "click", conversion_step: "clicked_outbound_link", outing_id: activeOutingId, location_id: locationId, source_location_id: locationId, query: planTitle, metadata: { plan_title: planTitle, link_type: "details", location_type: type } }); }}
            className="rounded-full bg-white px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-black transition hover:bg-red-100"
          >
            Details
          </Link>

          {directionsUrl ? (
            <a
              href={trackedDirectionsUrl || directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackDirections}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
            >
              Get Directions
            </a>
          ) : null}

          {location.reservation_enabled === true && internalReservationHref ? (
            <Link
              href={internalReservationHref}
              onClick={trackReserve}
              className="rounded-full bg-[#e1062a] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744]"
            >
              Reserve
            </Link>
          ) : reservationUrl ? (
            <a
              href={trackedReservationUrl || reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackReserve}
              className="rounded-full bg-[#e1062a] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744]"
            >
              Reserve
            </a>
          ) : null}

          {phoneHref ? (
            <a
              href={trackedPhoneHref || phoneHref}
              onClick={trackPhone}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
            >
              Call
            </a>
          ) : null}

          {location.website ? (
            <a
              href={trackedWebsiteUrl || location.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackWebsite}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
            >
              Website
            </a>
          ) : !reservationUrl && !phoneHref ? (
            <Link
              href="/create"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
            >
              Edit
            </Link>
          ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function EmptyPlan() {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-[#080808] p-5 text-center shadow-2xl shadow-black/40">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
        No Plan Selected
      </p>

      <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
        Build your TheOutHaven first
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-white/45">
        Select a restaurant, activity, or both from Create, then your timeline,
        reserve buttons, call buttons, and next steps will appear here.
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/create"
          className="rounded-full bg-[#e1062a] px-6 py-3 text-xs font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff1744]"
        >
          Create My Outing
        </Link>
        <Link
          href={buildCreateHref("popular restaurants and activities nearby")}
          className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-xs font-black uppercase tracking-[0.12em] text-white/70 transition hover:text-white"
        >
          Browse Popular Nearby
        </Link>
      </div>
    </div>
  );
}

function PlanLoading() {
  return (
    <main className="min-h-screen bg-black px-4 pt-28 text-white">
      <div className="mx-auto max-w-7xl rounded-[1.2rem] border border-white/10 bg-[#080808] p-5">
        <div className="h-4 w-32 animate-pulse rounded-full bg-[#e1062a]/20" />
        <div className="mt-4 h-8 w-2/3 animate-pulse rounded-full bg-white/10" />
        <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-white/5" />
      </div>
    </main>
  );
}

function formatAddress(item: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}) {
  return formatFullAddress({
    address: item.address,
    city: item.city,
    state: item.state,
    zip_code: item.zip_code,
    fallback: "",
  });
}

function titleCase(value?: string | null) {
  return toDisplayLabel(value || "");
}

function getLocationCoordinates(item: PlanLocation | null) {
  if (!item) return null;

  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!latitude || !longitude) return null;

  return { latitude, longitude };
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceBetweenLocations(
  restaurant: PlanLocation | null,
  activity: PlanLocation | null,
) {
  const restaurantCoords = getLocationCoordinates(restaurant);
  const activityCoords = getLocationCoordinates(activity);

  if (!restaurantCoords || !activityCoords) return null;

  return Number(
    haversineMiles(
      restaurantCoords.latitude,
      restaurantCoords.longitude,
      activityCoords.latitude,
      activityCoords.longitude,
    ).toFixed(1),
  );
}

function buildFlowText(
  restaurant: PlanLocation | null,
  activity: PlanLocation | null,
  distancePreference: "walking" | "miles",
) {
  if (!restaurant || !activity) return "Main Event → After Plan";

  const distance =
    activity.pair_distance_miles ??
    distanceBetweenLocations(restaurant, activity) ??
    null;
  const restaurantName = getLocationName(restaurant, "main pick");
  const activityName = getLocationName(activity, "after plan");

  if (distance !== null) {
    if (restaurantName) {
      const label = formatDistanceFromRestaurant({
        pair: {
          ...activity,
          pairDistanceMiles: distance,
          pair_distance_miles: activity.pair_distance_miles,
        },
        restaurantName,
        pairingPreference:
          distancePreference === "walking"
            ? { distanceMode: "walking", requireWalkablePair: true }
            : { distanceMode: "any", requireWalkablePair: false },
      });

      if (label) return label;
    }

    return `${distance} mi between ${restaurantName || "main pick"} and ${
      activityName || "after plan"
    }`;
  }

  if (restaurant.city && activity.city && restaurant.city === activity.city) {
    return `Same city flow • ${restaurant.city}`;
  }

  return "Main Event → After Plan timeline";
}

function buildPlanSummaryText(
  restaurant: PlanLocation | null,
  activity: PlanLocation | null,
  distancePreference: "walking" | "miles",
) {
  if (restaurant && activity) {
    return `${getLocationName(restaurant)} is paired with ${getLocationName(activity)}. ${buildFlowText(restaurant, activity, distancePreference)}.`;
  }

  if (restaurant) {
    return `${getLocationName(restaurant)} is saved as your main event. Add an after plan nearby or use the action buttons to reserve, call, or view details.`;
  }

  if (activity) {
    return `${getLocationName(activity)} is saved as your after plan. Add a main pick nearby or use the action buttons to call, open the website, or view details.`;
  }

  return "Start by choosing a restaurant, activity, or both from Create.";
}
