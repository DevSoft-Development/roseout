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
  latitude?: number | string | null;
  longitude?: number | string | null;
  cuisine?: string | null;
  food_type?: string | null;
  atmosphere?: string | null;
  price_range?: string | null;
  reservation_link?: string | null;
  reservation_url?: string | null;
  website?: string | null;
  image_url?: string | null;
  rating?: number | null;
  review_score?: number | null;
  review_keywords?: string[] | null;
  review_snippet?: string | null;
  primary_tag?: string | null;
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
  latitude?: number | string | null;
  longitude?: number | string | null;
  price_range?: string | null;
  atmosphere?: string | null;
  group_friendly?: boolean | null;
  reservation_link?: string | null;
  reservation_url?: string | null;
  website?: string | null;
  image_url?: string | null;
  rating?: number | null;
  review_score?: number | null;
  review_keywords?: string[] | null;
  review_snippet?: string | null;
  primary_tag?: string | null;
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

type FallbackOption = {
  title: string;
  label: string;
  description: string;
};

type AddOnTarget = "restaurant" | "activity";

type UserLocation = {
  latitude: number;
  longitude: number;
};

const LOCATION_KEY = "theouthaven_user_location";
const RESULT_CARD_UI_VERSION = "results-card-clean-v2";

const typingSearches = [
  "Steak restaurant with bowling in Queens",
  "Romantic Italian restaurant in Brooklyn",
  "Birthday brunch with rooftop vibes",
  "Affordable date night near me",
  "Sushi with karaoke after the restaurant",
  "Luxury seafood restaurant in Manhattan",
  "Hookah lounge with food nearby",
  "Fun date night with arcade games",
];

const formatTypingPrompt = (prompt: string) => `${prompt}....`;
const INITIAL_TYPING_PROMPT = formatTypingPrompt(typingSearches[0]);

const loadingLines = [
  "Matching your vibe...",
  "Checking food and activity signals...",
  "Building tighter TheOutHaven picks...",
  "Finding the best fit...",
];

const fallbackOptions: FallbackOption[] = [
  {
    title: "Dessert counter",
    label: "Easy pivot",
    description:
      "Keep a casual dessert stop ready if the main plan wraps early or you want one more move.",
  },
  {
    title: "Walkable lounge",
    label: "Second option",
    description:
      "Use a nearby drinks or lounge option when the first experience is full, loud, or not the vibe.",
  },
  {
    title: "Simple reset",
    label: "Low pressure",
    description:
      "Save a coffee, scenic walk, or quick bite fallback so the outing still feels intentional.",
  },
];

