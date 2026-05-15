import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const REQUIRED_FIELDS = [
  "name",
  "primary_category",
  "address",
  "city",
  "state",
  "zip_code",
  "latitude",
  "longitude",
];

const INVALID_IMAGES = [
  "",
  "/placeholder.jpg",
  "/no-image.png",
  "/images/placeholder.jpg",
];

function hasValidImage(location: any) {
  if (
    location.main_image &&
    !INVALID_IMAGES.includes(location.main_image)
  ) {
    return true;
  }

  if (Array.isArray(location.images)) {
    return location.images.some(
      (img: string) => img && !INVALID_IMAGES.includes(img)
    );
  }

  return false;
}

function calculateQualityScore(location: any) {
  let score = 0;

  if (location.rating) {
    score += Number(location.rating) * 20;
  }

  if (location.review_count) {
    score += Math.min(Number(location.review_count) / 10, 30);
  }

  if (hasValidImage(location)) {
    score += 20;
  }

  if (location.description || location.short_description) {
    score += 10;
  }

  if (location.tags?.length > 0) {
    score += 10;
  }

  return Math.round(score);
}

function validateLocation(location: any) {
  const missingFields: string[] = [];

  REQUIRED_FIELDS.forEach((field) => {
    if (
      location[field] === null ||
      location[field] === undefined ||
      location[field] === ""
    ) {
      missingFields.push(field);
    }
  });

  if (!hasValidImage(location)) {
    missingFields.push("main_image");
  }

  const isSearchable = missingFields.length === 0;

  return {
    isSearchable,
    missingFields,
  };
}

async function processTable(table: "restaurants" | "activities") {
  const { data, error } = await supabase
    .from(table)
    .select("*");

  if (error) {
    throw error;
  }

  let cleanCount = 0;
  let reviewCount = 0;

  for (const location of data || []) {
    const { isSearchable, missingFields } =
      validateLocation(location);

    const qualityScore =
      calculateQualityScore(location);

    const dataStatus =
      missingFields.length === 0
        ? "clean"
        : missingFields.includes("main_image")
        ? "missing_image"
        : missingFields.includes("latitude") ||
          missingFields.includes("longitude")
        ? "missing_coordinates"
        : "needs_review";

    await supabase
      .from(table)
      .update({
        is_searchable: isSearchable,
        data_status: dataStatus,
        missing_fields: missingFields,
        quality_score: qualityScore,
        last_quality_check_at: new Date().toISOString(),
      })
      .eq("id", location.id);

    if (isSearchable) {
      cleanCount++;
    } else {
      reviewCount++;
    }
  }

  return {
    table,
    total: data?.length || 0,
    clean: cleanCount,
    needsReview: reviewCount,
  };
}

export async function GET(req: NextRequest) {
  try {
    const restaurants =
      await processTable("restaurants");

    const activities =
      await processTable("activities");

    return NextResponse.json({
      success: true,
      restaurants,
      activities,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}