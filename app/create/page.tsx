"use client";

import Image from "next/image";
import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trackAnalytics } from "@/lib/trackAnalytics";

type RestaurantCard = {
  id: string;
  restaurant_name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  cuisine?: string | null;
  food_type?: string | null;
  cuisine_tags?: string[] | null;
  atmosphere?: string | null;
  price_range?: string | null;
  roseout_score: number;
  smart_match_score?: number | null;
  reservation_link?: string | null;
  reservation_url?: string | null;
  website?: string | null;
  image_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  review_score?: number | null;
  review_keywords?: string[] | null;
  review_snippet?: string | null;
  primary_tag?: string | null;
  date_style_tags?: string[] | null;
  distance_miles?: number | null;
};

type ActivityCard = {
  id: string;
  activity_name: string;
  activity_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  price_range?: string | null;
  atmosphere?: string | null;
  group_friendly?: boolean | null;
  roseout_score: number;
  smart_match_score?: number | null;
  reservation_link?: string | null;
  reservation_url?: string | null;
  website?: string | null;
  image_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  review_score?: number | null;
  review_keywords?: string[] | null;
  review_snippet?: string | null;
  primary_tag?: string | null;
  date_style_tags?: string[] | null;
  distance_miles?: number | null;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  restaurants?: RestaurantCard[];
  activities?: ActivityCard[];
};

