import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
type AdminReview = {
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
};

const EMPTY_RESPONSE = {
  reviews: [] as AdminReview[],
  stats: { totalReviews: 0, averageRating: null as number | null, restaurantReviews: 0, activityReviews: 0, pendingReviews: 0 },
  warning: "No review data source is configured yet.",
};

const isMissingTableError = (message?: string | null) => {
  const safe = String(message || "").toLowerCase();
  return safe.includes("could not find the table") || safe.includes("schema cache") || safe.includes("does not exist") || safe.includes("pgrst");
};

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.reviewsModerate);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const q = (searchParams.get("q") || searchParams.get("search") || "").trim().toLowerCase();
    const locationId = searchParams.get("location_id");
    const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    const { data, error } = await supabaseAdmin
      .from("location_reviews")
      .select("id,customer_name,rating,review_text,status,created_at,location_id,locations:location_id(id,name,restaurant_name,activity_name,address,neighborhood,borough,location_type)")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (isMissingTableError(error.message)) {
        // TODO: add/enable a canonical review table migration if location_reviews is unavailable.
        return NextResponse.json(EMPTY_RESPONSE);
      }
      return NextResponse.json({ ...EMPTY_RESPONSE, warning: "Unable to load review data at the moment." });
    }

    const normalized = (data || []).map((row: any): AdminReview => {
      const locationName = row.locations?.name || row.locations?.restaurant_name || row.locations?.activity_name || null;
      const rawType = String(row.locations?.location_type || "").toLowerCase();
      const locationType = rawType === "restaurant" || row.locations?.restaurant_name
        ? "restaurant"
        : rawType === "activity" || row.locations?.activity_name
          ? "activity"
          : locationName
            ? "location"
            : "unknown";
      return {
        id: String(row.id),
        reviewerName: row.customer_name || null,
        reviewerEmail: null,
        locationId: row.location_id || null,
        locationName,
        locationType,
        rating: typeof row.rating === "number" ? row.rating : Number(row.rating || 0) || null,
        reviewText: row.review_text || null,
        status: row.status || null,
        createdAt: row.created_at || null,
      };
    });

    const filtered = normalized.filter((item) => {
      if (type === "restaurants" && item.locationType !== "restaurant") return false;
      if (type === "activities" && item.locationType !== "activity") return false;
      if (locationId && item.locationId !== locationId) return false;
      if (!q) return true;
      const haystack = [item.locationName, item.reviewText].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });

    const rated = filtered.filter((r) => typeof r.rating === "number");
    return NextResponse.json({
      reviews: filtered,
      stats: {
        totalReviews: filtered.length,
        averageRating: rated.length ? Number((rated.reduce((sum, row) => sum + Number(row.rating || 0), 0) / rated.length).toFixed(2)) : null,
        restaurantReviews: filtered.filter((r) => r.locationType === "restaurant").length,
        activityReviews: filtered.filter((r) => r.locationType === "activity").length,
        pendingReviews: filtered.filter((r) => ["pending", "flagged"].includes(String(r.status || "").toLowerCase())).length,
      },
      warning: null,
    });
  } catch {
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
