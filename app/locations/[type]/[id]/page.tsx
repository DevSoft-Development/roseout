"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { clampScore } from "@/lib/clampScore";
import ScoreBadge from "@/components/ScoreBadge";
import { trackActivity } from "@/lib/trackActivity";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationScore } from "@/lib/locationScore";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import { isPublicSearchVisible } from "@/lib/locationVisibility";
import {
  formatOperatingHoursForDisplay,
  getOperatingHours,
} from "@/lib/locationHours";
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

export default function LocationDetailPage() {
  const supabase = createClient();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const type = String(params.type || "");
  const id = String(params.id || "");

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

      const sourceTable = type === "activities" || type === "activity" ? "activities" : "restaurants";
      let { data, error } = await supabase
        .from("locations")
        .select("*")
        .or(`id.eq.${id},and(source_table.eq.${sourceTable},source_id.eq.${id})`)
        .maybeSingle();

      if (!data && !error) {
        const slugResult = await supabase
          .from("locations")
          .select("*")
          .eq("slug", id)
          .maybeSingle();

        if (!slugResult.error) {
          data = slugResult.data;
          error = slugResult.error;
        }
      }

      if (error || !data || !isPublicSearchVisible(data)) {
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
        .eq("location_id", data.id || id)
        .order("created_at", { ascending: false });

      setLocation(data);
      setReviews(reviewData || []);
      setLoading(false);
    }

    if (id) loadLocation();
  }, [id, supabase, type]);

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

  const address = [
    location?.address,
    location?.city,
    location?.state,
    location?.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

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
  const operatingHoursDisplay = formatOperatingHoursForDisplay(
    getOperatingHours(location),
  );
  const galleryImages = Array.from(
    new Set(
      [
        getLocationImage(location),
        location?.main_image,
        location?.image_url,
        location?.photo_url,
        location?.cover_image,
        location?.hero_image,
        location?.thumbnail_url,
        location?.google_photo_url,
        location?.google_image_url,
        location?.yelp_image_url,
        ...toArray(location?.images),
        ...toArray(location?.photos),
        ...toArray(location?.gallery_images),
        ...toArray(location?.image_urls),
        ...toArray(location?.photo_urls),
      ]
        .map((image) => String(image || "").trim())
        .filter((image) => image && image !== "null" && image !== "undefined"),
    ),
  ) as string[];
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
          location_id: location?.id || id,
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
        console.error("THEOUTHAVEN_TRACKING_FAILED", { method, reason: data?.error || response.statusText, location_id: location?.id || id });
        return;
      }
      console.info("THEOUTHAVEN_OUTING_TRACKING_STARTED", { method, location_id: location?.id || id });
    } catch (error) {
      console.error("THEOUTHAVEN_TRACKING_FAILED", { method, reason: error instanceof Error ? error.message : "unknown", location_id: location?.id || id });
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
    location_id: id,
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
        reservationUrl={reservationUrl}
        isExternalReservation={isExternalReservation}
        reservationLabel={reservationLabel}
        from={from}
      />

      <main className="min-h-screen bg-[#050202] pt-20 text-white">
        <section className="relative min-h-[88vh] overflow-hidden">
          {getLocationImage(location) ? (
            <Image
              src={getLocationImage(location)}
              alt={name}
              fill
              priority
              className="object-cover opacity-60"
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(220,38,38,0.32),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(127,29,29,0.26),transparent_30%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050202] via-black/78 to-black/25" />

          <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5 pb-10 pt-24 sm:px-8">
            <div className="mt-auto grid items-end gap-8 pb-8 lg:grid-cols-[1fr_330px]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">
                  TheOutHaven Location
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <PremiumTag>{formatDisplayLabel(category)}</PremiumTag>

                  {location.price_range && (
                    <PremiumTag>{location.price_range}</PremiumTag>
                  )}

                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-black uppercase tracking-wide text-white backdrop-blur-xl">
                    <HavenMark className="h-5 w-5 text-[9px]" />
                    {location.review_count || reviews.length || 0} Reviews
                  </span>

                  {galleryImages.length > 0 && (
                    <span className="rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-black uppercase tracking-wide text-white backdrop-blur-xl">
                      {galleryImages.length === 1 ? "1 Photo" : `${galleryImages.length} Photos`}
                    </span>
                  )}
                </div>

                <h1 className="mt-5 max-w-5xl text-5xl font-black tracking-tight sm:text-6xl lg:text-8xl">
                  {name}
                </h1>

                {location.primary_tag && (
                  <p className="mt-5 inline-flex items-center gap-2 text-xl font-black text-red-100">
                    <HavenMark />
                    {formatDisplayLabel(location.primary_tag)}
                  </p>
                )}

                {address && (
                  <p className="mt-5 max-w-3xl text-sm font-semibold leading-6 text-white/75">
                    {address}
                  </p>
                )}

                <p className="mt-6 max-w-3xl text-base leading-8 text-white/75 md:text-lg">
                  {location.description ||
                    "A curated TheOutHaven location selected for memorable outings, quality experiences, and strong match potential."}
                </p>

                {displayVibeTags.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {displayVibeTags.map((tag) => (
                      <PremiumTag key={tag}>{tag}</PremiumTag>
                    ))}
                  </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  {reservationUrl && (
                    <a
                      href={reservationUrl}
                      target={isExternalReservation ? "_blank" : undefined}
                      rel={
                        isExternalReservation
                          ? "noopener noreferrer"
                          : undefined
                      }
                      onClick={() => { trackBusinessEvent("reservation_started"); void startOutingTracking("external"); }}
                      className="rounded-full bg-red-600 px-7 py-3 text-sm font-black text-white shadow-lg shadow-red-950/50 transition hover:bg-red-500"
                    >
                      {reservationLabel}
                    </a>
                  )}

                  {secondaryReservationUrl && (
                    <a href={secondaryReservationUrl} target="_blank" rel="noopener noreferrer" onClick={() => { trackBusinessEvent("reservation_started"); void startOutingTracking("external"); }} className="rounded-full border border-red-300/30 px-7 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/10">
                      Reserve Externally
                    </a>
                  )}

                  {!reservationUrl && location.website && (
                    <a
                      href={location.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackBusinessEvent("website_click")}
                      className="rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
                    >
                      Website
                    </a>
                  )}

                  {location?.phone ? (
                    <a
                      href={`tel:${String(location.phone).replace(/[^\d+]/g, "")}`}
                      onClick={() => { void startOutingTracking("phone"); }}
                      className="rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
                    >
                      Call Location
                    </a>
                  ) : null}

                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackBusinessEvent("directions_click")}
                      className="rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
                    >
                      {location.website || reservationUrl ? "Get Directions" : "View on Google Maps"}
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/15 bg-black/55 p-3 text-white shadow-2xl shadow-red-950/20 backdrop-blur-xl">
                <ScoreBadge score={score} />

                {Number(location.review_score || 0) >= 85 && (
                  <div className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-300/25 bg-red-600/20 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.16em] text-red-50">
                    <HavenMark className="h-5 w-5 text-[9px]" />
                    Review Favorite
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#090303] px-5 py-5 shadow-2xl shadow-black/30">
          <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <QuickDetail label="Category" value={category} />
            <QuickDetail label="Neighborhood" value={location.neighborhood || location.city || "Explore area"} />
            <QuickDetail label="Hours" value={operatingHoursDisplay || "Confirm directly"} />
            <QuickDetail label="Reservations" value={reservationUrl ? "Available" : "Call or visit website"} />
            <QuickDetail label="Best for" value={displayBestFor[0] || formatDisplayLabel(location.primary_tag) || "Curated outing"} />
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#050202] px-5 py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(225,6,42,0.18),transparent_30%)]" />

          <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <LuxuryCard
                eyebrow="Why TheOutHaven Recommends It"
                title="Editorial match notes."
              >
                <div className="grid gap-3">
                  {recommendationBullets.map((bullet) => (
                    <div key={bullet} className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-4 text-sm font-semibold leading-7 text-white/72">
                      {bullet}
                    </div>
                  ))}
                </div>
              </LuxuryCard>

              <LuxuryCard eyebrow="About / Experience" title="What to expect.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorialTile
                    label="Atmosphere"
                    value={formatTagListForSentence(
                      location.atmosphere || location.primary_tag,
                      "Curated hospitality setting",
                    )}
                  />
                  <EditorialTile label="Signature" value={displaySignatureItems[0] || displaySpecialFeatures[0] || "Memorable experience moments"} />
                  <EditorialTile label="Experience" value={location.description || "Selected for guests looking for elevated plans with a clear sense of place."} />
                  <EditorialTile label="Planning note" value={reservationUrl ? "Reserve ahead for the smoothest visit." : "Confirm hours and availability before heading out."} />
                </div>
              </LuxuryCard>

              {relatedExploreLinks.length > 0 && (
                <LuxuryCard eyebrow="Related Discovery" title="Explore nearby and similar places.">
                  <div className="flex flex-wrap gap-2">
                    {relatedExploreLinks.map((link) => (
                      <Link key={link.href} href={link.href} className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/75 transition hover:bg-white hover:text-black">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </LuxuryCard>
              )}

              {galleryImages.length > 0 && (
                <LuxuryCard eyebrow="Photo Gallery" title="A closer look.">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {galleryImages.slice(0, 6).map((image, index) => (
                      <a
                        key={`${image}-${index}`}
                        href={image}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.04]"
                      >
                        <Image
                          src={image}
                          alt={`${name} gallery photo ${index + 1}`}
                          width={520}
                          height={380}
                          className="h-52 w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      </a>
                    ))}
                  </div>
                  <p className="mt-4 text-xs font-bold text-white/40">Tap any photo to open it full size. Mobile guests can swipe horizontally in the browser photo view.</p>
                </LuxuryCard>
              )}

              {displayBestFor.length > 0 && (
                <DetailGrid title="Best For" items={displayBestFor} />
              )}

              {displaySpecialFeatures.length > 0 && (
                <DetailGrid title="Special Features" items={displaySpecialFeatures} />
              )}

              {displaySignatureItems.length > 0 && (
                <DetailGrid title="Signature Picks" items={displaySignatureItems} />
              )}

              <LuxuryCard
                eyebrow="Customer Reviews"
                title="What people are saying."
              >
                {reviews.length === 0 ? (
                  <p className="text-sm leading-7 text-white/60">
                    Curated and imported review snippets will appear here when available. Public review submission is hidden until visits can be verified.
                  </p>
                ) : (
                  <div className="mt-6 space-y-4">
                    {reviews.map((review) => (
                      <div
                        key={review.id}
                        className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-black text-white">
                            {review.customer_name || "TheOutHaven Guest"}
                          </p>

                          <p className="inline-flex items-center gap-2 rounded-full border border-red-300/25 bg-red-600/20 px-3 py-1 text-xs font-black text-red-50">
                            <HavenMark className="h-5 w-5 text-[9px]" />
                            {review.rating}/5
                          </p>
                        </div>

                        <p className="mt-3 text-sm leading-7 text-white/70">
                          {review.review_text}
                        </p>

                        {cleanDisplayTags(toArray(review.ai_keywords), 6).length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {cleanDisplayTags(toArray(review.ai_keywords), 6).map((keyword) => (
                              <span
                                key={keyword}
                                className="rounded-full border border-red-300/20 bg-red-950/30 px-3 py-1 text-xs font-bold text-red-50"
                              >
                                {formatDisplayLabel(keyword)}
                              </span>
                            ))}
                          </div>
                        )}

                        {(review.vibe ||
                          review.noise_level ||
                          review.service_quality) && (
                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            {review.vibe && (
                              <MiniInsight label="Vibe" value={review.vibe} />
                            )}

                            {review.noise_level && (
                              <MiniInsight
                                label="Noise"
                                value={review.noise_level}
                              />
                            )}

                            {review.service_quality && (
                              <MiniInsight
                                label="Service"
                                value={review.service_quality}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </LuxuryCard>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-36 lg:self-start">
              <LuxuryCard
                eyebrow="Plan Your Visit"
                title={
                  isActivity ? "Book the experience." : "Reserve the table."
                }
              >
                {operatingHoursDisplay && (
                  <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                    <InfoRow label="Hours" value={operatingHoursDisplay} />
                  </div>
                )}

                {reservationSourceLabel && (
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-rose-200/80">
                    {reservationSourceLabel}
                  </p>
                )}

                <div className="mt-6 grid gap-3">
                  {reservationUrl && (
                    <a
                      href={reservationUrl}
                      target={isExternalReservation ? "_blank" : undefined}
                      rel={
                        isExternalReservation
                          ? "noopener noreferrer"
                          : undefined
                      }
                      onClick={() => { trackBusinessEvent("reservation_started"); void startOutingTracking("external"); }}
                      className="rounded-full bg-red-600 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-red-500"
                    >
                      {reservationLabel}
                    </a>
                  )}

                  {secondaryReservationUrl && (
                    <a href={secondaryReservationUrl} target="_blank" rel="noopener noreferrer" onClick={() => { trackBusinessEvent("reservation_started"); void startOutingTracking("external"); }} className="rounded-full border border-red-300/30 px-5 py-3 text-center text-sm font-black text-red-100 transition hover:bg-red-500/10">
                      Reserve Externally
                    </a>
                  )}

                  {!reservationUrl && location.website && (
                    <a
                      href={location.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackBusinessEvent("website_click")}
                      className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
                    >
                      Visit Website
                    </a>
                  )}

                  {location?.phone ? (
                    <a
                      href={`tel:${String(location.phone).replace(/[^\d+]/g, "")}`}
                      onClick={() => { void startOutingTracking("phone"); }}
                      className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
                    >
                      Call Location
                    </a>
                  ) : null}

                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackBusinessEvent("directions_click")}
                      className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
                    >
                      {location.website || reservationUrl ? "Get Directions" : "View on Google Maps"}
                    </a>
                  ) : null}

                  <button
                    onClick={trackAndGoBack}
                    className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
                  >
                    Back to Results
                  </button>
                </div>
              </LuxuryCard>

              <LuxuryCard
                eyebrow="Review Intelligence"
                title="Powered by real words."
              >
                <div className="mt-5 space-y-4 text-sm">
                  <InfoRow
                    label="Review Score"
                    value={location.review_score || 0}
                  />

                  <InfoRow
                    label="Review Count"
                    value={location.review_count || reviews.length || 0}
                  />

                  <InfoRow
                    label="Recommendation Signals"
                    value={
                      reviewKeywords.length > 0
                        ? `${reviewKeywords.length} imported signals`
                        : "Not enough verified data yet"
                    }
                  />
                </div>
              </LuxuryCard>
            </aside>
          </div>
        </section>
      </main>

      {reservationUrl && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-full border border-white/10 bg-black/85 p-2 shadow-2xl backdrop-blur-xl md:hidden">
          <a
            href={reservationUrl}
            target={isExternalReservation ? "_blank" : undefined}
            rel={isExternalReservation ? "noopener noreferrer" : undefined}
            className="block rounded-full bg-red-600 px-6 py-4 text-center text-sm font-black text-white"
          >
            {reservationLabel} at {name}
          </a>
        </div>
      )}
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

function DynamicLocationHeader({
  scrolled,
  name,
  category,
  onBack,
  reservationUrl,
  isExternalReservation,
  reservationLabel,
  from,
}: {
  scrolled: boolean;
  name: string;
  category: string;
  onBack: () => void;
  reservationUrl: string;
  isExternalReservation: boolean;
  reservationLabel: string;
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

          {reservationUrl && (
            <a
              href={reservationUrl}
              target={isExternalReservation ? "_blank" : undefined}
              rel={isExternalReservation ? "noopener noreferrer" : undefined}
              className={`rounded-full px-5 py-2.5 text-sm font-black shadow-lg transition ${
                scrolled
                  ? "bg-red-600 text-white shadow-red-950/40 hover:bg-red-500"
                  : "bg-white text-black hover:bg-red-600 hover:text-white"
              }`}
            >
              {reservationLabel}
            </a>
          )}
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

function HavenMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-300/30 bg-red-600/20 text-[13px] font-black text-red-50 shadow-sm shadow-red-950/30 ${className}`}
      aria-hidden="true"
    >
      ◆
    </span>
  );
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
