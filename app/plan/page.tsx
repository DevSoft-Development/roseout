"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildGoogleDirectionsUrl,
  buildGooglePlaceDirectionsUrl,
} from "@/lib/googleDirections";
import { isCrossAreaWalkingPair } from "@/lib/walkingArea";
import { getLocationName } from "@/lib/locationName";

type PlanLocation = {
  id?: string;
  restaurant_name?: string | null;
  activity_name?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  cuisine?: string | null;
  food_type?: string | null;
  cuisine_type?: string | null;
  cuisine_tags?: string[] | null;
  activity_type?: string | null;
  detail_location_type?: "restaurants" | "activities" | null;
  primary_tag?: string | null;
  price_range?: string | null;
  atmosphere?: string | null;
  image_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  website?: string | null;
  reservation_url?: string | null;
  reservation_link?: string | null;
  booking_url?: string | null;
  theouthaven_score?: number | null;
  smart_match_score?: number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  pair_distance_miles?: number | null;
  pair_walking_minutes?: number | null;
  pair_walking_label?: string | null;
};

type SavedPlan = {
  restaurant?: PlanLocation | null;
  activity?: PlanLocation | null;
  locations?: PlanLocation[];
  distancePreference?: "walking" | "miles";
  savedAt?: number;
};

const PLAN_KEY = "theouthaven_plan";
const WALKING_MINUTES_PER_MILE = 20;

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

  const restaurantId = searchParams.get("restaurantId");
  const activityId = searchParams.get("activityId");

  useEffect(() => {
    document.title = "Your TheOutHaven Plan | TheOutHaven";
    setMounted(true);

    try {
      const saved = localStorage.getItem(PLAN_KEY);
      if (saved) {
        setPlan(JSON.parse(saved));
      }
    } catch {
      setPlan(null);
    }
  }, []);

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
              Review your dinner-to-activity flow, then continue with
              reservation links, websites, or listing details.
            </p>
          </div>

          <div className="rounded-[1.2rem] border border-white/10 bg-[#111]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl sm:rounded-[1.35rem] sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">
              Selected Flow
            </p>

            <h2 className="mt-2 break-words text-2xl font-black tracking-[-0.04em] sm:text-3xl">
              {planTitle}
            </h2>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                href="/create"
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-white/70 transition hover:text-white"
              >
                Edit Picks
              </Link>

              <a
                href="#plan-timeline"
                className="rounded-full bg-[#e1062a] px-5 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff1744]"
              >
                View Timeline
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        id="plan-timeline"
        className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8"
      >
        {!hasPlan ? (
          <EmptyPlan />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
            <aside className="h-fit rounded-[1.2rem] border border-white/10 bg-[#080808] p-4 shadow-2xl shadow-black/40 sm:p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
                Plan Summary
              </p>

              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
                Dinner → Activity
              </h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-white/45">
                This page now follows the same flow as Create: dinner first,
                activity second, then action buttons.
              </p>

              <div className="mt-5 rounded-2xl border border-[#e1062a]/20 bg-[#e1062a]/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-100/70">
                  Next Step
                </p>
                <p className="mt-1 text-sm font-bold leading-6 text-white">
                  Use the reservation, website, or details buttons to move from
                  planning into action.
                </p>
              </div>

              {(walkingRouteUrl || drivingRouteUrl) && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
                    Google Routes
                  </p>
                  <div className="mt-3 grid gap-2">
                    {walkingRouteUrl ? (
                      <a
                        href={walkingRouteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
                      >
                        Google Walking Route
                      </a>
                    ) : null}

                    {drivingRouteUrl ? (
                      <a
                        href={drivingRouteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-[#e1062a] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744]"
                      >
                        Drive Dinner → Activity
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
            </aside>

            <div className="rounded-[1.2rem] border border-white/10 bg-[#080808] p-3 shadow-2xl shadow-black/40 sm:p-4">
              <div className="mb-4 border-b border-white/10 pb-4">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a] sm:text-[10px]">
                  Timeline
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                  Your TheOutHaven flow
                </h2>
                <p className="mt-1 text-sm font-semibold text-white/40">
                  Start with dinner, then continue into the experience.
                </p>
              </div>

              <div className="relative">
                <div className="absolute left-[17px] top-8 h-[calc(100%-64px)] w-px bg-gradient-to-b from-[#e1062a] via-white/15 to-fuchsia-400/40 sm:left-[19px]" />

                <TimelineLocation
                  step="1"
                  label="Dinner"
                  location={restaurant}
                  fallbackTitle="Choose a dinner spot"
                  fallbackMeta="Restaurant"
                  type="restaurant"
                />

                <div className="my-2 ml-[46px] rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 sm:ml-[52px] sm:px-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 sm:text-[10px]">
                    Then
                  </p>
                  <p className="mt-1 text-xs font-bold leading-5 text-white/60 sm:text-sm">
                    {restaurant && activity
                      ? buildFlowText(restaurant, activity, distancePreference)
                      : "Add the second stop to complete the night."}
                  </p>
                </div>

                <TimelineLocation
                  step="2"
                  label="Activity"
                  location={activity}
                  fallbackTitle="Choose an activity"
                  fallbackMeta="Experience"
                  type="activity"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {hasPlan && (
        <section className="mx-auto max-w-7xl px-3 pb-10 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2">
            {restaurant && (
              <PlanActionCard
                label="Dinner Pick"
                type="restaurant"
                location={restaurant}
                directionsUrl={buildGooglePlaceDirectionsUrl({
                  destination: restaurant,
                  travelMode: "driving",
                })}
              />
            )}

            {activity && (
              <PlanActionCard
                label="Activity Pick"
                type="activity"
                location={activity}
                directionsUrl={buildGooglePlaceDirectionsUrl({
                  destination: activity,
                  travelMode: "driving",
                })}
              />
            )}
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 bg-black px-3 py-7 text-white sm:px-6 sm:py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xl font-black">
              Rose<span className="text-[#e1062a]">Out</span>
            </p>
            <p className="mt-1 text-sm font-semibold text-white/40">
              AI outing plans for food, activities, and better nights out.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm font-bold text-white/40">
            <Link href="/create" className="hover:text-white">
              Create
            </Link>
            <Link href="/business" className="hover:text-white">
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
  const title = location ? getLocationName(location, fallbackTitle) : fallbackTitle;

  const meta = [
    type === "restaurant"
      ? location?.cuisine || location?.food_type || location?.cuisine_type
      : location?.activity_type,
    location?.city,
    location?.rating ? `🌹 ${location.rating}` : null,
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
            {location?.image_url ? (
              <Image
                src={location.image_url}
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
                  ? "Start with the food pick that matches your outing."
                  : "Continue into the experience that completes the night."
                : type === "restaurant"
                  ? "Go back to Create and select a dinner spot."
                  : "Go back to Create and select an activity."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanActionCard({
  label,
  type,
  location,
  directionsUrl,
}: {
  label: string;
  type: "restaurant" | "activity";
  location: PlanLocation;
  directionsUrl?: string;
}) {
  const title = getLocationName(location, type === "restaurant" ? "Restaurant" : "Activity");

  const detailHref =
    type === "restaurant"
      ? `/locations/restaurants/${location.id}?from=/plan`
      : `/locations/${location.detail_location_type || "activities"}/${location.id}?from=/plan`;

  const reservationUrl =
    location.reservation_url || location.reservation_link || location.booking_url;

  return (
    <article className="overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#101010] shadow-xl shadow-black/30">
      <div className="relative h-[170px] bg-neutral-950">
        {location.image_url ? (
          <Image
            src={location.image_url}
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
            {label}
          </p>
        </div>

        {location.rating ? (
          <div className="absolute bottom-3 right-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-black">
            🌹 {location.rating}
          </div>
        ) : null}
      </div>

      <div className="p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">
          {titleCase(
            type === "restaurant"
              ? location.cuisine ||
                  location.food_type ||
                  location.cuisine_type ||
                  "Restaurant"
              : location.activity_type || "Activity"
          )}
        </p>

        <h3 className="mt-1 line-clamp-1 text-xl font-black tracking-[-0.03em] text-white">
          {title}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/45">
          {formatAddress(location) || "Location details available on listing."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href={detailHref}
            className="rounded-full bg-white px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-black transition hover:bg-red-100"
          >
            Details
          </Link>

          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
            >
              Drive Here
            </a>
          ) : null}

          {reservationUrl ? (
            <a
              href={reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#e1062a] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#ff1744]"
            >
              {type === "restaurant" ? "Reserve" : "Book"}
            </a>
          ) : location.website ? (
            <a
              href={location.website}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
            >
              Website
            </a>
          ) : (
            <Link
              href="/create"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.1em] text-white/75 transition hover:text-white"
            >
              Edit
            </Link>
          )}
        </div>
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
        Select a restaurant, activity, or both from the Create page, then your
        dinner-to-activity timeline will appear here.
      </p>

      <Link
        href="/create"
        className="mt-5 inline-flex rounded-full bg-[#e1062a] px-6 py-3 text-xs font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff1744]"
      >
        Create My Outing
      </Link>
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
  return [item.address, item.city, item.state, item.zip_code]
    .filter(Boolean)
    .join(", ");
}

function titleCase(value?: string | null) {
  if (!value) return "";

  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
  lon2: number
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceBetweenLocations(
  restaurant: PlanLocation | null,
  activity: PlanLocation | null
) {
  const restaurantCoords = getLocationCoordinates(restaurant);
  const activityCoords = getLocationCoordinates(activity);

  if (!restaurantCoords || !activityCoords) return null;

  return Number(
    haversineMiles(
      restaurantCoords.latitude,
      restaurantCoords.longitude,
      activityCoords.latitude,
      activityCoords.longitude
    ).toFixed(1)
  );
}

function walkingMinutesFromMiles(distanceMiles: number | null) {
  if (distanceMiles === null || !Number.isFinite(distanceMiles)) return null;

  return Math.max(1, Math.round(distanceMiles * WALKING_MINUTES_PER_MILE));
}

function buildFlowText(
  restaurant: PlanLocation | null,
  activity: PlanLocation | null,
  distancePreference: "walking" | "miles"
) {
  if (!restaurant || !activity) return "Dinner → Activity";

  const distance =
    distanceBetweenLocations(restaurant, activity) ??
    activity.pair_distance_miles ??
    null;
  const restaurantName = getLocationName(restaurant, "dinner");
  const activityName = getLocationName(activity, "activity");

  if (distance !== null) {
    if (distancePreference === "walking") {
      if (isCrossAreaWalkingPair(restaurant, activity)) {
        return `Not walkable between ${restaurantName || "dinner"} and ${
          activityName || "activity"
        }`;
      }

      const walkingMinutes =
        activity.pair_walking_minutes || walkingMinutesFromMiles(distance);

      if (walkingMinutes && restaurantName) {
        return `${walkingMinutes} min walk from ${restaurantName}`;
      }
    }

    return `${distance} miles between ${restaurantName || "dinner"} and ${
      activityName || "activity"
    }`;
  }

  if (restaurant.city && activity.city && restaurant.city === activity.city) {
    return `Same city flow • ${restaurant.city}`;
  }

  return "Dinner → Activity timeline";
}
