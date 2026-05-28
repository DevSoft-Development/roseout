import { parseCanonicalIntent } from "@/lib/search/intent";
import { scoreCuisineCategoryMatch, detectRequestedCuisines, detectRequestedRestaurantCategories } from "@/lib/search/cuisine-matching";
import { searchRestaurants } from "@/lib/search/database";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Not available in production" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const intent = parseCanonicalIntent(q, {});
  const found = await searchRestaurants(intent);
  const scored = (found.records || []).map((r: any) => {
    const s = scoreCuisineCategoryMatch(r, q, true);
    return { id: r.id, name: r.name || r.restaurant_name, score: s.score, reasons: s.reasons, location_type: r.location_type, category: r.primary_category || r.cuisine || r.cuisine_type };
  }).sort((a: any,b: any)=>b.score-a.score);
  return Response.json({
    normalizedQuery: intent.normalizedQuery,
    detectedCuisines: detectRequestedCuisines(q),
    detectedRestaurantCategories: detectRequestedRestaurantCategories(q),
    detectedActivityAddOns: intent.activityIntents,
    restaurantIntent: intent.restaurantIntent,
    activityIntent: intent.wantsActivity,
    hardMatchTerms: intent.specificMealFoodIntents,
    topMatchedRestaurants: scored.slice(0, 20),
    rejectedRecords: scored.filter((x:any)=>x.score < 0).slice(0, 20),
    fallbackUsed: found.records.length === 0,
  });
}
