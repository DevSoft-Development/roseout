import { runEnterpriseSearch } from "@/lib/search/enterprise";

function normalizeCardTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.flatMap((item) => {
    if (!item) return [];
    if (Array.isArray(item)) return normalizeCardTags(item);
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed || ["[]", "{}", "null", "undefined"].includes(trimmed.toLowerCase())) return [];
      if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        try { return normalizeCardTags(JSON.parse(trimmed)); } catch { return []; }
      }
      return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    }
    return [String(item).trim()].filter(Boolean);
  }).map((label) => label.replace(/_/g, " ").replace(/-/g, " ").trim()).filter(Boolean))).slice(0, 8);
}

function toCardRecord(item: any) {
  return {
    id: item?.id ?? item?.source_id ?? item?.place_id ?? null,
    name: item?.name ?? item?.restaurant_name ?? item?.activity_name ?? item?.business_name ?? "Unknown location",
    location_type: item?.location_type ?? (item?.restaurant_name ? "restaurant" : item?.activity_name ? "activity" : null),
    primary_category: item?.primary_category ?? item?.category ?? null,
    cuisine: item?.cuisine ?? item?.cuisine_type ?? null,
    activity_type: item?.activity_type ?? null,
    address: item?.address ?? null,
    city: item?.city ?? null,
    borough: item?.borough ?? null,
    neighborhood: item?.neighborhood ?? null,
    image_url: item?.image_url ?? item?.main_image ?? (Array.isArray(item?.images) ? item.images[0] : null),
    rating: item?.rating ?? null,
    price_level: item?.price_level ?? item?.price_range ?? null,
    phone_number: item?.phone_number ?? item?.phone ?? null,
    reservation_url: item?.reservation_url ?? item?.reservation_link ?? item?.booking_url ?? null,
    external_reservation_url: item?.external_reservation_url ?? null,
    tags: normalizeCardTags([item?.tags, item?.vibe_tags, item?.best_for_tags, item?.intent_tags]),
    distance: item?.pair_distance_miles ?? item?.distance_miles ?? null,
    source_table: item?.source_table ?? null,
    detail_location_type: item?.detail_location_type ?? null,
    website: item?.website ?? null,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const input = typeof body?.message === "string" ? body.message : typeof body?.input === "string" ? body.input : typeof body?.query === "string" ? body.query : "";
  if (!input.trim()) {
    return Response.json({ success: false, reply: "Please provide a search request.", restaurants: [], activities: [], matched_locations: [], pairs: [], render_mode: "text", card_counts: { restaurants: 0, activities: 0, matched_locations: 0, pairs: 0 } });
  }
  const result = await runEnterpriseSearch(input, { body, useLLM: true });
  const cards = [...result.restaurants, ...result.activities, ...result.matched_locations].map(toCardRecord);
  const response = { ...result, cards, render_mode: result.render_mode === "empty" ? "empty" : result.render_mode, diagnostics: { requested_locations: result.debug && (result.debug as any).geo ? [(result.debug as any).geo.raw].filter(Boolean) : [], restaurant_search_input: ((result.debug as any)?.restaurantTerms ?? []).join(" "), activity_search_input: ((result.debug as any)?.activityTerms ?? []).join(" "), final_restaurants: result.restaurants.length, final_activities: result.activities.length, fallback_used: Boolean((result.debug as any)?.restaurantRecoveryUsed || (result.debug as any)?.activityRecoveryUsed), no_results_reason: result.render_mode === "empty" ? "no_strong_matches" : null } };
  console.log("ROUTE_TIMING", JSON.stringify({ route: "/api/generate", total_ms: Date.now() - startedAt, db_ms: 0, cache_status: "enterprise-rpc", result_count: result.restaurants.length + result.activities.length + result.matched_locations.length }));
  return Response.json(response);
}
