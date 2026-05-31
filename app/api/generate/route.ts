export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeCardTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      values
        .flatMap((item) => {
          if (!item) return [];
          if (Array.isArray(item)) return normalizeCardTags(item);
          if (typeof item === "string") {
            const trimmed = item.trim();
            if (
              !trimmed ||
              ["[]", "{}", "null", "undefined"].includes(trimmed.toLowerCase())
            ) {
              return [];
            }
            if (
              (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
              (trimmed.startsWith("{") && trimmed.endsWith("}"))
            ) {
              try {
                return normalizeCardTags(JSON.parse(trimmed));
              } catch {
                return [];
              }
            }
            return trimmed
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean);
          }
          return [String(item).trim()].filter(Boolean);
        })
        .map((label) => label.replace(/_/g, " ").replace(/-/g, " ").trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function toCardRecord(item: any) {
  return {
    id: item?.id ?? item?.source_id ?? item?.place_id ?? null,
    name:
      item?.name ??
      item?.restaurant_name ??
      item?.activity_name ??
      item?.business_name ??
      "Unknown location",
    location_type:
      item?.location_type ??
      (item?.restaurant_name ? "restaurant" : item?.activity_name ? "activity" : null),
    primary_category: item?.primary_category ?? item?.category ?? null,
    cuisine: item?.cuisine ?? item?.cuisine_type ?? null,
    activity_type: item?.activity_type ?? null,
    address: item?.address ?? null,
    city: item?.city ?? null,
    borough: item?.borough ?? null,
    neighborhood: item?.neighborhood ?? null,
    image_url:
      item?.image_url ??
      item?.main_image ??
      (Array.isArray(item?.images) ? item.images[0] : null),
    rating: item?.rating ?? null,
    price_level: item?.price_level ?? item?.price_range ?? null,
    phone_number: item?.phone_number ?? item?.phone ?? null,
    reservation_url:
      item?.reservation_url ?? item?.reservation_link ?? item?.booking_url ?? null,
    external_reservation_url: item?.external_reservation_url ?? null,
    tags: normalizeCardTags([
      item?.tags,
      item?.vibe_tags,
      item?.best_for_tags,
      item?.intent_tags,
    ]),
    distance: item?.pair_distance_miles ?? item?.distance_miles ?? null,
    source_table: item?.source_table ?? null,
    detail_location_type: item?.detail_location_type ?? null,
    website: item?.website ?? null,
  };
}

function emptySearchResponse(reply: string) {
  return {
    success: false,
    reply,
    restaurants: [],
    activities: [],
    matched_locations: [],
    matchedLocations: [],
    pairs: [],
    cards: [],
    render_mode: "empty",
    renderMode: "empty",
    card_counts: {
      restaurants: 0,
      activities: 0,
      matched_locations: 0,
      pairs: 0,
    },
    cardCounts: {
      restaurants: 0,
      activities: 0,
      matched_locations: 0,
      pairs: 0,
    },
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = await request.json().catch(() => ({}));

    const input =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.input === "string"
          ? body.input
          : typeof body?.query === "string"
            ? body.query
            : "";

    const cleanInput = input.trim();

    if (!cleanInput) {
      return Response.json(
        emptySearchResponse("Please enter what you want to search for."),
      );
    }

    console.log("[api/generate] request", {
      input: cleanInput,
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      nodeEnv: process.env.NODE_ENV,
    });

    const { runEnterpriseSearch } = await import("../../../lib/search/enterprise");
    const result = await runEnterpriseSearch(cleanInput, {
      body,
      useLLM: true,
    });

    const cards = [
      ...(result.restaurants || []),
      ...(result.activities || []),
      ...(result.matched_locations || []),
    ].map(toCardRecord);

    const response = {
      ...result,
      cards,
      render_mode: result.render_mode === "empty" ? "empty" : result.render_mode,
      renderMode: result.renderMode || result.render_mode,
      diagnostics: {
        requested_locations:
          result.debug && (result.debug as any).geo
            ? [(result.debug as any).geo.raw].filter(Boolean)
            : [],
        restaurant_search_input: ((result.debug as any)?.restaurantTerms ?? []).join(
          " ",
        ),
        activity_search_input: ((result.debug as any)?.activityTerms ?? []).join(
          " ",
        ),
        final_restaurants: result.restaurants?.length || 0,
        final_activities: result.activities?.length || 0,
        fallback_used: Boolean(
          (result.debug as any)?.restaurantRecoveryUsed ||
            (result.debug as any)?.activityRecoveryUsed,
        ),
        no_results_reason:
          result.render_mode === "empty" ? "no_strong_matches" : null,
      },
    };

    console.log(
      "ROUTE_TIMING",
      JSON.stringify({
        route: "/api/generate",
        total_ms: Date.now() - startedAt,
        cache_status: "enterprise-rpc",
        result_count:
          (result.restaurants?.length || 0) +
          (result.activities?.length || 0) +
          (result.matched_locations?.length || 0),
      }),
    );

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("[api/generate] search failed", {
      input: typeof request !== "undefined" ? "request_received" : "unknown",
      message,
      stack: error instanceof Error ? error.stack : null,
    });

    return Response.json(
      {
        ...emptySearchResponse(
          "Search is having trouble right now. Please try again or simplify the request.",
        ),
        error: "SEARCH_ROUTE_FAILED",
        user_message:
          "Search is having trouble right now. Please try again or simplify the request.",
        internal_message:
          process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 200 },
    );
  }
}