export default function CreatePage() {
  const router = useRouter();

  const [input, setInput] = useState("");
  const [addOnInput, setAddOnInput] = useState("");
  const [typedPlaceholder, setTypedPlaceholder] = useState(
    INITIAL_TYPING_PROMPT
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [activeAddOnTarget, setActiveAddOnTarget] =
    useState<AddOnTarget | null>(null);
  const [error, setError] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<RestaurantCard | null>(null);
  const [selectedActivity, setSelectedActivity] =
    useState<ActivityCard | null>(null);
  const [locationSaved, setLocationSaved] = useState(false);
  const [showPlanSummary, setShowPlanSummary] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const addOnInputRef = useRef<HTMLTextAreaElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const addOnSearchRef = useRef<HTMLDivElement | null>(null);
  const addOnLoadingRef = useRef<HTMLDivElement | null>(null);
  const addOnRestaurantSectionRef = useRef<HTMLDivElement | null>(null);
  const addOnActivitySectionRef = useRef<HTMLDivElement | null>(null);
  const activitySectionRef = useRef<HTMLDivElement | null>(null);
  const viewedItems = useRef<Set<string>>(new Set());
  const processedPromptRef = useRef<string | null>(null);

  const latestAssistant = useMemo(
    () =>
      [...messages].reverse().find((message) => message.role === "assistant"),
    [messages]
  );

  const hasSelection = Boolean(selectedRestaurant || selectedActivity);
  const hasResults = Boolean(
    (latestAssistant?.restaurants?.length || 0) +
      (latestAssistant?.activities?.length || 0)
  );

  const selectedPlanText = [
    selectedRestaurant?.restaurant_name,
    selectedActivity?.activity_name,
  ]
    .filter(Boolean)
    .join(" + ");

  useEffect(() => {
    document.title = "Create Your Outing | TheOutHaven";

    const timer = window.setTimeout(() => {
      setLocationSaved(Boolean(getSavedLocation()));

      const prompt = new URLSearchParams(window.location.search).get("prompt");
      const cleanPrompt = prompt?.trim();

      if (!cleanPrompt || processedPromptRef.current === cleanPrompt) return;

      processedPromptRef.current = cleanPrompt;
      setInput(cleanPrompt);
      void submitSearch(cleanPrompt);
    }, 0);

    return () => window.clearTimeout(timer);
    // The query prompt should only hydrate the first landing from homepage cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let searchIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    function typeLoop() {
      const currentSearch = typingSearches[searchIndex];
      const fullPrompt = formatTypingPrompt(currentSearch);

      if (!deleting) {
        setTypedPlaceholder(fullPrompt.slice(0, charIndex + 1));
        charIndex++;

        if (charIndex === fullPrompt.length) {
          deleting = true;
          timeout = setTimeout(typeLoop, 1300);
          return;
        }
      } else {
        setTypedPlaceholder(fullPrompt.slice(0, charIndex - 1));
        charIndex--;

        if (charIndex === 0) {
          deleting = false;
          searchIndex = (searchIndex + 1) % typingSearches.length;
          timeout = setTimeout(typeLoop, 260);
          return;
        }
      }

      timeout = setTimeout(typeLoop, deleting ? 32 : 55);
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
    const latest = latestAssistant;
    if (!latest) return;

    [...(latest.restaurants || []), ...(latest.activities || [])].forEach(
      (item: RestaurantCard | ActivityCard) => {
        const itemType = "restaurant_name" in item ? "restaurant" : "activity";
        const key = `${itemType}-${item.id}`;

        if (!item.id || viewedItems.current.has(key)) return;

        viewedItems.current.add(key);

        trackAnalytics({
          itemId: String(item.id),
          itemType,
          eventType: "view",
        });
      }
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

  function requestUserLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation: UserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        localStorage.setItem(LOCATION_KEY, JSON.stringify(userLocation));
        setLocationSaved(true);
        setError("");
      },
      () => {
        setLocationSaved(false);
        setError("Please allow location access or search by neighborhood.");
      }
    );
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

  function scrollToResultsPanel() {
    if (!resultsRef.current) return;

    const top =
      resultsRef.current.getBoundingClientRect().top + window.scrollY - 118;

    window.scrollTo({
      top: Math.max(top, 0),
      behavior: "smooth",
    });
  }

  function scrollToElement(element: HTMLElement | null) {
    if (!element) return;

    const top = element.getBoundingClientRect().top + window.scrollY - 118;

    window.scrollTo({
      top: Math.max(top, 0),
      behavior: "smooth",
    });
  }

  function scrollToAddOnSearchPanel() {
    scrollToElement(addOnSearchRef.current);
    window.setTimeout(() => addOnInputRef.current?.focus(), 300);
  }

  function scrollToAddOnLoadingCards() {
    scrollToElement(addOnLoadingRef.current || addOnSearchRef.current);
  }

  function scrollToAddOnResultsSection(addOnTarget: AddOnTarget) {
    const targetElement =
      addOnTarget === "activity"
        ? addOnActivitySectionRef.current
        : addOnRestaurantSectionRef.current;

    scrollToElement(targetElement || addOnSearchRef.current);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
  }

  function handleAddOnInputChange(
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) {
    setAddOnInput(event.target.value);
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

  async function submitSearch(
    cleanInput: string,
    options: { addOnTarget?: AddOnTarget; preservePlan?: boolean } = {}
  ) {
    if (!cleanInput || loading) return;

    const { addOnTarget, preservePlan = false } = options;
    const previousAssistant = latestAssistant;

    setLoading(true);
    setActiveAddOnTarget(addOnTarget || null);
    setError("");
    setShowPlanSummary(false);

    if (!preservePlan) {
      setSelectedRestaurant(null);
      setSelectedActivity(null);
    }

    const userMessage: Message = {
      role: "user",
      content: addOnTarget ? `Add-on search: ${cleanInput}` : cleanInput,
    };

    setMessages((current) => [...current, userMessage]);

    setTimeout(
      addOnTarget ? scrollToAddOnLoadingCards : scrollToResultsPanel,
      140
    );

    try {
      const savedLocation = getSavedLocation();

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: cleanInput,
          messages: [...messages, userMessage],
          ...(savedLocation
            ? {
                latitude: savedLocation.latitude,
                longitude: savedLocation.longitude,
                lat: savedLocation.latitude,
                lng: savedLocation.longitude,
              }
            : {}),
        }),
      });

      const data: ApiResponse & { error?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "TheOutHaven could not create results.");
      }

      const previousRestaurants = previousAssistant?.restaurants || [];
      const previousActivities = previousAssistant?.activities || [];
      const responseRestaurants = data.restaurants || [];
      const responseActivities = data.activities || [];

      const dedupedResults = dedupeSearchResults({
        restaurants:
          addOnTarget === "activity" && previousRestaurants.length
            ? previousRestaurants
            : responseRestaurants,
        activities:
          addOnTarget === "restaurant" && previousActivities.length
            ? previousActivities
            : responseActivities,
      });

      const assistantMessage: Message = {
        role: "assistant",
        content:
          data.reply ||
          (addOnTarget
            ? "Here are add-on matches while keeping your previous outing options visible."
            : "Here are strong TheOutHaven matches based on your outing request."),
        restaurants: dedupedResults.restaurants,
        activities: dedupedResults.activities,
      };

      setMessages((current) => [...current, assistantMessage]);

      setTimeout(
        () =>
          addOnTarget
            ? scrollToAddOnResultsSection(addOnTarget)
            : scrollToResultsPanel(),
        250
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
      setActiveAddOnTarget(null);
    }
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();

    const cleanInput = input.trim();

    if (!cleanInput || loading) return;

    setInput("");
    await submitSearch(cleanInput);
  }

  async function handleAddOnSubmit(event?: React.FormEvent) {
    event?.preventDefault();

    const cleanInput = addOnInput.trim();

    if (!cleanInput || loading) return;

    const addOnTarget = inferAddOnTarget(
      cleanInput,
      selectedRestaurant,
      selectedActivity
    );

    setAddOnInput("");
    await submitSearch(cleanInput, { addOnTarget, preservePlan: true });
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

    localStorage.setItem("theouthaven_plan", JSON.stringify(plan));

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
              Your next outing, planned smarter.
            </h1>

            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/55 sm:mt-4 sm:text-base">
              Type exactly what you want. TheOutHaven matches food, activities,
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
                  <div className="pointer-events-none absolute left-3 top-3.5 z-10 max-w-[calc(100%-1.5rem)] truncate text-sm font-semibold leading-6 text-white sm:left-4 sm:top-4 sm:text-base sm:leading-7">
                    <span>
                      {typedPlaceholder}
                    </span>
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

      <section
        ref={resultsRef}
        className="mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-5 sm:px-6 sm:py-8"
      >
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
            const isAddOnResults =
              messages[index - 1]?.role === "user" &&
              messages[index - 1]?.content.startsWith("Add-on search:");

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
                className="w-full max-w-full overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#080808] p-3 shadow-2xl shadow-black/40 sm:rounded-[1.25rem] sm:p-4"
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
                      Select a restaurant, then choose the experience that completes
                      the outing.
                    </p>
                  </div>
                </div>

                {restaurants.length > 0 && (
                  <div
                    ref={isAddOnResults ? addOnRestaurantSectionRef : null}
                    className="scroll-mt-24 sm:scroll-mt-28"
                  >
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
                          imageUrl={restaurant.image_url || undefined}
                          title={restaurant.restaurant_name}
                          eyebrow={
                            restaurant.cuisine ||
                            restaurant.food_type ||
                            "Restaurant"
                          }
                          address={formatAddress(restaurant)}
                          rating={restaurant.rating}
                          reviewKeywords={restaurant.review_keywords}
                          reviewSnippet={restaurant.review_snippet}
                          primaryTag={restaurant.primary_tag}
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
                  </div>
                )}

                {activities.length > 0 && (
                  <div
                    ref={(element) => {
                      activitySectionRef.current = element;

                      if (isAddOnResults) {
                        addOnActivitySectionRef.current = element;
                      }
                    }}
                    className="scroll-mt-24 sm:scroll-mt-28"
                  >
                    <ResultSection
                      title="Experience Picks"
                      subtitle="Activities matched to your outing plan"
                    >
                      {activities.map((activity, activityIndex) => {
                        const activityId = String(activity.id);
                        const isSelected =
                          selectedActivity?.id === activity.id;
                        const reservationUrl =
                          activity.reservation_url ||
                          activity.reservation_link ||
                          undefined;
                        const distanceFromRestaurantLabel = selectedRestaurant
                          ? buildDistanceFromRestaurantLabel(
                              selectedRestaurant,
                              activity
                            )
                          : undefined;

                        return (
                          <ResultCard
                            key={activityId || activityIndex}
                            index={activityIndex}
                            type="activity"
                            imageUrl={activity.image_url || undefined}
                            title={activity.activity_name}
                            eyebrow={activity.activity_type || "Activity"}
                            address={formatAddress(activity)}
                            rating={activity.rating}
                            reviewKeywords={activity.review_keywords}
                            reviewSnippet={activity.review_snippet}
                            primaryTag={activity.primary_tag}
                            distance={
                              selectedRestaurant
                                ? distanceBetweenLocations(
                                    selectedRestaurant,
                                    activity
                                  ) ?? activity.distance_miles
                                : activity.distance_miles
                            }
                            distanceLabel={distanceFromRestaurantLabel}
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
                            onReservation={() =>
                              trackActivityClick(activityId)
                            }
                          />
                        );
                      })}
                    </ResultSection>
                  </div>
                )}

                <FallbackPlanCard />
              </div>
            );
          })}

          {loading && !activeAddOnTarget ? (
            <LoadingResults label={loadingLines[loadingIndex]} />
          ) : null}

          {hasResults && !loading ? (
            <AddOnSearchPrompt onOpen={scrollToAddOnSearchPanel} />
          ) : null}
        </div>

        {hasResults ? (
          <>
            <AddOnSearchPanel
              refEl={addOnSearchRef}
              inputRef={addOnInputRef}
              value={addOnInput}
              loading={loading}
              selectedRestaurant={selectedRestaurant}
              selectedActivity={selectedActivity}
              onChange={handleAddOnInputChange}
              onSubmit={handleAddOnSubmit}
            />

            {loading && activeAddOnTarget ? (
              <div
                ref={addOnLoadingRef}
                className="mt-4 scroll-mt-24 sm:mt-5 sm:scroll-mt-28"
              >
                <LoadingResults label={loadingLines[loadingIndex]} />
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {hasSelection && (
        <div className="fixed bottom-0 left-0 z-50 w-full border-t border-white/10 bg-black/90 shadow-[0_-18px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.2em]">
                Your TheOutHaven Plan
              </p>

              <p className="max-w-full truncate text-sm font-bold text-white sm:max-w-[52vw]">
                {selectedPlanText || "Selected outing"}
              </p>

              <p className="hidden text-xs font-semibold text-white/40 sm:block">
                Review your restaurant-to-activity timeline before continuing.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowPlanSummary(true)}
              className="w-full shrink-0 rounded-full bg-[#e1062a] px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-900/40 transition hover:bg-[#ff1744] sm:w-auto sm:px-5 sm:text-xs sm:tracking-[0.12em]"
            >
              Review Your TheOutHaven →
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
          onAddRestaurant={() => {
            setShowPlanSummary(false);
            window.setTimeout(scrollToAddOnSearchPanel, 120);
          }}
          onAddActivity={() => {
            setShowPlanSummary(false);
            window.setTimeout(scrollToAddOnSearchPanel, 120);
          }}
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

function normalizeResultIdentityValue(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resultIdentityKey(item: RestaurantCard | ActivityCard) {
  const name =
    "restaurant_name" in item ? item.restaurant_name : item.activity_name;
  const nameAddressKey = normalizeResultIdentityValue(
    [name, item.address, item.city, item.state, item.zip_code]
      .filter(Boolean)
      .join(" ")
  );

  return nameAddressKey || normalizeResultIdentityValue(String(item.id || ""));
}

function dedupeResultList<T extends RestaurantCard | ActivityCard>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = resultIdentityKey(item);

    if (!key) return true;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function resultDistanceValue(item: RestaurantCard | ActivityCard) {
  const distance = Number(item.distance_miles);

  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

function sortResultsNearFirst<T extends RestaurantCard | ActivityCard>(
  items: T[]
) {
  if (!items.some((item) => Number.isFinite(Number(item.distance_miles)))) {
    return items;
  }

  return [...items].sort(
    (a, b) => resultDistanceValue(a) - resultDistanceValue(b)
  );
}

function dedupeSearchResults({
  restaurants,
  activities,
}: {
  restaurants: RestaurantCard[];
  activities: ActivityCard[];
}) {
  const dedupedRestaurants = dedupeResultList(restaurants);
  const restaurantKeys = new Set(dedupedRestaurants.map(resultIdentityKey));
  const dedupedActivities = dedupeResultList(activities).filter(
    (activity) => !restaurantKeys.has(resultIdentityKey(activity))
  );

  return {
    restaurants: sortResultsNearFirst(dedupedRestaurants),
    activities: sortResultsNearFirst(dedupedActivities),
  };
}

function AddOnSearchPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-[1.1rem] border border-[#e1062a]/25 bg-[#e1062a]/10 p-3 text-center shadow-xl shadow-red-950/10 sm:rounded-[1.25rem] sm:p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-100/70">
        Need one more stop?
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 rounded-full bg-[#e1062a] px-5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-950/35 transition hover:bg-[#ff1744] sm:text-xs"
      >
        Add-On Search
      </button>
    </div>
  );
}

function AddOnSearchPanel({
  refEl,
  inputRef,
  value,
  loading,
  selectedRestaurant,
  selectedActivity,
  onChange,
  onSubmit,
}: {
  refEl: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  loading: boolean;
  selectedRestaurant: RestaurantCard | null;
  selectedActivity: ActivityCard | null;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event?: React.FormEvent) => void;
}) {
  const targetLabel = getAddOnTargetLabel(selectedRestaurant, selectedActivity);

  return (
    <div
      ref={refEl}
      className="mt-5 scroll-mt-24 rounded-[1.15rem] border border-white/10 bg-[#0b0b0b] p-3 shadow-2xl shadow-black/30 sm:mt-6 sm:rounded-[1.25rem] sm:p-4"
    >
      <div className="mb-3">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a] sm:text-[10px]">
          Add-On Search
        </p>
        <h3 className="mt-1 text-xl font-black tracking-[-0.03em] text-white sm:text-2xl">
          Add a {targetLabel} to this outing
        </h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-white/45 sm:text-sm">
          Search for one more restaurant or activity. TheOutHaven will keep the
          matching results from your previous search visible while showing the
          new add-on results.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          ref={inputRef}
          value={value}
          onChange={onChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={2}
          placeholder={`Search for an add-on ${targetLabel}, like rooftop lounge, karaoke, sushi, or brunch`}
          className="h-[94px] w-full resize-none rounded-2xl border border-white/10 bg-black px-3 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-[#e1062a]/70 sm:px-4 sm:text-base"
        />

        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="w-full rounded-full bg-[#e1062a] px-5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-red-950/35 transition hover:bg-[#ff1744] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:text-xs"
        >
          {loading ? "Finding Add-Ons..." : "Search Add-Ons"}
        </button>
      </form>
    </div>
  );
}

function PlanSummarySheet({
  restaurant,
  activity,
  onClose,
  onContinue,
  onAddRestaurant,
  onAddActivity,
}: {
  restaurant: RestaurantCard | null;
  activity: ActivityCard | null;
  onClose: () => void;
  onContinue: () => void;
  onAddRestaurant: () => void;
  onAddActivity: () => void;
}) {
  const summaryDescription = getPlanSummaryDescription(restaurant, activity);
  const nextStepText = getPlanNextStepText(restaurant, activity);

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
                Your outing is almost ready
              </h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-white/45 sm:text-sm sm:leading-6">
                {summaryDescription}
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
              label="Restaurant"
              title={restaurant?.restaurant_name || "Choose a restaurant"}
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
                  : activity
                    ? "No restaurant selected yet — you can continue with the activity or add one later."
                    : "Select a restaurant to complete the first part of your TheOutHaven."
              }
              imageUrl={restaurant?.image_url || null}
              active={Boolean(restaurant)}
              actionLabel={
                activity && !restaurant ? "Add Restaurant" : undefined
              }
              onAction={activity && !restaurant ? onAddRestaurant : undefined}
            />

            {restaurant && activity ? (
              <div className="my-2 ml-[46px] rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 sm:ml-[52px] sm:px-4">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 sm:text-[10px] sm:tracking-[0.2em]">
                  Distance
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-white/60 sm:text-sm">
                  {buildDistanceText(restaurant, activity)}
                </p>
              </div>
            ) : null}

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
                  ? restaurant
                    ? "This pairs your restaurant with an experience that completes the outing."
                    : "This activity can anchor your outing on its own."
                  : restaurant
                    ? "Add an experience if you want to turn the restaurant into a full outing."
                    : "Select an experience to build the full restaurant-to-activity timeline."
              }
              imageUrl={activity?.image_url || null}
              active={Boolean(activity)}
              actionLabel={
                restaurant && !activity ? "Add Activity" : undefined
              }
              onAction={restaurant && !activity ? onAddActivity : undefined}
            />

            <TimelineStep
              step="3"
              label="Fallback"
              title={getFallbackTitle(restaurant, activity)}
              meta="Backup move • easy pivot"
              description="Keep one flexible fallback ready in case timing, availability, or the vibe changes after your first stop."
              imageUrl={null}
              active={Boolean(restaurant || activity)}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-[#e1062a]/20 bg-[#e1062a]/10 p-3 sm:mt-5 sm:p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-100/70 sm:text-[10px] sm:tracking-[0.22em]">
              Next Step
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-white sm:text-sm sm:leading-6">
              {nextStepText}
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
            {restaurant && activity
              ? "Continue to Full Plan →"
              : "Continue With Current Pick →"}
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
  actionLabel,
  onAction,
}: {
  step: string;
  label: string;
  title: string;
  meta: string;
  description: string;
  imageUrl?: string | null;
  active: boolean;
  actionLabel?: string;
  onAction?: () => void;
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
                {label === "Restaurant" ? "🍽️" : "✨"}
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

            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                className="mt-3 rounded-full border border-white/12 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-white/80 transition hover:bg-white hover:text-black sm:text-[11px]"
              >
                {actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StartPanel() {
  const items = [
    {
      icon: "💬",
      step: "01",
      title: "Describe the whole outing",
      body: "Type the food, activity, neighborhood, budget, or vibe in one sentence.",
      example: "Example: romantic restaurant and karaoke in Queens",
    },
    {
      icon: "✨",
      step: "02",
      title: "Let TheOutHaven sort the fit",
      body: "We separate restaurants, activities, location, and vibe so the results feel intentional.",
      example: "Try: affordable birthday brunch with games",
    },
    {
      icon: "🗺️",
      step: "03",
      title: "Pick your plan faster",
      body: "Choose a restaurant, add an experience, then review the full outing flow.",
      example: "Tip: add a borough, city, or nearby request",
    },
  ];

  return (
    <div className="w-full max-w-full overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.18),transparent_34%),linear-gradient(135deg,#101010_0%,#060606_100%)] p-4 shadow-2xl shadow-black/45 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
            How it works
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            Plan your outing in one serach.
          </h2>
        </div>
      </div>

      <div className="grid w-full min-w-0 gap-3 sm:gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.step}
            className="group min-w-0 rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20 transition hover:border-[#e1062a]/35 hover:bg-white/[0.065] sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/45 text-xl shadow-inner shadow-white/5">
                {item.icon}
              </div>

              <span className="rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-100/75">
                {item.step}
              </span>
            </div>

            <h3 className="break-words text-lg font-black tracking-[-0.03em] text-white">
              {item.title}
            </h3>

            <p className="mt-2 text-sm font-semibold leading-6 text-white/55">
              {item.body}
            </p>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs font-bold leading-5 text-white/62">
                {item.example}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function FallbackPlanCard() {
  return (
    <section className="mt-5 rounded-[1.15rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.16),transparent_36%),#101010] p-4 shadow-xl shadow-black/25 sm:rounded-[1.25rem] sm:p-5">
      <div className="mb-4 max-w-2xl">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.25em]">
          Fallback options
        </p>
        <h3 className="mt-1 text-xl font-black tracking-[-0.035em] text-white sm:text-2xl">
          Keep a backup move ready.
        </h3>
        <p className="mt-1 text-sm font-semibold leading-6 text-white/45">
          If a spot is booked, too far, or not the vibe, use one of these
          flexible pivots to keep the outing easy.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {fallbackOptions.map((option) => (
          <article
            key={option.title}
            className="rounded-3xl border border-white/10 bg-black/45 p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">
              {option.label}
            </p>
            <h4 className="mt-5 text-base font-black text-white">
              {option.title}
            </h4>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
              {option.description}
            </p>
          </article>
        ))}
      </div>
    </section>
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
  imageUrl,
  title,
  eyebrow,
  address,
  rating,
  reviewKeywords,
  reviewSnippet,
  primaryTag,
  distance,
  distanceLabel,
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
  imageUrl?: string;
  title: string;
  eyebrow: string;
  address: string;
  rating?: number | null;
  reviewKeywords?: string[] | null;
  reviewSnippet?: string | null;
  primaryTag?: string | null;
  distance?: number | null;
  distanceLabel?: string;
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
  const whyPicked = getWhyPicked({
    primaryTag,
    reviewKeywords,
    reviewSnippet,
    type,
  });

  return (
    <article
      data-ui-version={RESULT_CARD_UI_VERSION}
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

        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 sm:bottom-3 sm:right-3 sm:gap-1.5">
          {!distanceLabel && distance !== null && distance !== undefined ? (
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
          </div>

          <Link href={detailsHref} onClick={onDetails}>
            <h3 className="line-clamp-1 break-words text-base font-black leading-tight tracking-[-0.03em] text-white transition group-hover:text-red-100 sm:text-lg">
              {title}
            </h3>
          </Link>

          <p className="mt-1.5 line-clamp-2 break-words text-xs font-semibold leading-5 text-white/42">
            {address || "Location details available on the listing."}
          </p>

          {distanceLabel ? (
            <div className="mt-2 inline-flex w-fit rounded-full border border-[#e1062a]/35 bg-[#e1062a]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-red-50 shadow-lg shadow-red-950/20 sm:text-[11px]">
              {distanceLabel}
            </div>
          ) : null}
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.045] p-2.5 backdrop-blur-md sm:p-3">
          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/32 sm:text-[9px] sm:tracking-[0.22em]">
            Why TheOutHaven picked this
          </p>
          <p className="mt-1.5 line-clamp-2 break-words text-[11px] font-semibold leading-4 text-white/62 sm:text-xs sm:leading-5">
            {whyPicked}
          </p>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={onSelect}
            className={`rounded-full px-3 py-2.5 text-xs font-black transition ${
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
            className="rounded-full bg-white px-3 py-2.5 text-center text-xs font-black text-black transition hover:bg-red-100"
          >
            Details
          </Link>

          {websiteUrl ? (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWebsite}
              className="rounded-full border border-white/12 px-3 py-2.5 text-center text-xs font-black text-white/80 transition hover:bg-white hover:text-black"
            >
              Website
            </a>
          ) : null}

          {reservationUrl ? (
            <a
              href={reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onReservation}
              className="rounded-full border border-[#e1062a]/35 bg-[#e1062a]/10 px-3 py-2.5 text-center text-xs font-black text-red-100 transition hover:bg-[#e1062a] hover:text-white"
            >
              {reservationLabel || "Book"}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LoadingResults({ label }: { label: string }) {
  return (
    <div className="w-full max-w-full overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#080808] p-3 shadow-2xl shadow-black/40 sm:rounded-[1.25rem] sm:p-4">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#e1062a] sm:text-[10px] sm:tracking-[0.25em]">
          TheOutHaven is searching
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

function toArray(value: unknown): string[] {
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

function getAddOnTargetLabel(
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
) {
  if (restaurant && !activity) return "activity";
  if (activity && !restaurant) return "restaurant";
  return "restaurant or activity";
}

function inferAddOnTarget(
  input: string,
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
): AddOnTarget {
  if (restaurant && !activity) return "activity";
  if (activity && !restaurant) return "restaurant";

  const normalized = input.toLowerCase();
  const activityWords = [
    "activity",
    "activities",
    "arcade",
    "bowling",
    "club",
    "comedy",
    "experience",
    "hookah",
    "karaoke",
    "lounge",
    "museum",
    "nightlife",
    "paint",
    "rooftop",
    "show",
  ];

  return activityWords.some((word) => normalized.includes(word))
    ? "activity"
    : "restaurant";
}

function getPlanSummaryDescription(
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
) {
  if (restaurant && activity) {
    return "Review your restaurant and activity flow before moving to the full plan.";
  }

  if (restaurant) {
    return "Review your restaurant pick before moving to the full plan.";
  }

  if (activity) {
    return "Review your activity pick before moving to the full plan.";
  }

  return "Choose a restaurant, an activity, or both to build your outing.";
}


function getFallbackTitle(
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
) {
  if (restaurant && activity) return "Save a nearby dessert or lounge backup";
  if (restaurant) return "Save a simple second-stop backup";
  if (activity) return "Save a quick food or dessert backup";

  return "Save a flexible backup option";
}

function getPlanNextStepText(
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
) {
  if (restaurant && activity) {
    return "Open the full plan to confirm the route, timing, booking links, and final details.";
  }

  if (restaurant) {
    return "Open the full plan to review the restaurant details, reservation options, and next actions.";
  }

  if (activity) {
    return "Open the full plan to review the activity details, booking options, and next actions.";
  }

  return "Add a pick or continue to review the details you have so far.";
}

function getLocationCoordinates(item: {
  latitude?: number | string | null;
  longitude?: number | string | null;
}) {
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
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
) {
  if (!restaurant || !activity) return null;

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

function buildDistanceFromRestaurantLabel(
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
) {
  if (!restaurant || !activity) return undefined;

  const distance = distanceBetweenLocations(restaurant, activity);

  if (distance === null) return undefined;

  return `${distance} miles from ${restaurant.restaurant_name}`;
}

function buildDistanceText(
  restaurant: RestaurantCard | null,
  activity: ActivityCard | null
) {
  if (restaurant && activity) {
    const distanceLabel = buildDistanceFromRestaurantLabel(restaurant, activity);

    if (distanceLabel) {
      return activity.activity_name
        ? `${distanceLabel} to ${activity.activity_name}`
        : distanceLabel;
    }

    if (restaurant.city && activity.city && restaurant.city === activity.city) {
      return `Same city flow • ${restaurant.city}`;
    }

    return "Restaurant → Activity timeline";
  }

  if (restaurant) return "Restaurant selected • Add an activity if you want one.";
  if (activity) return "Activity selected • Add a restaurant if you want one.";

  return "Choose a restaurant or activity to start your outing.";
}
