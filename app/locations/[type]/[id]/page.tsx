"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { clampScore } from "@/lib/clampScore";
import ScoreBadge from "@/components/ScoreBadge";
import { trackActivity } from "@/lib/trackActivity";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import LocationReviewForm from "@/components/LocationReviewForm";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationScore } from "@/lib/locationScore";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import {
  formatOperatingHoursForDisplay,
  getOperatingHours,
} from "@/lib/locationHours";
import {
  buildGoogleMapsSearchUrl,
  getGoogleMapsUrl,
} from "@/lib/googleDirections";
import {
  getExternalReservationUrl,
  getInternalReservationHref,
} from "@/lib/reservation";

function toArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);

  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
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

  const [location, setLocation] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    async function loadLocation() {
      setLoading(true);

      let { data, error } = await supabase
  .from("locations")
  .select("*")
  .eq("id", id)
  .maybeSingle();

if (!data && (type === "restaurants" || type === "restaurant")) {
  const fallback = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  data = fallback.data
    ? {
        ...fallback.data,
        location_type: "restaurant",
      }
    : null;

  error = fallback.error;
}

if (!data && (type === "activities" || type === "activity")) {
  const fallback = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  data = fallback.data
    ? {
        ...fallback.data,
        location_type: "activity",
      }
    : null;

  error = fallback.error;
}

if (error || !data) {
  console.error("Location fetch error:", error?.message || "No location found");
  setLocation(null);
  setReviews([]);
  setLoading(false);
  return;
}

      const { data: reviewData } = await supabase
        .from("location_reviews")
        .select("*")
        .eq("location_id", id)
        .order("created_at", { ascending: false });

      setLocation(data);
      setReviews(reviewData || []);
      setLoading(false);
    }

    if (id) loadLocation();
  }, [id, supabase]);

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

  const externalReservationUrl = getExternalReservationUrl(location);
  const internalReservationHref = getInternalReservationHref(
    location,
    isActivity ? "activity" : "restaurant"
  );
  const reservationUrl =
    location?.reservation_enabled === true
      ? internalReservationHref || ""
      : externalReservationUrl || "";
  const isExternalReservation =
    Boolean(reservationUrl) && location?.reservation_enabled !== true;
  const reservationLabel =
    location?.reservation_enabled === true
      ? "Reserve on TheOutHaven"
      : "Reserve on Partner Site";

  const mapsUrl = useMemo(() => {
    return getGoogleMapsUrl(location) || buildGoogleMapsSearchUrl(location);
  }, [location]);

  const tags = getLocationTags(location);
  const dateStyleTags = toArray(location?.date_style_tags);
  const reviewKeywords = toArray(location?.review_keywords);
  const bestFor = toArray(location?.best_for);
  const specialFeatures = toArray(location?.special_features);
  const signatureItems = toArray(location?.signature_items);
  const operatingHoursDisplay = formatOperatingHoursForDisplay(
    getOperatingHours(location)
  );

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

  function handleReviewSubmitted(data: any) {
    const newReview = {
      id: `temp-${Date.now()}`,
      customer_name: data.customer_name || "TheOutHaven Guest",
      rating: data.rating || 5,
      review_text: data.review_text || "Review submitted successfully.",
      created_at: new Date().toISOString(),
      ai_keywords: data.ai?.keywords || [],
      ai_sentiment: data.ai?.sentiment || "neutral",
      ai_score_boost: data.ai?.score_boost || 0,
      vibe: data.ai?.vibe || null,
      noise_level: data.ai?.noise_level || null,
      date_night: data.ai?.date_night || false,
      service_quality: data.ai?.service_quality || null,
      food_quality: data.ai?.food_quality || null,
      ambiance_quality: data.ai?.ambiance_quality || null,
    };

    setReviews((prev) => [newReview, ...prev]);

    setLocation((prev: any) =>
      prev
        ? {
            ...prev,
            review_score: data.review_score ?? prev.review_score,
            review_count: data.review_count ?? prev.review_count,
            review_keywords: data.keywords ?? prev.review_keywords,
          }
        : prev
    );
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

      <main className="min-h-screen bg-black pt-20 text-white">
        <section className="relative min-h-screen overflow-hidden">
          {getLocationImage(location) ? (
            <Image
              src={getLocationImage(location)}
              alt={name}
              fill
              priority
              className="object-cover opacity-45"
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(225,6,42,0.34),transparent_34%),radial-gradient(circle_at_78%_8%,rgba(127,29,29,0.4),transparent_28%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/35" />

          <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5 pb-10 pt-24 sm:px-8">
            <div className="mt-auto grid items-end gap-8 pb-8 lg:grid-cols-[1fr_330px]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">
                  TheOutHaven Location
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-black">
                    {category}
                  </span>

                  {location.price_range && (
                    <span className="rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-black uppercase tracking-wide text-white backdrop-blur-xl">
                      {location.price_range}
                    </span>
                  )}

                  <span className="rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-black uppercase tracking-wide text-white backdrop-blur-xl">
                    🌸 {location.review_count || reviews.length || 0} Reviews
                  </span>
                </div>

                <h1 className="mt-5 max-w-5xl text-5xl font-black tracking-tight sm:text-6xl lg:text-8xl">
                  {name}
                </h1>

                {location.primary_tag && (
                  <p className="mt-5 text-xl font-black text-red-200">
                    ✨ {location.primary_tag}
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

                {reviewKeywords.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {reviewKeywords.slice(0, 6).map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs font-black text-red-100"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  {reservationUrl && (
                    <a
                      href={reservationUrl}
                      target={isExternalReservation ? "_blank" : undefined}
                      rel={
                        isExternalReservation ? "noopener noreferrer" : undefined
                      }
                      className="rounded-full bg-red-600 px-7 py-3 text-sm font-black text-white shadow-lg shadow-red-950/50 transition hover:bg-red-500"
                    >
                      {reservationLabel}
                    </a>
                  )}

                  {location.website && (
                    <a
                      href={location.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
                    >
                      Website
                    </a>
                  )}

                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
                    >
                      Get Directions
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/15 bg-white/10 p-5 text-white shadow-2xl backdrop-blur-xl">
                <ScoreBadge score={score} />

                <p className="mt-4 text-sm leading-6 text-white/65">
                  TheOutHaven uses location details, review words, vibe signals, and
                  experience quality to improve recommendations.
                </p>

                {Number(location.review_score || 0) >= 85 && (
                  <div className="mt-4 rounded-full bg-red-600 px-4 py-2 text-center text-xs font-black text-white shadow-lg shadow-red-950/40">
                    🌹 Review Favorite
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-black px-5 py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(225,6,42,0.18),transparent_30%)]" />

          <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <LuxuryCard
                eyebrow="Why TheOutHaven Recommends It"
                title="Built for better matches."
              >
                <p className="text-sm leading-7 text-white/60">
                  {location.description ||
                    "This location includes signals that help TheOutHaven understand the vibe, atmosphere, and best use cases for customers searching in full sentences."}
                </p>

                {[...tags, ...dateStyleTags, ...reviewKeywords].length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[...new Set([...tags, ...dateStyleTags, ...reviewKeywords])].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/60"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </LuxuryCard>

              {bestFor.length > 0 && (
                <DetailGrid title="Best For" items={bestFor} />
              )}

              {specialFeatures.length > 0 && (
                <DetailGrid title="Special Features" items={specialFeatures} />
              )}

              {signatureItems.length > 0 && (
                <DetailGrid title="Signature Picks" items={signatureItems} />
              )}

              <LuxuryCard
                eyebrow="Customer Reviews"
                title="What people are saying."
              >
                {reviews.length === 0 ? (
                  <p className="text-sm leading-7 text-white/60">
                    No reviews yet. Be the first to type a full-sentence review.
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

                          <p className="rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white">
                            {"🌸".repeat(Number(review.rating || 0))}{" "}
                            {review.rating}/5
                          </p>
                        </div>

                        <p className="mt-3 text-sm leading-7 text-white/70">
                          {review.review_text}
                        </p>

                        {toArray(review.ai_keywords).length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {toArray(review.ai_keywords)
                              .slice(0, 6)
                              .map((keyword) => (
                                <span
                                  key={keyword}
                                  className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-100"
                                >
                                  {keyword}
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

              <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-1 shadow-2xl backdrop-blur-xl">
                <LocationReviewForm
                  locationId={location.id}
                  locationName={name}
                  onReviewSubmitted={handleReviewSubmitted}
                />
              </section>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-36 lg:self-start">
              <LuxuryCard
                eyebrow="Plan Your Visit"
                title={isActivity ? "Book the experience." : "Reserve the table."}
              >
                {operatingHoursDisplay && (
                  <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                    <InfoRow label="Hours" value={operatingHoursDisplay} />
                  </div>
                )}

                <div className="mt-6 grid gap-3">
                  {reservationUrl && (
                    <a
                      href={reservationUrl}
                      target={isExternalReservation ? "_blank" : undefined}
                      rel={
                        isExternalReservation ? "noopener noreferrer" : undefined
                      }
                      className="rounded-full bg-red-600 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-red-500"
                    >
                      {reservationLabel}
                    </a>
                  )}

                  {location.website && (
                    <a
                      href={location.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
                    >
                      Visit Website
                    </a>
                  )}

                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white hover:text-black"
                    >
                      Get Directions
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
                    label="AI Keywords"
                    value={
                      reviewKeywords.length > 0
                        ? reviewKeywords.slice(0, 6).join(", ")
                        : "Not enough reviews yet"
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
              <a href="/" className="transition hover:text-white">
                Home
              </a>
              <span>/</span>
              <a href={from || "/create"} className="transition hover:text-white">
                Results
              </a>
              <span>/</span>
              <span className="truncate text-red-300">{category}</span>
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
              rel={
                isExternalReservation ? "noopener noreferrer" : undefined
              }
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
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-white shadow-2xl backdrop-blur-xl">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-red-400">
        {eyebrow}
      </p>

      <h2 className="mt-3 text-3xl font-black tracking-tight">{title}</h2>

      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailGrid({ title, items }: { title: string; items: string[] }) {
  return (
    <LuxuryCard eyebrow={title} title={title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/70"
          >
            {item}
          </div>
        ))}
      </div>
    </LuxuryCard>
  );
}

function MiniInsight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-black capitalize text-white/80">
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>

      <p className="mt-1 break-words font-bold text-white/80">{value}</p>
    </div>
  );
}