type ApiResponse = {
  reply?: string;
  restaurants?: RestaurantCard[];
  activities?: ActivityCard[];
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

const LOCATION_KEY = "roseout_user_location";

function wantsNearbySearch(input: string) {
  return /\b(near me|nearby|close by|around me)\b/i.test(input);
}

const typingSearches = [
  "Steak dinner with bowling in Queens",
  "Romantic Italian dinner in Brooklyn",
  "Birthday brunch with rooftop vibes",
  "Affordable date night near me",
  "Sushi with karaoke after dinner",
  "Luxury seafood dinner in Manhattan",
  "Hookah lounge with food nearby",
  "Fun date night with arcade games",
];

const loadingLines = [
  "Matching your vibe...",
  "Checking food and activity signals...",
  "Building tighter RoseOut picks...",
  "Finding the best fit...",
];

export default function CreatePage() {
  const router = useRouter();

  const [input, setInput] = useState("");
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [error, setError] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<RestaurantCard | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityCard | null>(
    null,
  );
  const [locationSaved, setLocationSaved] = useState(false);
  const [showPlanSummary, setShowPlanSummary] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const curatedResultsRef = useRef<HTMLDivElement | null>(null);
  const loadingResultsRef = useRef<HTMLDivElement | null>(null);
  const activitySectionRef = useRef<HTMLDivElement | null>(null);
  const viewedItems = useRef<Set<string>>(new Set());

  const latestAssistant = useMemo(
    () =>
      [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

  const hasSelection = Boolean(selectedRestaurant || selectedActivity);

  const selectedPlanText = [
    selectedRestaurant?.restaurant_name,
    selectedActivity?.activity_name,
  ]
    .filter(Boolean)
    .join(" + ");

  useEffect(() => {
    document.title = "Create Your Outing | RoseOut";
    setLocationSaved(Boolean(getSavedLocation()));
  }, []);

  useEffect(() => {
    let searchIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    function typeLoop() {
      const currentSearch = typingSearches[searchIndex];

      if (!deleting) {
        setTypedPlaceholder(currentSearch.slice(0, charIndex + 1));
        charIndex++;

        if (charIndex === currentSearch.length) {
          deleting = true;
          timeout = setTimeout(typeLoop, 1300);
          return;
        }
      } else {
        setTypedPlaceholder(currentSearch.slice(0, charIndex - 1));
        charIndex--;

        if (charIndex === 0) {
          deleting = false;
          searchIndex = (searchIndex + 1) % typingSearches.length;
        }
      }

      timeout = setTimeout(typeLoop, deleting ? 35 : 55);
    }

    typeLoop();

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!loading) return;

    const timer = window.setInterval(() => {
      setLoadingIndex((current) => (current + 1) % loadingLines.length);
    }, 1400);

    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!loading) return;

    const scrollTimer = window.setTimeout(() => {
      loadingResultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [loading]);

  useEffect(() => {
    const latest = latestAssistant;
    if (!latest) return;

    [...(latest.restaurants || []), ...(latest.activities || [])].forEach(
      (item: any) => {
        const itemType = item.restaurant_name ? "restaurant" : "activity";
        const key = `${itemType}-${item.id}`;

        if (!item.id || viewedItems.current.has(key)) return;

        viewedItems.current.add(key);

        trackAnalytics({
          itemId: String(item.id),
          itemType,
          eventType: "view",
        });
      },
    );
  }, [latestAssistant]);

  function getSavedLocation(): UserLocation | null {
    if (typeof window === "undefined") return null;

    try {
      const saved = localStorage.getItem(LOCATION_KEY);
      if (!saved) return null;

      const parsed = JSON.parse(saved);

      if (
        typeof parsed.latitude === "number" &&
        typeof parsed.longitude === "number"
      ) {
        return parsed;
      }

      return null;
    } catch {
      return null;
    }
  }

  function getBrowserLocation(): Promise<UserLocation> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location is not supported on this device."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          reject(
            new Error(
              "Please allow location access or search by neighborhood.",
            ),
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000 * 60 * 10,
          timeout: 10000,
        },
      );
    });
  }

  async function requestUserLocation() {
    try {
      const userLocation = await getBrowserLocation();

      localStorage.setItem(LOCATION_KEY, JSON.stringify(userLocation));
      setLocationSaved(true);
      setError("");
    } catch (locationError: any) {
      setLocationSaved(false);
      setError(
        locationError?.message ||
          "Please allow location access or search by neighborhood.",
      );
    }
  }

  function resetSearch() {
    setInput("");
    setMessages([]);
    setSelectedRestaurant(null);
    setSelectedActivity(null);
    setShowPlanSummary(false);
    setError("");

    inputRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
  }

  function selectRestaurantAndMaybeScroll(restaurant: RestaurantCard) {
    const nextSelected =
      selectedRestaurant?.id === restaurant.id ? null : restaurant;

    setSelectedRestaurant(nextSelected);
    setShowPlanSummary(false);

    if (nextSelected) {
      setTimeout(() => {
        activitySectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
    }
  }

  function selectActivity(activity: ActivityCard) {
    setSelectedActivity(selectedActivity?.id === activity.id ? null : activity);
    setShowPlanSummary(false);
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();

    const cleanInput = input.trim();

    if (!cleanInput || loading) return;

    setLoading(true);
    setError("");
    setShowPlanSummary(false);
    setSelectedRestaurant(null);
    setSelectedActivity(null);

    const userMessage: Message = {
      role: "user",
      content: cleanInput,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");

    try {
      const savedLocation = getSavedLocation();
      let searchLocation = savedLocation;

      if (!searchLocation && wantsNearbySearch(cleanInput)) {
        try {
          searchLocation = await getBrowserLocation();
          localStorage.setItem(LOCATION_KEY, JSON.stringify(searchLocation));
          setLocationSaved(true);
        } catch {
          setError(
            "Turn on location or include a zip code so RoseOut can rank nearby places first.",
          );
        }
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: cleanInput,
          messages: [...messages, userMessage],
          ...(searchLocation
            ? {
                latitude: searchLocation.latitude,
                longitude: searchLocation.longitude,
                lat: searchLocation.latitude,
                lng: searchLocation.longitude,
              }
            : {}),
        }),
      });

      const data: ApiResponse & { error?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "RoseOut could not create results.");
      }

      const assistantMessage: Message = {
        role: "assistant",
        content:
          data.reply ||
          "Here are strong RoseOut matches based on your outing request.",
        restaurants: data.restaurants || [],
        activities: data.activities || [],
      };

      setMessages((current) => [...current, assistantMessage]);

      setTimeout(() => {
        curatedResultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 250);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function trackRestaurantClick(id: string) {
    trackAnalytics({
      itemId: id,
      itemType: "restaurant",
      eventType: "click",
    });
  }

  function trackActivityClick(id: string) {
    trackAnalytics({
      itemId: id,
      itemType: "activity",
      eventType: "click",
    });
  }

  function savePlan() {
    if (typeof window === "undefined") return;

    const plan = {
      restaurant: selectedRestaurant,
      activity: selectedActivity,
      locations: [selectedRestaurant, selectedActivity].filter(Boolean),
      savedAt: Date.now(),
    };

    localStorage.setItem("roseout_plan", JSON.stringify(plan));

    const params = new URLSearchParams();

    if (selectedRestaurant?.id) {
      params.set("restaurantId", String(selectedRestaurant.id));
    }

    if (selectedActivity?.id) {
      params.set("activityId", String(selectedActivity.id));
    }

    router.push(`/plan?${params.toString()}`);
  }

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-black pb-36 text-white sm:pb-28">
      <section className="relative w-full max-w-full overflow-x-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.22),transparent_34%),linear-gradient(180deg,#050505_0%,#0b0b0b_100%)] px-3 pb-6 pt-24 sm:px-6 sm:pb-10 sm:pt-28 lg:pt-32">
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-5 overflow-hidden lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div className="flex min-w-0 max-w-full flex-col justify-center">
            <div className="mb-3 inline-flex w-fit max-w-full rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-red-100 sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.22em]">
              AI Outing Planner
            </div>

            <h1 className="max-w-full break-words text-[2.45rem] font-black leading-[0.92] tracking-[-0.055em] text-white xs:text-4xl sm:text-6xl lg:text-7xl">
              Plan less. <span className="text-[#e1062a]">RoseOut</span> more.
            </h1>

            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/55 sm:mt-4 sm:text-base">
              Type exactly what you want. RoseOut matches food, activities,
              location, vibe, and budget into a tighter outing plan.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#111]/90 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl transition focus-within:border-[#e1062a]/45 focus-within:shadow-[0_0_0_1px_rgba(225,6,42,0.28),0_0_34px_rgba(225,6,42,0.18)] sm:rounded-[1.35rem] sm:p-5"
          >
            <div className="min-w-0">
              <div className="mb-2.5 flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[9px] font-black uppercase tracking-[0.2em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.22em]">
                  Create your plan
                </p>

                {locationSaved ? (
                  <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-100 sm:px-3 sm:text-[10px]">
                    Location On
                  </span>
                ) : null}
              </div>

              <div className="relative">
                {!input && (
                  <div className="pointer-events-none absolute left-3 top-3.5 z-10 max-w-[calc(100%-1.5rem)] truncate text-sm font-semibold leading-6 text-white/30 sm:left-4 sm:top-4 sm:text-base sm:leading-7">
                    {typedPlaceholder
                      ? `${typedPlaceholder}|`
                      : "Tell RoseOut what you want..."}
                  </div>
                )}

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  rows={2}
                  placeholder=""
                  className="h-[96px] w-full min-w-0 max-w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-black px-3 py-3.5 text-sm font-semibold leading-6 text-white outline-none transition focus:border-[#e1062a]/70 sm:h-[112px] sm:px-4 sm:py-4 sm:text-base sm:leading-7"
                />
              </div>
            </div>

            <div className="mt-3 flex w-full min-w-0 justify-center sm:mt-4">
              <div className="flex w-full min-w-0 flex-col justify-center gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="w-full rounded-full bg-[#e1062a] px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff1744] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-6 sm:text-xs sm:tracking-[0.12em]"
                >
                  {loading ? "Finding Matches..." : "Build My Outing"}
                </button>

                <button
                  type="button"
                  onClick={requestUserLocation}
                  className={`w-full rounded-full border px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] transition sm:w-auto sm:px-6 sm:text-xs sm:tracking-[0.12em] ${
                    locationSaved
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                      : "border-white/10 bg-white/[0.04] text-white/65 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {locationSaved ? "Location On" : "Use My Location"}
                </button>

                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={resetSearch}
                    className="w-full rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white/55 transition hover:text-white sm:w-auto sm:px-6 sm:text-xs sm:tracking-[0.12em]"
                  >
                    New Search
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-5 sm:px-6 sm:py-8">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100 sm:mb-5">
            {error}
          </div>
        )}

        {!messages.length && !loading && <StartPanel />}

        <div className="space-y-4 sm:space-y-5">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            const restaurants = message.restaurants || [];
            const activities = message.activities || [];
            const hasCards = restaurants.length > 0 || activities.length > 0;

            if (isUser) {
              return (
                <div key={index} className="flex justify-end">
                  <div className="max-w-[92vw] rounded-2xl bg-[#e1062a] px-4 py-3 text-sm font-black leading-6 text-white shadow-lg shadow-red-950/30 sm:max-w-3xl">
                    {message.content}
                  </div>
                </div>
              );
            }

            if (!hasCards) {
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-[#101010] p-4 text-sm font-semibold leading-7 text-white/70"
                >
                  {message.content}
                </div>
              );
            }

            return (
              <div
                key={index}
                ref={
                  index === messages.length - 1 ? curatedResultsRef : undefined
                }
                className="w-full max-w-full scroll-mt-24 overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#080808] p-3 shadow-2xl shadow-black/40 sm:scroll-mt-28 sm:rounded-[1.25rem] sm:p-4"
              >
                <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.25em]">
                      Curated Results
                    </p>
                    <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                      Tight matches for your outing
                    </h2>
                    <p className="mt-1 text-sm font-semibold leading-5 text-white/40">
                      Select dinner, then choose the experience that completes
                      the night.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={resetSearch}
                    className="w-full shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/65 transition hover:border-[#e1062a]/50 hover:bg-[#e1062a]/10 hover:text-white sm:w-auto sm:px-5 sm:text-xs"
                  >
                    New Search
                  </button>
                </div>

                {restaurants.length > 0 && (
                  <ResultSection
                    title="Restaurant Picks"
                    subtitle="Food spots matched to cuisine, vibe, and location"
                  >
                    {restaurants.map((restaurant, restaurantIndex) => {
                      const restaurantId = String(restaurant.id);
                      const isSelected =
                        selectedRestaurant?.id === restaurant.id;
                      const reservationUrl =
                        restaurant.reservation_url ||
                        restaurant.reservation_link ||
                        undefined;

                      return (
                        <ResultCard
                          key={restaurantId || restaurantIndex}
                          index={restaurantIndex}
                          type="restaurant"
                          id={restaurantId}
                          imageUrl={restaurant.image_url || undefined}
                          title={restaurant.restaurant_name}
                          eyebrow={
                            restaurant.cuisine ||
                            restaurant.food_type ||
                            "Restaurant"
                          }
                          address={formatAddress(restaurant)}
                          rating={restaurant.rating}
                          reviewCount={restaurant.review_count}
                          reviewKeywords={restaurant.review_keywords}
                          reviewSnippet={restaurant.review_snippet}
                          primaryTag={restaurant.primary_tag}
                          tags={[
                            ...(restaurant.cuisine_tags || []),
                            ...(restaurant.date_style_tags || []),
                          ]}
                          distance={restaurant.distance_miles}
                          selected={isSelected}
                          priority={restaurantIndex === 0}
                          selectLabel={isSelected ? "Selected" : "Select"}
                          onSelect={() =>
                            selectRestaurantAndMaybeScroll(restaurant)
                          }
                          detailsHref={`/locations/restaurants/${restaurantId}?from=/create`}
                          onDetails={() => trackRestaurantClick(restaurantId)}
                          websiteUrl={restaurant.website || undefined}
                          onWebsite={() => trackRestaurantClick(restaurantId)}
                          reservationUrl={reservationUrl}
                          reservationLabel="Reserve"
                          onReservation={() =>
                            trackRestaurantClick(restaurantId)
                          }
                        />
                      );
                    })}
                  </ResultSection>
                )}

                {activities.length > 0 && (
                  <div
                    ref={activitySectionRef}
                    className="scroll-mt-24 sm:scroll-mt-28"
                  >
                    <ResultSection
                      title="Experience Picks"
                      subtitle="Activities matched to your outing plan"
                    >
                      {activities.map((activity, activityIndex) => {
                        const activityId = String(activity.id);
                        const isSelected = selectedActivity?.id === activity.id;
                        const reservationUrl =
                          activity.reservation_url ||
                          activity.reservation_link ||
                          undefined;

                        return (
                          <ResultCard
                            key={activityId || activityIndex}
                            index={activityIndex}
                            type="activity"
                            id={activityId}
                            imageUrl={activity.image_url || undefined}
                            title={activity.activity_name}
                            eyebrow={activity.activity_type || "Activity"}
                            address={formatAddress(activity)}
                            rating={activity.rating}
                            reviewCount={activity.review_count}
                            reviewKeywords={activity.review_keywords}
                            reviewSnippet={activity.review_snippet}
                            primaryTag={activity.primary_tag}
                            tags={activity.date_style_tags || []}
                            distance={activity.distance_miles}
                            selected={isSelected}
                            priority={activityIndex === 0}
                            selectLabel={isSelected ? "Selected" : "Select"}
                            onSelect={() => selectActivity(activity)}
                            detailsHref={`/locations/activities/${activityId}?from=/create`}
                            onDetails={() => trackActivityClick(activityId)}
                            websiteUrl={activity.website || undefined}
                            onWebsite={() => trackActivityClick(activityId)}
                            reservationUrl={reservationUrl}
                            reservationLabel="Book"
                            onReservation={() => trackActivityClick(activityId)}
                          />
                        );
                      })}
                    </ResultSection>
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <LoadingResults
              label={loadingLines[loadingIndex]}
              panelRef={loadingResultsRef}
            />
          )}
        </div>
      </section>

      {hasSelection && (
        <div className="fixed bottom-0 left-0 z-50 w-full border-t border-white/10 bg-black/90 shadow-[0_-18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.2em]">
                Your RoseOut Plan
              </p>

              <p className="max-w-full truncate text-sm font-bold text-white sm:max-w-[52vw]">
                {selectedPlanText || "Selected outing"}
              </p>

              <p className="hidden text-xs font-semibold text-white/40 sm:block">
                Review your dinner-to-activity timeline before continuing.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowPlanSummary(true)}
              className="w-full shrink-0 rounded-full bg-[#e1062a] px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-900/40 transition hover:bg-[#ff1744] sm:w-auto sm:px-5 sm:text-xs sm:tracking-[0.12em]"
            >
              Review Your RoseOut →
            </button>
          </div>
        </div>
      )}

      {showPlanSummary && (
        <PlanSummarySheet
          restaurant={selectedRestaurant}
          activity={selectedActivity}
          onClose={() => setShowPlanSummary(false)}
          onContinue={savePlan}
        />
      )}

      <style jsx global>{`
        html,
        body {
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
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

        @keyframes sheetIn {
          from {
            opacity: 0;
            transform: translateY(28px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}

function PlanSummarySheet({
  restaurant,
  activity,
  onClose,
  onContinue,
}: {
  restaurant: RestaurantCard | null;
  activity: ActivityCard | null;
  onClose: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[999] flex items-end justify-center overflow-hidden bg-black/70 px-2 pb-2 backdrop-blur-sm sm:px-6 sm:pb-6">
      <button
        type="button"
        aria-label="Close plan summary"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0b0b0b] shadow-2xl shadow-black sm:rounded-[1.6rem]"
        style={{ animation: "sheetIn 260ms ease-out both" }}
      >
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.22),transparent_40%),#101010] px-4 py-4 sm:px-5 sm:py-5">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:mb-4" />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.24em]">
                Plan Summary
              </p>
              <h3 className="mt-1 break-words text-xl font-black tracking-[-0.04em] text-white sm:text-2xl">
                Your night is almost ready
              </h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-white/45 sm:text-sm sm:leading-6">
                Review your dinner-to-activity flow before moving to the full
                plan.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/55 transition hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[58vh] overflow-y-auto px-4 py-4 sm:max-h-[62vh] sm:px-5 sm:py-5">
          <div className="relative">
            <div className="absolute left-[17px] top-8 h-[calc(100%-64px)] w-px bg-gradient-to-b from-[#e1062a] via-white/15 to-fuchsia-400/40 sm:left-[19px]" />

            <TimelineStep
              step="1"
              label="Dinner"
              title={restaurant?.restaurant_name || "Choose a dinner spot"}
              meta={[
                restaurant?.cuisine || restaurant?.food_type || "Restaurant",
                restaurant?.city || null,
                restaurant?.rating ? `🌹 ${restaurant.rating}` : null,
              ]
                .filter(Boolean)
                .join(" • ")}
              description={
                restaurant
                  ? "Start with the food pick that best matches your outing."
                  : "Select a restaurant to complete the first part of your RoseOut."
              }
              imageUrl={restaurant?.image_url || null}
              active={Boolean(restaurant)}
            />

            <div className="my-2 ml-[46px] rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 sm:ml-[52px] sm:px-4">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 sm:text-[10px] sm:tracking-[0.2em]">
                Then
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-white/60 sm:text-sm">
                {restaurant && activity
                  ? buildDistanceText(restaurant, activity)
                  : "Add the activity that completes the night."}
              </p>
            </div>

            <TimelineStep
              step="2"
              label="Activity"
              title={activity?.activity_name || "Choose an activity"}
              meta={[
                activity?.activity_type || "Experience",
                activity?.city || null,
                activity?.rating ? `🌹 ${activity.rating}` : null,
              ]
                .filter(Boolean)
                .join(" • ")}
              description={
                activity
                  ? "This gives the outing a second stop and a clearer plan."
                  : "Select an experience to build the full dinner-to-activity timeline."
              }
              imageUrl={activity?.image_url || null}
              active={Boolean(activity)}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-[#e1062a]/20 bg-[#e1062a]/10 p-3 sm:mt-5 sm:p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-100/70 sm:text-[10px] sm:tracking-[0.22em]">
              Next Step
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-white sm:text-sm sm:leading-6">
              Continue to your full plan to review the selected locations,
              details, and next actions.
            </p>
          </div>
        </div>

        <div className="grid gap-2 border-t border-white/10 bg-black/40 px-4 py-3 sm:grid-cols-2 sm:px-5 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white/60 transition hover:text-white sm:text-xs sm:tracking-[0.12em]"
          >
            Edit Picks
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="rounded-full bg-[#e1062a] px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff1744] sm:text-xs sm:tracking-[0.12em]"
          >
            Continue to Full Plan →
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineStep({
  step,
  label,
  title,
  meta,
  description,
  imageUrl,
  active,
}: {
  step: string;
  label: string;
  title: string;
  meta: string;
  description: string;
  imageUrl?: string | null;
  active: boolean;
}) {
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
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={title}
                fill
                unoptimized
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-lg">
                {label === "Dinner" ? "🍽️" : "✨"}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.2em]">
              {label}
            </p>
            <h4 className="mt-1 line-clamp-1 text-sm font-black tracking-[-0.02em] text-white sm:text-base">
              {title}
            </h4>
            <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-white/45 sm:text-xs">
              {meta}
            </p>
            <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-4 text-white/55 sm:mt-2 sm:text-xs sm:leading-5">
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StartPanel() {
  const items = [
    {
      title: "Tell RoseOut the full idea",
      body: "Use a natural sentence with food, activity, location, budget, or vibe.",
    },
    {
      title: "RoseOut separates the intent",
      body: "A steak request is treated differently from bowling, karaoke, lounges, or brunch.",
    },
    {
      title: "Get tighter matched cards",
      body: "Results are ranked for fit, quality, distance, and outing flow.",
    },
  ];

  return (
    <div className="w-full max-w-full overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#0b0b0b] p-4 shadow-2xl shadow-black/40 sm:rounded-[1.25rem] sm:p-5">
      <div className="grid w-full min-w-0 gap-3 sm:gap-4 md:grid-cols-3">
        {items.map((item, index) => (
          <div
            key={item.title}
            className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
          >
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#e1062a] text-sm font-black text-white sm:mb-4 sm:h-9 sm:w-9">
              {index + 1}
            </div>

            <h3 className="break-words text-base font-black tracking-[-0.02em] text-white">
              {item.title}
            </h3>

            <p className="mt-2 text-sm font-semibold leading-6 text-white/45">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 w-full max-w-full overflow-hidden last:mb-0">
      <div className="mb-3 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-xl font-black tracking-[-0.03em] text-white">
            {title}
          </h3>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-white/38">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function ResultCard({
  index,
  type,
  id,
  imageUrl,
  title,
  eyebrow,
  address,
  rating,
  reviewCount,
  reviewKeywords,
  reviewSnippet,
  primaryTag,
  tags,
  distance,
  selected,
  priority,
  selectLabel,
  onSelect,
  detailsHref,
  onDetails,
  websiteUrl,
  onWebsite,
  reservationUrl,
  reservationLabel,
  onReservation,
}: {
  index: number;
  type: "restaurant" | "activity";
  id: string;
  imageUrl?: string;
  title: string;
  eyebrow: string;
  address: string;
  rating?: number | null;
  reviewCount?: number | null;
  reviewKeywords?: string[] | null;
  reviewSnippet?: string | null;
  primaryTag?: string | null;
  tags?: string[] | null;
  distance?: number | null;
  selected: boolean;
  priority: boolean;
  selectLabel: string;
  onSelect: () => void;
  detailsHref: string;
  onDetails: () => void;
  websiteUrl?: string;
  onWebsite?: () => void;
  reservationUrl?: string;
  reservationLabel?: string;
  onReservation?: () => void;
}) {
  const cleanTags = getDisplayTags({
    type,
    eyebrow,
    primaryTag,
    tags,
    reviewKeywords,
    reviewSnippet,
    title,
  });

  const whyPicked = getWhyPicked({
    primaryTag,
    reviewKeywords,
    reviewSnippet,
    type,
  });

  const cleanReviewKeywords = toArray(reviewKeywords).slice(0, 2);

  return (
    <article
      className={`group relative flex h-full min-h-[420px] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[1.05rem] border bg-[#101010] shadow-xl shadow-black/30 transition duration-300 hover:border-[#e1062a]/55 hover:bg-[#141414] hover:shadow-[0_0_36px_rgba(225,6,42,0.16)] sm:min-h-[445px] sm:rounded-[1.1rem] ${
        selected
          ? "border-[#e1062a] ring-2 ring-[#e1062a]/35"
          : "border-white/10"
      }`}
      style={{
        animation: `cardReveal 360ms ease-out ${index * 70}ms both`,
      }}
    >
      <div className="relative h-[138px] w-full overflow-hidden bg-neutral-950 sm:h-[165px]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            unoptimized
            priority={priority}
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition duration-700 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-bold text-white/30">
            No image available
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-black/50 to-black/5" />

        <div className="absolute right-2.5 top-2.5 flex max-w-[64%] flex-wrap justify-end gap-1 sm:right-3 sm:top-3 sm:gap-1.5">
          {cleanTags.slice(0, 2).map((tag) => (
            <span
              key={`${tag.label}-${tag.tone}`}
              className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] backdrop-blur-md sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.08em] ${tagToneClass(
                tag.tone,
              )}`}
            >
              {tag.label}
            </span>
          ))}
        </div>

        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 sm:bottom-3 sm:right-3 sm:gap-1.5">
          {distance !== null && distance !== undefined ? (
            <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white backdrop-blur sm:px-2.5 sm:py-1 sm:text-[11px]">
              {distance} mi
            </span>
          ) : null}

          {rating ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-black sm:px-2.5 sm:py-1 sm:text-[11px]">
              🌹 {rating}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-3.5">
        <div className="min-h-[112px] min-w-0 sm:min-h-[122px]">
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <p className="line-clamp-1 min-w-0 text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.22em]">
              {titleCase(eyebrow || type)}
            </p>

            {reviewCount ? (
              <p className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-black uppercase text-white/40 sm:px-2.5 sm:py-1 sm:text-[10px]">
                {formatCount(reviewCount)}
              </p>
            ) : null}
          </div>

          <Link href={detailsHref} onClick={onDetails}>
            <h3 className="line-clamp-1 break-words text-base font-black leading-tight tracking-[-0.03em] text-white transition group-hover:text-red-100 sm:text-lg">
              {title}
            </h3>
          </Link>

          <p className="mt-1.5 line-clamp-2 min-h-[36px] break-words text-xs font-semibold leading-5 text-white/42 sm:min-h-[38px]">
            {address || "Location details available on the listing."}
          </p>

          <div className="mt-2 flex min-h-[22px] flex-wrap gap-1 sm:min-h-[24px] sm:gap-1.5">
            {cleanTags.slice(0, 3).map((tag) => (
              <span
                key={`mini-${tag.label}-${tag.tone}`}
                className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/56 sm:px-2.5 sm:py-1 sm:text-[11px]"
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.045] p-2.5 backdrop-blur-md sm:p-3">
          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/32 sm:text-[9px] sm:tracking-[0.22em]">
            Why RoseOut picked this
          </p>
          <p className="mt-1.5 line-clamp-2 break-words text-[11px] font-semibold leading-4 text-white/62 sm:text-xs sm:leading-5">
            {whyPicked}
          </p>
        </div>

        <div className="mt-2 min-h-[24px] sm:min-h-[26px]">
          {cleanReviewKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-1 sm:gap-1.5">
              {cleanReviewKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full border border-[#e1062a]/20 bg-[#e1062a]/10 px-2 py-0.5 text-[10px] font-bold text-red-100/85 sm:px-2.5 sm:py-1 sm:text-[11px]"
                >
                  {keyword}
                </span>
              ))}
            </div>
          ) : primaryTag ? (
            <p className="line-clamp-1 text-xs font-black text-white/65">
              ✨ {titleCase(primaryTag)}
            </p>
          ) : null}
        </div>

        <div className="mt-auto grid min-h-[94px] grid-cols-2 gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={onSelect}
            className={`flex h-10 items-center justify-center rounded-full px-3 text-center text-xs font-black transition ${
              selected
                ? "bg-[#e1062a] text-white"
                : "border border-white/12 text-white/85 hover:bg-white hover:text-black"
            }`}
          >
            {selectLabel}
          </button>

          <Link
            href={detailsHref}
            onClick={onDetails}
            className="flex h-10 items-center justify-center rounded-full bg-white px-3 text-center text-xs font-black text-black transition hover:bg-red-100"
          >
            Details
          </Link>

          {websiteUrl ? (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWebsite}
              className="flex h-10 items-center justify-center rounded-full border border-white/12 px-3 text-center text-xs font-black text-white/80 transition hover:bg-white hover:text-black"
            >
              Website
            </a>
          ) : (
            <span aria-hidden="true" className="h-10" />
          )}

          {reservationUrl ? (
            <a
              href={reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onReservation}
              className="flex h-10 items-center justify-center rounded-full border border-[#e1062a]/35 bg-[#e1062a]/10 px-3 text-center text-xs font-black text-red-100 transition hover:bg-[#e1062a] hover:text-white"
            >
              {reservationLabel || "Book"}
            </a>
          ) : (
            <span aria-hidden="true" className="h-10" />
          )}
        </div>
      </div>
    </article>
  );
}

function LoadingResults({
  label,
  panelRef,
}: {
  label: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={panelRef}
      className="w-full max-w-full scroll-mt-24 overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#080808] p-3 shadow-2xl shadow-black/40 sm:scroll-mt-28 sm:rounded-[1.25rem] sm:p-4"
    >
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.25em]">
          RoseOut is searching
        </p>
        <h2 className="mt-1 text-xl font-black tracking-[-0.04em] sm:text-2xl">
          {label}
        </h2>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-[420px] overflow-hidden rounded-[1.05rem] border border-white/10 bg-[#101010] sm:h-[445px] sm:rounded-[1.1rem]"
          >
            <div className="h-[138px] animate-pulse bg-white/[0.06] sm:h-[165px]" />
            <div className="space-y-3 p-3 sm:p-3.5">
              <div className="h-3 w-24 animate-pulse rounded-full bg-[#e1062a]/20" />
              <div className="h-5 w-3/4 animate-pulse rounded-full bg-white/[0.08]" />
              <div className="h-4 w-full animate-pulse rounded-full bg-white/[0.06]" />
              <div className="h-4 w-4/5 animate-pulse rounded-full bg-white/[0.05]" />
              <div className="h-20 animate-pulse rounded-xl bg-white/[0.045]" />
              <div className="h-10 animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>
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

function formatCount(value: number) {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function toArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function getDisplayTags({
  type,
  eyebrow,
  primaryTag,
  tags,
  reviewKeywords,
  reviewSnippet,
  title,
}: {
  type: "restaurant" | "activity";
  eyebrow?: string | null;
  primaryTag?: string | null;
  tags?: string[] | null;
  reviewKeywords?: string[] | null;
  reviewSnippet?: string | null;
  title?: string | null;
}) {
  const sourceText = [
    type,
    eyebrow,
    primaryTag,
    ...(tags || []),
    ...(reviewKeywords || []),
    reviewSnippet,
    title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const results: { label: string; tone: "rose" | "gold" | "purple" }[] = [];

  const add = (label: string, tone: "rose" | "gold" | "purple") => {
    if (
      !results.some((item) => item.label.toLowerCase() === label.toLowerCase())
    ) {
      results.push({ label, tone });
    }
  };

  if (sourceText.includes("luxury") || sourceText.includes("upscale")) {
    add("Luxury", "gold");
  }

  if (
    sourceText.includes("fine dining") ||
    sourceText.includes("steak") ||
    sourceText.includes("restaurant") ||
    sourceText.includes("dinner") ||
    sourceText.includes("food")
  ) {
    add("Full Dining", "rose");
  }

  if (
    sourceText.includes("nightlife") ||
    sourceText.includes("lounge") ||
    sourceText.includes("cocktail") ||
    sourceText.includes("bar") ||
    sourceText.includes("club")
  ) {
    add("Nightlife", "purple");
  }

  if (
    sourceText.includes("romantic") ||
    sourceText.includes("intimate") ||
    sourceText.includes("anniversary")
  ) {
    add("Romantic", "rose");
  }

  if (sourceText.includes("birthday") || sourceText.includes("celebration")) {
    add("Birthday", "rose");
  }

  if (sourceText.includes("rooftop") || sourceText.includes("skyline")) {
    add("Rooftop", "gold");
  }

  if (sourceText.includes("brunch") || sourceText.includes("breakfast")) {
    add("Brunch", "rose");
  }

  if (
    sourceText.includes("bowling") ||
    sourceText.includes("arcade") ||
    sourceText.includes("karaoke") ||
    sourceText.includes("comedy") ||
    sourceText.includes("fun")
  ) {
    add("Fun", "purple");
  }

  if (sourceText.includes("hookah") || sourceText.includes("shisha")) {
    add("Hookah", "purple");
  }

  if (sourceText.includes("cigar")) {
    add("Cigar", "gold");
  }

  if (results.length === 0) {
    add(titleCase(primaryTag || eyebrow || type), "rose");
  }

  return results.slice(0, 3);
}

function tagToneClass(tone: "rose" | "gold" | "purple") {
  if (tone === "gold") {
    return "border-amber-300/40 bg-amber-300/20 text-amber-100";
  }

  if (tone === "purple") {
    return "border-fuchsia-400/35 bg-fuchsia-500/18 text-fuchsia-100";
  }

  return "border-[#e1062a]/45 bg-[#e1062a]/22 text-red-50";
}

function getWhyPicked({
  primaryTag,
  reviewKeywords,
  reviewSnippet,
  type,
}: {
  primaryTag?: string | null;
  reviewKeywords?: string[] | null;
  reviewSnippet?: string | null;
  type: "restaurant" | "activity";
}) {
  const keywords = toArray(reviewKeywords).slice(0, 2);

  if (keywords.length > 0) {
    return `Matched for ${keywords.join(" and ")} signals.`;
  }

  if (reviewSnippet) {
    return reviewSnippet;
  }

  if (primaryTag) {
    return `Matched for its ${titleCase(primaryTag).toLowerCase()} fit.`;
  }

  return type === "restaurant"
    ? "Matched to your food, location, and vibe."
    : "Matched to your activity and outing vibe.";
}

function buildDistanceText(
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null,
) {
  if (!restaurant || !activity) return "Dinner → Activity";

  if (restaurant.city && activity.city && restaurant.city === activity.city) {
    return `Same city flow • ${restaurant.city}`;
  }

  return "Dinner → Activity timeline";
}
