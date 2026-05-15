import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const INVALID_IMAGES = [
  "",
  "/placeholder.jpg",
  "/no-image.png",
  "/images/placeholder.jpg",
];

function getLocationName(location: any) {
  return (
    location.name ||
    location.restaurant_name ||
    location.activity_name ||
    location.business_name ||
    null
  );
}

function hasValidImage(location: any) {
  const mainImage = location.main_image?.trim();

  if (mainImage && !INVALID_IMAGES.includes(mainImage)) {
    return true;
  }

  if (Array.isArray(location.images)) {
    return location.images.some((img: string) => {
      const cleanImg = img?.trim();
      return cleanImg && !INVALID_IMAGES.includes(cleanImg);
    });
  }

  if (location.image_url?.trim()) {
    return true;
  }

  if (location.photo_url?.trim()) {
    return true;
  }

  return false;
}

function validateLocation(location: any) {
  const missingFields: string[] = [];

  if (!getLocationName(location)) missingFields.push("name");
  if (!location.primary_category && !location.cuisine && !location.category) {
    missingFields.push("primary_category");
  }
  if (!location.address) missingFields.push("address");
  if (!location.city) missingFields.push("city");
  if (!location.state) missingFields.push("state");
  if (!location.zip_code && !location.zip) missingFields.push("zip_code");
  if (location.latitude === null || location.latitude === undefined) {
    missingFields.push("latitude");
  }
  if (location.longitude === null || location.longitude === undefined) {
    missingFields.push("longitude");
  }
  if (!hasValidImage(location)) missingFields.push("main_image");

  return missingFields;
}

function getDataStatus(missingFields: string[]) {
  if (missingFields.length === 0) return "clean";
  if (missingFields.includes("main_image")) return "missing_image";
  if (
    missingFields.includes("latitude") ||
    missingFields.includes("longitude")
  ) {
    return "missing_coordinates";
  }
  if (
    missingFields.includes("address") ||
    missingFields.includes("city") ||
    missingFields.includes("state")
  ) {
    return "missing_address";
  }

  return "needs_review";
}

function calculateQualityScore(location: any) {
  let score = 0;

  if (location.rating) score += Number(location.rating) * 20;
  if (location.review_count) score += Math.min(Number(location.review_count) / 10, 30);
  if (hasValidImage(location)) score += 20;
  if (location.description || location.short_description) score += 10;
  if (Array.isArray(location.tags) && location.tags.length > 0) score += 10;

  return Math.round(score);
}

async function processTable(
  table: "restaurants" | "activities",
  limit: number,
  offset: number
) {
  const from = offset;
  const to = offset + limit - 1;

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .range(from, to);

  if (error) throw error;

  let clean = 0;
  let needsReview = 0;

  for (const location of data || []) {
    const missingFields = validateLocation(location);
    const isSearchable = missingFields.length === 0;
    const dataStatus = getDataStatus(missingFields);
    const qualityScore = calculateQualityScore(location);

    const updates: any = {
      is_searchable: isSearchable,
      data_status: dataStatus,
      missing_fields: missingFields,
      quality_score: qualityScore,
      last_quality_check_at: new Date().toISOString(),
    };

    if (!location.primary_category) {
      updates.primary_category =
        location.cuisine ||
        location.category ||
        location.restaurant_category ||
        location.activity_category ||
        null;
    }

    if (!location.main_image) {
      updates.main_image =
        location.image_url ||
        location.photo_url ||
        null;
    }

    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update(updates)
      .eq("id", location.id);

    if (updateError) {
      console.error(`${table} update error`, location.id, updateError);
      needsReview++;
      continue;
    }

    if (isSearchable) clean++;
    else needsReview++;
  }

  return {
    table,
    checked: data?.length || 0,
    clean,
    needsReview,
    offset,
    nextOffset: (data?.length || 0) < limit ? null : offset + limit,
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const tableParam = url.searchParams.get("table") || "both";
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);

    if (!["restaurants", "activities", "both"].includes(tableParam)) {
      return NextResponse.json(
        { success: false, error: "Invalid table parameter." },
        { status: 400 }
      );
    }

    const result: any = {
      success: true,
      limit,
      offset,
    };

    if (tableParam === "restaurants" || tableParam === "both") {
      result.restaurants = await processTable("restaurants", limit, offset);
    }

    if (tableParam === "activities" || tableParam === "both") {
      result.activities = await processTable("activities", limit, offset);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("cleanup-locations error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Cleanup failed.",
      },
      { status: 500 }
    );
  }
}