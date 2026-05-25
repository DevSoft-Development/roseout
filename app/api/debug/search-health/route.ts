import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
      .select(
        "id, restaurant_name, city, state, borough, cuisine_type, cuisine, latitude, longitude"
      )
      .ilike("restaurant_name", "%steak%")
      .limit(10),
    supabase
      .from("restaurants")
      .select(
        "id, restaurant_name, city, state, borough, cuisine_type, cuisine, search_document, latitude, longitude"
      )
      .or("cuisine.ilike.%steak%,search_document.ilike.%steak%")
      .limit(10),
    supabase
      .from("activities")
      .select(
        "id, activity_name, city, state, borough, activity_type, category, subcategory, search_document, latitude, longitude"
      )
      .or("activity_name.ilike.%hookah%,category.ilike.%hookah%,subcategory.ilike.%hookah%,search_document.ilike.%hookah%")
      .limit(10),
  ]);

  const labels = [
    "locations_count",
    "restaurants_count",
    "activities_count",
    "steak_restaurant_samples",
    "steak_cuisine_or_search_samples",
    "hookah_activity_samples",
  ] as const;

  const normalizedChecks = checks.map((result, index) => {
    const name = labels[index];
    if (result.status === "fulfilled") {
      const { data, error, count } = result.value;
      return {
        name,
        ok: !error,
        count: count ?? null,
        error: error?.message ?? null,
        sample: data ?? null,
      };
    }

    return {
      name,
      ok: false,
      count: null,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      sample: null,
    };
  });

  return NextResponse.json({ ok: true, checks: normalizedChecks });
}
