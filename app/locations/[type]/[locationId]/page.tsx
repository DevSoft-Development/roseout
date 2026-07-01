"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { clampScore } from "@/lib/clampScore";
import { trackActivity } from "@/lib/trackActivity";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import TheOutHavenMark from "@/components/brand/TheOutHavenMark";
import LocationImagePlaceholder from "@/components/public-location/LocationImagePlaceholder";
import SafeLocationImage from "@/components/public-location/SafeLocationImage";
import LocationHours from "@/components/public-location/LocationHours";
import { getLocationName } from "@/lib/locationName";
import {
  dedupePhotoUrls,
  getPhotoList,
  getPrimaryPhoto,
} from "@/lib/publicLocationPhotos";
import { getLocationScore } from "@/lib/locationScore";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import { isPublicSearchVisible } from "@/lib/locationVisibility";
import { getOperatingHours } from "@/lib/locationHours";
import {
  buildGoogleMapsSearchUrl,
  getGoogleMapsUrl,
} from "@/lib/googleDirections";
import {
  getExternalReservationProvider,
  getExternalReservationUrl,
  getInternalReservationHref,
  getReservationSourceLabel,
} from "@/lib/reservation";



type LocationDetailRecord = Record<string, unknown> & {
  id?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  business_name?: string | null;
  primary_category?: string | null;
  cuisine_type?: string | null;
  detail_location_type?: string | null;
  location_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  neighborhood?: string | null;
  price_range?: string | null;
  primary_tag?: string | null;
  description?: string | null;
  website?: string | null;
  phone?: string | null;
  reservation_enabled?: boolean | null;
  review_count?: number | string | null;
  review_score?: number | string | null;
  cuisine?: string | null;
  activity_type?: string | null;
  atmosphere?: string | null;
  quality_score?: number | string | null;
  popularity_score?: number | string | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | string | null;
  health_department_grade?: string | null;
  health_department_score?: number | string | null;
  health_department_last_inspection_date?: string | null;
  health_department_source?: string | null;
  health_department_source_url?: string | null;
};
type ReviewRecord = Record<string, unknown> & {
  id?: string | number | null;
  customer_name?: string | null;
  rating?: number | string | null;
  review_text?: string | null;
  ai_keywords?: string[] | string | null;
  vibe?: string | null;
  noise_level?: string | null;
  service_quality?: string | null;
};

