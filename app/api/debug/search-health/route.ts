import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STEAK_RESTAURANT_FIELDS =
  "id, restaurant_name, city, state, borough, cuisine_type, cuisine, latitude, longitude";
const STEAK_SEARCH_FIELDS =
  "id, restaurant_name, city, state, borough, cuisine_type, cuisine, search_document, latitude, longitude";
const HOOKAH_ACTIVITY_FIELDS =
  "id, activity_name, city, state, borough, activity_type, category, subcategory, search_document, latitude, longitude";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 }
    );
  }

  const checks = await Promise.allSettled([
    supabase.from("locations").select("id", { count: "exact", head: true }),
    supabase.from("restaurants").select("id", { count: "exact", head: true }),
    supabase.from("activities").select("id", { count: "exact", head: true }),
    supabase
      .from("restaurants")
      .select(STEAK_RESTAURANT_FIELDS)
      .or("cuisine_type.ilike.%steak%,cuisine.ilike.%steak%")
      .limit(10),
    supabase
      .from("restaurants")
      .select(STEAK_SEARCH_FIELDS)
      .or("cuisine.ilike.%steak%,search_document.ilike.%steak%")
      .limit(10),
    supabase
      .from("activities")
      .select(HOOKAH_ACTIVITY_FIELDS)
      .or("activity_name.ilike.%hookah%,activity_type.ilike.%hookah%,category.ilike.%hookah%,subcategory.ilike.%hookah%,search_document.ilike.%hookah%")
      .limit(10),
  ]);

  const labels = [
    "locations_count",
    "restaurants_count",
    "activities_count",
    "steak_restaurant_samples",
    "steak_cuisine_or_search_document_samples",
    "hookah_activity_samples",
  ] as const;

  const normalizedChecks = checks.map((result, index) => {
    const label = labels[index];

    if (result.status === "rejected") {
      return {
        check: label,
        ok: false,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }

    const { data, error, count } = result.value;

    if (error) {
      return {
        check: label,
        ok: false,
        error: error.message,
      };
    }

    if (label.endsWith("_count")) {
      return {
        check: label,
        ok: true,
        count: count ?? 0,
      };
    }

    return {
      check: label,
      ok: true,
      count: Array.isArray(data) ? data.length : 0,
      sample: data ?? [],
    };
  });

  return NextResponse.json({ ok: true, checks: normalizedChecks });
}
