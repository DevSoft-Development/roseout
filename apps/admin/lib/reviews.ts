import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const REVIEW_FIELDS =
  "id,customer_name,rating,review_text,status,created_at,location_id,verified_visit,verification_source,verified_at,outing_id,reservation_id,guest_email,user_id,ai_sentiment,ai_score_boost,vibe,noise_level,date_night,group_friendly,service_quality,food_quality,ambiance_quality,best_for,avoid_if,approved_at,rejected_at,moderation_notes,locations:location_id(id,name,restaurant_name,activity_name,address,neighborhood,borough,location_type)";

export type ReviewFilters = {
  type?: string;
  status?: string;
  verified?: string;
  source?: string;
  q?: string;
  locationId?: string;
  limit?: number;
  offset?: number;
};

export type AdminReview = {
  id: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  locationId: string | null;
  locationName: string | null;
  locationType: "restaurant" | "activity" | "location" | "unknown";
  rating: number | null;
  reviewText: string | null;
  status: string | null;
  createdAt: string | null;
  verifiedVisit: boolean;
  verificationSource: string | null;
  outingId: string | null;
  reservationId: string | null;
  aiSentiment: string | null;
  aiScoreBoost: number | null;
  moderationNotes: string | null;
};

function isMissingTableError(message?: string | null) {
  const safe = String(message || "").toLowerCase();
  return (
    safe.includes("could not find the table") ||
    safe.includes("schema cache") ||
    safe.includes("does not exist") ||
    safe.includes("pgrst")
  );
}

function maskEmail(value: unknown) {
  const email = typeof value === "string" ? value : "";
  return email ? email.replace(/(^.).*(@.*$)/, "$1***$2") : null;
}

function normalizeReview(row: any): AdminReview {
  const locationName =
    row.locations?.name ||
    row.locations?.restaurant_name ||
    row.locations?.activity_name ||
    null;
  const rawType = String(row.locations?.location_type || "").toLowerCase();
  const locationType: AdminReview["locationType"] =
    rawType === "restaurant" || row.locations?.restaurant_name
      ? "restaurant"
      : rawType === "activity" || row.locations?.activity_name
        ? "activity"
        : locationName
          ? "location"
          : "unknown";

  return {
    id: String(row.id),
    reviewerName: row.customer_name || null,
    reviewerEmail: maskEmail(row.guest_email),
    locationId: row.location_id || null,
    locationName,
    locationType,
    rating:
      typeof row.rating === "number"
        ? row.rating
        : Number(row.rating || 0) || null,
    reviewText: row.review_text || null,
    status: row.status || null,
    createdAt: row.created_at || null,
    verifiedVisit: Boolean(row.verified_visit),
    verificationSource: row.verification_source || null,
    outingId: row.outing_id || null,
    reservationId: row.reservation_id || null,
    aiSentiment: row.ai_sentiment || null,
    aiScoreBoost:
      row.ai_score_boost == null ? null : Number(row.ai_score_boost),
    moderationNotes: row.moderation_notes || null,
  };
}

export async function loadAdminReviews(filters: ReviewFilters = {}) {
  const adminDb = getAdminDatabaseClient();
  const limit = Math.max(1, Math.min(200, Number(filters.limit ?? 100)));
  const offset = Math.max(0, Number(filters.offset ?? 0));

  const { data, error } = await adminDb
    .from("location_reviews")
    .select(REVIEW_FIELDS)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (isMissingTableError(error.message)) {
      return {
        reviews: [] as AdminReview[],
        stats: {
          totalReviews: 0,
          averageRating: null as number | null,
          restaurantReviews: 0,
          activityReviews: 0,
          pendingReviews: 0,
        },
        warning: "No review data source is configured yet.",
        error: null,
      };
    }

    return {
      reviews: [] as AdminReview[],
      stats: {
        totalReviews: 0,
        averageRating: null as number | null,
        restaurantReviews: 0,
        activityReviews: 0,
        pendingReviews: 0,
      },
      warning: null,
      error: error.message,
    };
  }

  const type = filters.type || "all";
  const status = filters.status || "all";
  const verified = filters.verified || "all";
  const source = filters.source || "all";
  const q = (filters.q || "").trim().toLowerCase();

  const reviews = (data || [])
    .map(normalizeReview)
    .filter((item) => {
      if (type === "restaurants" && item.locationType !== "restaurant") return false;
      if (type === "activities" && item.locationType !== "activity") return false;
      if (filters.locationId && item.locationId !== filters.locationId) return false;
      if (status !== "all" && String(item.status || "").toLowerCase() !== status) return false;
      if (verified === "verified" && !item.verifiedVisit) return false;
      if (verified === "unverified" && item.verifiedVisit) return false;
      if (source !== "all" && item.verificationSource !== source) return false;
      if (!q) return true;
      return [item.locationName, item.reviewText, item.reviewerName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

  const rated = reviews.filter((review) => typeof review.rating === "number");

  return {
    reviews,
    stats: {
      totalReviews: reviews.length,
      averageRating: rated.length
        ? Number(
            (
              rated.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
              rated.length
            ).toFixed(2),
          )
        : null,
      restaurantReviews: reviews.filter(
        (review) => review.locationType === "restaurant",
      ).length,
      activityReviews: reviews.filter(
        (review) => review.locationType === "activity",
      ).length,
      pendingReviews: reviews.filter((review) =>
        ["pending", "flagged"].includes(String(review.status || "").toLowerCase()),
      ).length,
    },
    warning: null,
    error: null,
  };
}