function toArray(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => toArray(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .flatMap((item) => toArray(item))
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // Not JSON. Continue to comma split.
    }

    return trimmed
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((item) =>
        item
          .trim()
          .replace(/^["']|["']$/g, "")
          .replace(/^(?:and|or)\s+/i, "")
          .replace(/[-_]+/g, " "),
      )
      .filter(Boolean);
  }

  return [];
}

function formatDisplayLabel(value: unknown) {
  const text = String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

  if (!text) return "";

  return text
    .split(" ")
    .map((word) =>
      word.length <= 2
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function formatHealthDepartmentScore(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const score = Number(value);
  if (!Number.isFinite(score)) return "";
  return String(Math.round(score));
}

function formatShortDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function cleanDisplayTags(items: unknown, limit = 8) {
  return Array.from(
    new Set(
      toArray(items)
        .map(formatDisplayLabel)
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function formatTagListForSentence(items: unknown, fallback = "a polished, social mood") {
  const cleanItems = cleanDisplayTags(items, 3);

  if (cleanItems.length === 0) return fallback;
  if (cleanItems.length === 1) return cleanItems[0].toLowerCase();
  if (cleanItems.length === 2) {
    return `${cleanItems[0].toLowerCase()} and ${cleanItems[1].toLowerCase()}`;
  }

  return `${cleanItems[0].toLowerCase()}, ${cleanItems[1].toLowerCase()}, and ${cleanItems[2].toLowerCase()}`;
}

function getDisplayArea(location: LocationDetailRecord | null) {
  return [location?.neighborhood, location?.city, location?.state]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 2)
    .join(", ");
}

function getDisplayAddress(location: LocationDetailRecord | null) {
  return [location?.address, location?.city, location?.state, location?.zip_code]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .join(", ");
}

function getReviewCount(location: LocationDetailRecord | null, reviews: ReviewRecord[]) {
  return Number(location?.review_count || reviews.length || 0);
}

function buildWebsiteHref(location: LocationDetailRecord | null) {
  const website = String(location?.website || "").trim();
  if (!website) return "";
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function buildPhoneHref(location: LocationDetailRecord | null) {
  const phone = String(location?.phone || "").replace(/[^\d+]/g, "");
  return phone ? `tel:${phone}` : "";
}

function buildPlanLink(location: LocationDetailRecord | null, type: string) {
  const locationType = location?.location_type || (type.includes("activit") ? "activity" : "restaurant");
  const id = String(location?.id || "").trim();
  return `/create?locationId=${encodeURIComponent(id)}&locationType=${encodeURIComponent(String(locationType))}`;
}

function buildFullOutingLinks(location: LocationDetailRecord | null, area: string, address: string) {
  const context = address || area || getLocationName(location, "");
  const near = context ? ` near ${context}` : "";
  return [
    ["Find drinks after", `drinks after${near}`],
    ["Find an activity nearby", `activity${near}`],
    ["Find dessert", `dessert${near}`],
    ["Surprise me", `plan an outing${near}`],
  ].map(([label, query]) => ({ label, href: `/create?q=${encodeURIComponent(query)}` }));
}

function getPublicTags(location: LocationDetailRecord | null, category: string, area: string) {
  const tagMap: Record<string, string> = {
    establishment: "Good for Outings",
    point_of_interest: "Local Spot",
    food: "Dining",
    restaurant: "Restaurant",
    bar: "Drinks",
    night_club: "Nightlife",
    tourist_attraction: "Things To Do",
    bakery: "Dessert",
    cafe: "Cafe",
    museum: "Museum",
    bowling_alley: "Bowling",
    movie_theater: "Movies",
    art_gallery: "Art Gallery",
    spa: "Spa",
    shopping_mall: "Shopping",
  };
  const raw = [category, area, "TheOutHaven Pick", getLocationTags(location), location?.primary_tag].flatMap(toArray);
  return Array.from(
    new Set(
      raw
        .map((tag) => {
          const key = tag.toLowerCase().trim().replace(/\s+/g, "_");
          return tagMap[key] || formatDisplayLabel(tag);
        })
        .filter(Boolean),
    ),
  ).slice(0, 6);
}

export default function LocationDetailPage() {
  const supabase = createClient();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const type = String(params.type || "");
  const locationId = String(params.locationId || "");

  const from =
    searchParams.get("from") ||
    (typeof window !== "undefined" && document.referrer
      ? document.referrer
      : "/create");

  const [location, setLocation] = useState<LocationDetailRecord | null>(null);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    async function loadLocation() {
      setLoading(true);

      const sourceTables = type === "activities" || type === "activity"
        ? ["activities", "activity"]
        : ["restaurants", "restaurant"];
      const sourceOr = sourceTables
        .map((sourceTable) => `and(source_table.eq.${sourceTable},source_id.eq.${locationId})`)
        .join(",");
      let { data, error } = await supabase
        .from("locations")
        .select("*")
        .or(`id.eq.${locationId},${sourceOr}`)
        .maybeSingle();

      if (!data && !error) {
        const slugResult = await supabase
          .from("locations")
          .select("*")
          .eq("slug", locationId)
          .maybeSingle();

        if (!slugResult.error) {
          data = slugResult.data;
          error = slugResult.error;
        }
      }

      const demoPreview = searchParams.get("demo") === "1" && searchParams.get("fromDemoCenter") === "1" && (searchParams.get("adminLocationId") === String(data?.id || locationId) || searchParams.get("locationId") === String(data?.id || locationId));
      const demoTagged = (data as any)?.demo_key === "real_location_mirror_demo" || (data as any)?.metadata?.demo_key === "real_location_mirror_demo";
      if (error || !data || (!isPublicSearchVisible(data) && !(demoPreview && demoTagged))) {
        console.error(
          "Location fetch error:",
          error?.message ||
            (!data ? "No location found" : "Location is not public"),
        );
        setLocation(null);
        setReviews([]);
        setLoading(false);
        return;
      }

      const { data: reviewData } = await supabase
        .from("location_reviews")
        .select("*")
        .eq("location_id", data.id || locationId)
        .eq("status", "approved")
        .eq("verified_visit", true)
        .order("created_at", { ascending: false });

      setLocation(data);
      setReviews(reviewData || []);
      setLoading(false);
    }

    if (locationId) loadLocation();
  }, [locationId, searchParams, supabase, type]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 220);
    }

    onScroll();
    window.addEventListener("scroll", onScroll);

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActivity =
    location?.location_type === "activity" ||
    type === "activities" ||
    type === "activity";

  const name = getLocationName(location, "TheOutHaven Location");

  const category = getPrimaryCategory(location);

  const score = clampScore(getLocationScore(location));

  const address = getDisplayAddress(location);
  const healthGrade = formatDisplayLabel(location?.health_department_grade);
  const healthScore = formatHealthDepartmentScore(location?.health_department_score);
  const healthInspectionDate = formatShortDate(location?.health_department_last_inspection_date);
  const healthSource = String(location?.health_department_source || "Health Department").trim();
  const area = getDisplayArea(location);
  const publicTags = getPublicTags(location, category, area);
  const reviewCount = getReviewCount(location, reviews);

  const externalReservationUrl = getExternalReservationUrl(location || {});
  const externalReservationProvider = getExternalReservationProvider(location || {});
  const internalReservationHref = getInternalReservationHref(
    location || {},
    isActivity ? "activity" : "restaurant",
  );
  const reservationSource = String(location?.reservation_source || "external").toLowerCase();
  const hasInternalReservations = Boolean(
    location?.internal_reservations_enabled ||
      location?.uses_internal_reservations ||
      location?.reservation_enabled === true,
  );
  const showInternalReservation =
    (reservationSource === "internal" || reservationSource === "both") &&
    hasInternalReservations &&
    Boolean(internalReservationHref);
  const showExternalReservation =
    Boolean(externalReservationUrl) &&
    (reservationSource === "external" || reservationSource === "both");
  const primaryReservationUrl = showInternalReservation
    ? internalReservationHref || ""
    : showExternalReservation
    ? externalReservationUrl || ""
    : "";
  const secondaryReservationUrl =
    showInternalReservation && reservationSource === "both" ? externalReservationUrl || "" : "";
  const reservationUrl = primaryReservationUrl;
  const isExternalReservation = Boolean(reservationUrl) && !showInternalReservation;
  const reservationLabel = showInternalReservation
    ? "Reserve on TheOutHaven"
    : showExternalReservation && externalReservationProvider
    ? `Reserve via ${externalReservationProvider}`
    : showExternalReservation
    ? "Reserve Externally"
    : location?.booking_url
    ? "Book"
    : "";
  const reservationSourceLabel = getReservationSourceLabel(location || {});

  const mapsUrl = useMemo(() => {
    return getGoogleMapsUrl(location) || buildGoogleMapsSearchUrl(location);
  }, [location]);

  const tags = getLocationTags(location);
  const relatedExploreLinks = buildRelatedExploreLinks({
    borough: location?.borough,
    city: location?.city,
    category,
    cuisine: location?.cuisine || location?.cuisine_type || location?.activity_type,
  });
  const dateStyleTags = toArray(location?.date_style_tags);
  const reviewKeywords = toArray(location?.review_keywords);
  const bestFor = toArray(location?.best_for);
  const specialFeatures = toArray(location?.special_features);
  const signatureItems = toArray(location?.signature_items);
  const displayVibeTags = cleanDisplayTags([
    tags,
    dateStyleTags,
    reviewKeywords,
    bestFor,
    specialFeatures,
    signatureItems,
    location?.primary_tag,
    location?.atmosphere,
  ]).slice(0, 7);
  const displayBestFor = cleanDisplayTags(bestFor, 10);
  const displaySpecialFeatures = cleanDisplayTags(specialFeatures, 10);
  const displaySignatureItems = cleanDisplayTags(signatureItems, 10);

  const galleryImages = getPhotoList(location);
  const primaryPhoto = getPrimaryPhoto(location);
  const planLink = buildPlanLink(location, type);
  const websiteHref = buildWebsiteHref(location);
  const phoneHref = buildPhoneHref(location);
  const fullOutingLinks = buildFullOutingLinks(location, area, address);
  useEffect(() => {
    if (!location?.id) return;

    fetch("/api/analytics/location-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        location_id: location.id,
        event_type: "profile_view",
        event_source: "profile",
        metadata: {
          location_type: location.location_type || type,
          location_name: name,
        },
      }),
    }).catch(() => undefined);
  }, [location?.id, location?.location_type, name, type]);

  function trackBusinessEvent(eventType: "reservation_started" | "website_click" | "directions_click") {
    if (!location?.id) return;

    fetch("/api/analytics/location-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        location_id: location.id,
        event_type: eventType,
        event_source: "profile",
        metadata: baseMetadata,
      }),
    }).catch(() => undefined);
  }



  const startOutingTracking = async (method: "phone" | "external") => {
    try {
      const response = await fetch("/api/outings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: location?.id || locationId,
          location_type: location?.location_type || type,
          external_reservation_url: method === "external" ? reservationUrl : null,
          phone_number: method === "phone" ? location?.phone : null,
          contact_method: method,
          source: "location_detail_page",
          title: name,
          address,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("THEOUTHAVEN_TRACKING_FAILED", { method, reason: data?.error || response.statusText, location_id: location?.id || locationId });
        return;
      }
      console.info("THEOUTHAVEN_OUTING_TRACKING_STARTED", { method, location_id: location?.id || locationId });
    } catch (error) {
      console.error("THEOUTHAVEN_TRACKING_FAILED", { method, reason: error instanceof Error ? error.message : "unknown", location_id: location?.id || locationId });
    }
  };

  const recommendationBullets = buildRecommendationBullets({
    category,
    cuisine: location?.cuisine || location?.activity_type,
    atmosphere: formatTagListForSentence(location?.atmosphere || displayVibeTags),
    reviewKeywords: cleanDisplayTags(reviewKeywords, 6),
    bestFor: cleanDisplayTags(bestFor, 6),
    qualityScore: location?.quality_score || score,
    popularityScore: location?.popularity_score,
    vibeTags: displayVibeTags,
    city: location?.city,
  });

  const baseMetadata = {
    location_id: locationId,
    location_type: location?.location_type || type,
    location_name: name,
  };

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(from || "/create");
  }

  function trackAndGoBack() {
    trackActivity({
      eventType: "navigation",
      eventName: "Back To Results",
      pagePath: window.location.pathname,
      metadata: {
        ...baseMetadata,
        source: "location_detail_page",
      },
    });

    goBack();
  }

  if (loading) {
    return (
      <>
        <TheOutHavenHeader />

        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-5 pt-20 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(225,6,42,0.3),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(127,29,29,0.35),transparent_28%),#000]" />

          <div className="relative z-10 rounded-[2rem] border border-white/10 bg-white/5 px-8 py-6 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">
              TheOutHaven
            </p>
            <p className="mt-3 text-sm font-bold text-white/70">
              Loading location...
            </p>
          </div>
        </main>
      </>
    );
  }

  if (!location) {
    return (
      <>
        <TheOutHavenHeader />

        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-5 pt-20 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(225,6,42,0.3),transparent_32%),#000]" />

          <div className="relative z-10 max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-7 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">
              TheOutHaven
            </p>

            <h1 className="mt-4 text-3xl font-black">Location Not Found</h1>

            <p className="mt-3 text-sm leading-6 text-white/60">
              This location could not be found.
            </p>

            <button
              onClick={goBack}
              className="mt-6 rounded-full bg-red-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
            >
              Back
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TheOutHavenHeader />

      <DynamicLocationHeader
        scrolled={scrolled}
        name={name}
        category={category}
        onBack={trackAndGoBack}
        from={from}
      />

      <main className="min-h-screen overflow-x-hidden bg-[#050505] pb-28 pt-36 text-white md:pb-0">
        <section className="px-4 pb-10 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-start">
            <div className="rounded-[1.75rem] border border-white/10 bg-[#101010]/90 p-5 shadow-2xl shadow-black/30 sm:p-8 lg:p-10">
              <div className="flex flex-wrap items-center gap-2">
                <PremiumTag>{category}</PremiumTag>
                {publicTags.slice(0, 3).map((tag) => (
                  <PublicChip key={tag}>{tag}</PublicChip>
                ))}
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                {name}
              </h1>

              <p className="mt-4 text-base font-semibold text-white/68 sm:text-lg">
                {[category, area].filter(Boolean).join(" · ")}
              </p>

              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-600/10 px-4 py-2 text-sm font-extrabold text-red-50">
                <TheOutHavenMark size={22} />
                {score >= 90 ? "Elite Pick" : "TheOutHaven Pick"}
              </div>

              {(healthGrade || healthScore) && (
                <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-extrabold text-white/72">
                  <span className="text-white/50">{healthSource}</span>
                  {healthGrade ? <span>Grade {healthGrade}</span> : null}
                  {healthScore ? <span>Score {healthScore}</span> : null}
                  {healthInspectionDate ? (
                    <span className="text-white/45">Last checked {healthInspectionDate}</span>
                  ) : null}
                </div>
              )}

              {address && <p className="mt-5 text-sm leading-6 text-white/70">{address}</p>}

              <p className="mt-6 max-w-3xl text-base leading-8 text-white/74">
                {location.description ||
                  "A curated TheOutHaven pick selected for memorable outings, quality experience signals, and strong match potential."}
              </p>

              <LocationActionButtons
                planLink={planLink}
                websiteHref={websiteHref}
                phoneHref={phoneHref}
                mapsUrl={mapsUrl}
                onWebsiteClick={() => trackBusinessEvent("website_click")}
                onPhoneClick={() => { void startOutingTracking("phone"); }}
                onDirectionsClick={() => trackBusinessEvent("directions_click")}
              />

              <OutHavenRatingCard score={score} category={category} />
            </div>

            <LocationPhotoGallery images={galleryImages} primaryPhoto={primaryPhoto} name={name} />
          </div>
        </section>

        <section className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <LuxuryCard eyebrow="Why TheOutHaven picked it" title="Built for a better plan.">
                <p className="text-sm leading-7 text-white/70">
                  Selected for strong outing potential, quality signals, and local popularity{area ? ` in ${area}` : ""}.
                  {reviewCount ? ` Guests have added ${reviewCount} review${reviewCount === 1 ? "" : "s"} to the signal mix.` : ""}
                  {score ? ` Match confidence is currently ${score} / 100.` : ""}
                </p>
              </LuxuryCard>

              <FullOutingCard links={fullOutingLinks} />

              <AtAGlanceCard
                area={area}
                category={category}
                address={address}
                reviews={reviewCount}
                photos={galleryImages.length}
                score={score}
              />

              <LuxuryCard eyebrow="Customer reviews" title="What people are saying.">
                {reviews.length === 0 ? (
                  <p className="text-sm leading-7 text-white/60">
                    Verified guest reviews will appear here after TheOutHaven outings.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-black text-white">{review.customer_name || "TheOutHaven Guest"}</p>
                          <p className="rounded-full border border-red-300/25 bg-red-600/15 px-3 py-1 text-xs font-black text-red-50">{review.rating}/5</p>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-white/70">{review.review_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </LuxuryCard>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-36 lg:self-start">
              <LuxuryCard eyebrow="Plan your visit" title="Ready when you are.">
                <LocationHours
                  operating_hours={getOperatingHours(location)}
                  special_hours={location?.special_hours}
                  google_current_opening_hours={location?.google_current_opening_hours}
                  google_regular_opening_hours={location?.google_regular_opening_hours}
                  google_utc_offset_minutes={location?.google_utc_offset_minutes as number | string | null}
                  timezone={(location?.timezone || location?.time_zone) as string | null}
                  city={location?.city}
                  state={location?.state}
                  id={location?.id as string | null}
                  name={getLocationName(location)}
                />
                {reservationSourceLabel && <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-rose-200/80">{reservationSourceLabel}</p>}
                <LocationActionButtons
                  planLink={planLink}
                  websiteHref={websiteHref}
                  phoneHref={phoneHref}
                  mapsUrl={mapsUrl}
                  stacked
                  onWebsiteClick={() => trackBusinessEvent("website_click")}
                  onPhoneClick={() => { void startOutingTracking("phone"); }}
                  onDirectionsClick={() => trackBusinessEvent("directions_click")}
                />
                <button onClick={trackAndGoBack} className="mt-3 w-full rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black">Back to Results</button>
              </LuxuryCard>
            </aside>
          </div>
        </section>
      </main>

      <MobileStickyLocationBar name={name} meta={area || category} planLink={planLink} phoneHref={phoneHref} mapsUrl={mapsUrl} onPhoneClick={() => { void startOutingTracking("phone"); }} onDirectionsClick={() => trackBusinessEvent("directions_click")} />

    </>
  );
}


function buildRelatedExploreLinks({
  borough,
  city,
  category,
  cuisine,
}: {
  borough?: unknown;
  city?: unknown;
  category?: unknown;
  cuisine?: unknown;
}) {
  const links: { label: string; href: string }[] = [];
  const area = String(borough || city || "").trim();
  const areaSlug = area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const categoryText = `${category || ""} ${cuisine || ""}`.toLowerCase();

  if (["queens", "brooklyn", "manhattan", "bronx", "staten-island", "long-island"].includes(areaSlug)) {
    links.push({ label: `More in ${area}`, href: `/explore/${areaSlug}` });
  }
  if (categoryText.includes("steak")) links.push({ label: "More steak restaurants", href: "/explore/steak-restaurants" });
  if (categoryText.includes("brunch")) links.push({ label: "More brunch spots", href: "/explore/brunch-spots" });
  if (categoryText.includes("hookah")) links.push({ label: "More hookah lounges", href: "/explore/hookah-lounges" });
  if (categoryText.includes("rooftop")) links.push({ label: "More rooftop restaurants", href: "/explore/rooftop-restaurants" });

  links.push({ label: "Date night ideas", href: "/explore/date-night" });
  return links.filter((link, index, all) => all.findIndex((item) => item.href === link.href) === index).slice(0, 5);
}

function LocationActionButtons({
  planLink,
  websiteHref,
  phoneHref,
  mapsUrl,
  stacked = false,
  onWebsiteClick,
  onPhoneClick,
  onDirectionsClick,
}: {
  planLink: string;
  websiteHref: string;
  phoneHref: string;
  mapsUrl: string;
  stacked?: boolean;
  onWebsiteClick: () => void;
  onPhoneClick: () => void;
  onDirectionsClick: () => void;
}) {
  return (
    <div className={`mt-7 ${stacked ? "grid gap-3" : "flex flex-wrap gap-3"}`}>
      <Link href={planLink} className="rounded-full bg-red-600 px-6 py-3 text-center text-sm font-black text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500">
        Plan an Outing Here
      </Link>
      {websiteHref && (
        <a href={websiteHref} target="_blank" rel="noopener noreferrer" onClick={onWebsiteClick} className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black">
          Visit Website
        </a>
      )}
      {phoneHref && (
        <a href={phoneHref} onClick={onPhoneClick} className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black">
          Call
        </a>
      )}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={onDirectionsClick} className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black">
          Get Directions
        </a>
      )}
    </div>
  );
}

