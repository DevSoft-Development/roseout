import { parseCanonicalIntent } from "@/lib/search/intent";
import { scoreCuisineCategoryMatch } from "@/lib/search/cuisine-matching";
import { detectRequestedGeo, locationMatchesGeo, scoreGeoMatch } from "@/lib/search/geo-matching";
import { queryLocations, searchRestaurants } from "@/lib/search/database";
import { rankRestaurants } from "@/lib/search/ranking";

export const dynamic = "force-dynamic";

function summarize(record: any, q: string, geoIntent: any) {
  const cuisine = scoreCuisineCategoryMatch(record, q, true);
  const geoScore = scoreGeoMatch(record, geoIntent);
  const hardCuisine = cuisine.score > 0;
  const geoMatch = locationMatchesGeo(record, geoIntent);
  return {
    id: record?.id,
    name: record?.name || record?.restaurant_name || record?.activity_name,
    primary_category: record?.primary_category,
    cuisine: record?.cuisine || record?.cuisine_type,
    location_type: record?.location_type,
    county: record?.county,
    borough: record?.borough,
    city: record?.city,
    neighborhood: record?.neighborhood,
    state: record?.state || record?.state_code,
    cuisineScore: cuisine.score,
    cuisineReasons: cuisine.reasons,
    geoScore,
    typeScore: record?.restaurant_name || record?.cuisine || record?.cuisine_type ? 25 : 0,
    finalScore: cuisine.score * 3 + geoScore,
    included: hardCuisine && geoMatch,
    reason: hardCuisine && geoMatch ? "hard_cuisine_and_geo" : hardCuisine ? "hard_cuisine_geo_expansion_candidate" : geoMatch ? "geo_only_rejected_for_food_query" : "no_hard_cuisine_or_geo_match",
  };
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Not available in production" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const intent = parseCanonicalIntent(q, {});
  const geoIntent = intent.geoIntent ?? detectRequestedGeo(q);
  const raw = await queryLocations(intent.restaurantSearchInput || q, 200);
  const found = await searchRestaurants(intent);
  const rawSummaries = (raw.records || []).map((r: any) => summarize(r, q, geoIntent));
  const hardCuisineMatches = rawSummaries.filter((r: any) => r.cuisineScore > 0).sort((a: any, b: any) => b.cuisineScore - a.cuisineScore);
  const hardCuisineGeoMatches = hardCuisineMatches.filter((r: any) => r.geoScore > 0).sort((a: any, b: any) => b.finalScore - a.finalScore);
  const rankedFinal = rankRestaurants(found.records || [], intent).map((r: any) => summarize(r, q, geoIntent));
  const fallbackStage = hardCuisineGeoMatches.length > 0 ? "hard_cuisine_geo" : hardCuisineMatches.length > 0 ? "hard_cuisine_geo_expanded" : "broad_geo_or_related_category";

  return Response.json({
    parsedCuisineIntent: {
      mealFoodIntents: intent.mealFoodIntents,
      specificMealFoodIntents: intent.specificMealFoodIntents,
      cuisines: intent.cuisines,
      activityIntents: intent.activityIntents,
    },
    parsedGeoIntent: geoIntent,
    topRawRestaurantCandidates: rawSummaries.sort((a: any, b: any) => b.finalScore - a.finalScore).slice(0, 25),
    hardCuisineMatches: hardCuisineMatches.slice(0, 25),
    hardCuisineGeoMatches: hardCuisineGeoMatches.slice(0, 25),
    fallbackStage,
    rejectedCandidates: rawSummaries.filter((r: any) => !r.included).slice(0, 50),
    finalTopResults: rankedFinal.slice(0, 25),
    debug: found.debug,
  });
}
