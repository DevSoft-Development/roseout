import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { queryLocations } from "@/lib/search/database";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const [
    totalLocations,
    searchableLocations,
    cleanLocations,
    hiddenLocations,
    hasSearchDocument,
    sampleSteakQueens,
    sampleHookahQueens,
    steakQuery,
    hookahQuery,
    combinedQuery,
  ] = await Promise.all([
    supabase.from("locations").select("id", { count: "exact", head: true }),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("data_status", "clean"),
    supabase.from("locations").select("id", { count: "exact", head: true }).or("is_hidden.is.true,data_status.eq.hidden"),
    supabase.from("locations").select("id", { count: "exact", head: true }).not("search_document", "is", null),
    supabase
      .from("locations")
      .select("id,name,restaurant_name,borough,city,neighborhood,search_document")
      .or("search_document.ilike.%steak%,name.ilike.%steak%,restaurant_name.ilike.%steak%")
      .or("borough.ilike.%queens%,city.ilike.%queens%,neighborhood.ilike.%queens%")
      .limit(10),
    supabase
      .from("locations")
      .select("id,name,activity_name,borough,city,neighborhood,search_document")
      .or("search_document.ilike.%hookah%,name.ilike.%hookah%,activity_name.ilike.%hookah%")
      .or("borough.ilike.%queens%,city.ilike.%queens%,neighborhood.ilike.%queens%")
      .limit(10),
    queryLocations("steak dinner in queens"),
    queryLocations("hookah lounge in queens"),
    queryLocations("steak dinner and hookah lounge in queens"),
  ]);

  return NextResponse.json({
    ok: true,
    total_locations: totalLocations.count ?? 0,
    searchable_locations: searchableLocations.count ?? 0,
    clean_locations: cleanLocations.count ?? 0,
    hidden_locations: hiddenLocations.count ?? 0,
    has_search_document: hasSearchDocument.count ?? 0,
    sample_steak_queens: sampleSteakQueens.data ?? [],
    sample_hookah_queens: sampleHookahQueens.data ?? [],
    query_locations_steak_dinner_in_queens: steakQuery,
    query_locations_hookah_lounge_in_queens: hookahQuery,
    query_locations_steak_and_hookah_in_queens: combinedQuery,
  });
}