function LocationPhotoGallery({ images, primaryPhoto, name }: { images: string[]; primaryPhoto: string; name: string }) {
  const safePhotos = primaryPhoto && images[0] !== primaryPhoto
    ? dedupePhotoUrls([primaryPhoto, ...images]).slice(0, 5)
    : images.slice(0, 5);
  const mainPhoto = safePhotos[0] || "";
  const thumbs = safePhotos.slice(1, 3);

  return (
    <div className="grid gap-3">
      <div className="relative min-h-[260px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111114] shadow-2xl shadow-black/30 sm:min-h-[360px] lg:min-h-[520px]">
        {mainPhoto ? (
          <SafeLocationImage src={mainPhoto} alt={name} priority fallbackType="placeholder" />
        ) : (
          <LocationImagePlaceholder label="Photo coming soon" />
        )}
        {safePhotos.length > 1 && mainPhoto && (
          <a href={mainPhoto} target="_blank" rel="noopener noreferrer" className="absolute bottom-4 right-4 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs font-black text-white backdrop-blur-xl">
            {safePhotos.length} photos
          </a>
        )}
      </div>
      {thumbs.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {thumbs.map((image, index) => (
            <a key={image} href={image} target="_blank" rel="noopener noreferrer" className="relative h-32 overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] empty:hidden">
              <SafeLocationImage src={image} alt={`${name} photo ${index + 2}`} fallbackType="hide" className="transition duration-500 hover:scale-105" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function OutHavenRatingCard({ score, category }: { score: number; category: string }) {
  const chips = category.toLowerCase().includes("restaurant")
    ? ["Date night", "Dinner", "Group outing", "Celebration"]
    : ["Date night", "Activity", "Group outing", "Celebration"];
  return (
    <section className="mt-7 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{score >= 90 ? "Elite Pick" : "Great outing potential"}</p>
          <p className="mt-1 text-sm leading-6 text-white/62">Strong fit based on quality signals, popularity, and outing potential.</p>
        </div>
        <p className="rounded-full border border-red-300/20 bg-red-600/10 px-4 py-2 text-sm font-black text-red-50">{score}% match confidence</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{chips.map((chip) => <PublicChip key={chip}>{chip}</PublicChip>)}</div>
    </section>
  );
}

function FullOutingCard({ links }: { links: { label: string; href: string }[] }) {
  return (
    <LuxuryCard eyebrow="Make it a full outing" title="Pair this spot with something nearby.">
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-full border border-red-300/20 bg-red-600/10 px-4 py-2 text-sm font-black text-red-50 transition hover:bg-red-600 hover:text-white">
            {link.label}
          </Link>
        ))}
      </div>
    </LuxuryCard>
  );
}

function AtAGlanceCard({ area, category, address, reviews, photos, score }: { area: string; category: string; address: string; reviews: number; photos: number; score: number }) {
  const items = [
    ["Area", area],
    ["Category", category],
    ["Address", address],
    ["Reviews", reviews ? `${reviews}` : ""],
    ["Photos", photos ? `${photos}` : ""],
    ["Match level", score ? `${score} / 100` : ""],
  ].filter(([, value]) => Boolean(value));
  return (
    <LuxuryCard eyebrow="At a glance" title="The essentials.">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(([label, value]) => <QuickDetail key={label} label={label} value={value} />)}
      </div>
    </LuxuryCard>
  );
}

function MobileStickyLocationBar({ name, meta, planLink, phoneHref, mapsUrl, onPhoneClick, onDirectionsClick }: { name: string; meta: string; planLink: string; phoneHref: string; mapsUrl: string; onPhoneClick: () => void; onDirectionsClick: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/90 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl md:hidden">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{name}</p>
          <p className="truncate text-xs font-bold text-white/55">{meta}</p>
        </div>
        {phoneHref && <a aria-label="Call" href={phoneHref} onClick={onPhoneClick} className="rounded-full border border-white/15 px-3 py-2 text-xs font-black text-white">Call</a>}
        {mapsUrl && <a aria-label="Get directions" href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={onDirectionsClick} className="rounded-full border border-white/15 px-3 py-2 text-xs font-black text-white">Map</a>}
        <Link href={planLink} className="rounded-full bg-red-600 px-4 py-2.5 text-sm font-black text-white">Plan Here</Link>
      </div>
    </div>
  );
}

function DynamicLocationHeader({
  scrolled,
  name,
  category,
  onBack,
  from,
}: {
  scrolled: boolean;
  name: string;
  category: string;
  onBack: () => void;
  from: string;
}) {
  return (
    <header
      className={`fixed left-0 top-20 z-40 w-full border-b transition-all duration-300 ${
        scrolled
          ? "border-white/10 bg-black/85 shadow-2xl backdrop-blur-2xl"
          : "border-transparent bg-black/20 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="shrink-0 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white hover:text-black"
          >
            ← Back
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/45">
              <Link href="/" className="transition hover:text-white">
                Home
              </Link>
              <span>/</span>
              <a
                href={from || "/create"}
                className="transition hover:text-white"
              >
                Results
              </a>
              <span>/</span>
              <span className="truncate text-red-300">{formatDisplayLabel(category)}</span>
            </div>

            <p
              className={`mt-1 truncate font-black tracking-tight transition-all ${
                scrolled
                  ? "max-w-[210px] text-base text-white sm:max-w-[520px] sm:text-xl"
                  : "max-w-[180px] text-sm text-white/70 sm:max-w-[420px]"
              }`}
            >
              {scrolled ? name : "TheOutHaven Pick"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/create"
            className="hidden rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white transition hover:bg-white hover:text-black sm:inline-flex"
          >
            New Search
          </a>

          <a
            href="/create"
            className={`rounded-full px-5 py-2.5 text-sm font-black shadow-lg transition ${
              scrolled
                ? "bg-red-600 text-white shadow-red-950/40 hover:bg-red-500"
                : "bg-white text-black hover:bg-red-600 hover:text-white"
            }`}
          >
            Plan an Outing
          </a>
        </div>
      </div>
    </header>
  );
}

function LuxuryCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.035] to-red-950/[0.08] p-6 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-red-300/80">
        {eyebrow}
      </p>

      <h2 className="mt-3 text-3xl font-black tracking-tight">{title}</h2>

      <div className="mt-4">{children}</div>
    </section>
  );
}

function PremiumTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-red-400/20 bg-red-950/25 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-red-50 shadow-sm shadow-red-950/20">
      {children}
    </span>
  );
}

function PublicChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.055] px-3.5 py-1.5 text-xs font-bold text-white/76">
      {children}
    </span>
  );
}

function HavenMark({ className = "" }: { className?: string }) {
  return <TheOutHavenMark size={24} className={className} />;
}

function DetailGrid({ title, items }: { title: string; items: string[] }) {
  const cleanItems = cleanDisplayTags(items, 12);

  if (cleanItems.length === 0) return null;

  return (
    <LuxuryCard eyebrow={title} title={title}>
      <div className="flex flex-wrap gap-2">
        {cleanItems.map((item) => (
          <PremiumTag key={item}>{item}</PremiumTag>
        ))}
      </div>
    </LuxuryCard>
  );
}

function QuickDetail({ label, value }: { label: string; value: string | number }) {
  const displayValue =
    typeof value === "string" && label !== "Hours"
      ? formatDisplayLabel(value) || value
      : value;

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-4 shadow-lg shadow-black/20">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-200/45">
        {label}
      </p>
      <p className="mt-2 line-clamp-2 text-sm font-black text-white/85">
        {displayValue}
      </p>
    </div>
  );
}

function EditorialTile({ label, value }: { label: string; value: string }) {
  const displayValue = label === "Experience" ? value : formatDisplayLabel(value) || value;

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-200/60">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-white/70">{displayValue}</p>
    </div>
  );
}

function buildRecommendationBullets({
  category,
  cuisine,
  atmosphere,
  reviewKeywords,
  bestFor,
  qualityScore,
  popularityScore,
  vibeTags,
  city,
}: {
  category: string;
  cuisine?: string | null;
  atmosphere?: string | null;
  reviewKeywords: string[];
  bestFor: string[];
  qualityScore?: number | string | null;
  popularityScore?: number | string | null;
  vibeTags: string[];
  city?: string | null;
}) {
  const primary = formatDisplayLabel(cuisine || category).toLowerCase();
  const bullets = [
    `A strong match for guests looking for ${primary || "a polished experience"}${city ? ` in ${city}` : ""}.`,
    bestFor[0]
      ? `Especially useful for ${formatTagListForSentence(bestFor)} plans where the setting matters.`
      : `A polished option for date nights, celebrations, and intentional outings.`,
    atmosphere || vibeTags.length > 0
      ? `The overall feel leans ${formatTagListForSentence(atmosphere || vibeTags)}, helping guests choose the right mood before they go.`
      : reviewKeywords[0]
        ? `Imported review language points to ${formatTagListForSentence(reviewKeywords, "positive guest signals")} as notable guest signals.`
        : `Recommended when guests want a more elevated plan without sorting through generic listings.`,
  ];

  if (Number(qualityScore || 0) >= 80 || Number(popularityScore || 0) >= 80) {
    bullets.push("Quality and popularity signals make it a standout candidate for high-intent searches.");
  } else if (vibeTags[0]) {
    bullets.push(`TheOutHaven sees this as a natural fit for ${formatTagListForSentence(vibeTags)} moments.`);
  }

  return bullets.slice(0, 4);
}

function MiniInsight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-white/80">
        {formatDisplayLabel(value) || value}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>

      <p className="mt-1 break-words font-bold text-white/80">{value}</p>
    </div>
  );
}
