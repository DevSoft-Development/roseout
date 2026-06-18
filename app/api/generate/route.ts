import { getLocationImage } from "@/lib/locationImage";
import { normalizePublicCardImage, hasPublicCardImage } from "@/lib/publicCardImage";
import { isEdgeCreateSearchEnabled, runCreateSearchWithEdgeFallback } from "@/lib/search/createSearch";
import { runEnterpriseSearch } from "@/lib/search/enterprise";
import { logSearchEvent } from "@/lib/search/enterprise/searchEventLogger";
import { logSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";
import { isExplicitMarket, isPairAllowedForResolvedMarket, isResultAllowedForResolvedMarket } from "@/lib/search/market-guardrails";
import { parsePlannedTimeFromQuery } from "@/lib/outings/parse-planned-time";
import { parseOutingDateTime } from "@/lib/search/parse-outing-date-time";
import { detectRequestedMarket } from "@/lib/location-markets";
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
  const usableImage = getLocationImage(item);

  return {
    id: item?.id ?? item?.source_id ?? item?.google_place_id ?? null,
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
    google_place_id: item?.google_place_id ?? null,
    image_url: usableImage,
    main_image: usableImage,
    images: item?.images ?? (usableImage ? [usableImage] : []),
    has_photos: item?.has_photos ?? Boolean(usableImage),
    photo_status: item?.photo_status ?? null,
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



function normalizeSelectedSearchLane(value: unknown): "auto" | "restaurant" | "activity" | "mixed" | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/_/g, "-");
  if (["restaurant", "restaurants", "food", "dining", "restaurant-only", "restaurant only"].includes(normalized)) return "restaurant";
  if (["activity", "activities", "things-to-do", "things to do", "activity-only", "activity only"].includes(normalized)) return "activity";
  if (["mixed", "mixed-outing", "mixed outing", "outing", "pairing"].includes(normalized)) return "mixed";
  if (["auto", "any", "all", "default"].includes(normalized)) return "auto";
  return null;
}

function selectedSearchLaneFromRequestBody(body: any): "auto" | "restaurant" | "activity" | "mixed" {
  return (
    normalizeSelectedSearchLane(body?.selectedSearchLane) ??
    normalizeSelectedSearchLane(body?.selected_search_lane) ??
    normalizeSelectedSearchLane(body?.searchLane) ??
    normalizeSelectedSearchLane(body?.search_lane) ??
    normalizeSelectedSearchLane(body?.lane) ??
    normalizeSelectedSearchLane(body?.searchType) ??
    normalizeSelectedSearchLane(body?.search_type) ??
    "auto"
  );
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizeSearchMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSearchMetadata);
  }

  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]")
      .replace(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g, "[redacted_phone]");
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, item]) => {
      if (/email|phone|address/i.test(key)) return acc;
      acc[key] = sanitizeSearchMetadata(item);
      return acc;
    },
    {},
  );
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
  let searchHealthRawQuery: string | null = null;

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
    searchHealthRawQuery = cleanInput;

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
    const timezone =
      typeof body?.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim()
        : "America/New_York";
    const manualConfidence = ["none", "date_only", "exact"].includes(body?.outingTimeConfidence)
      ? body.outingTimeConfidence
      : null;
    const parsedOutingDateTime = parseOutingDateTime(cleanInput);
    const parsedPlannedTime = parsePlannedTimeFromQuery(cleanInput, timezone);
    const plannedTime = manualConfidence
      ? {
          plannedFor: typeof body?.plannedFor === "string" ? body.plannedFor : null,
          timezone,
          matchedText: null,
          dateContext: typeof body?.outingDateContext === "string" ? body.outingDateContext : null,
          confidence: manualConfidence,
          shouldSchedulePreOutingReminders:
            manualConfidence === "exact" && typeof body?.plannedFor === "string",
          shouldScheduleNextMorningFollowup:
            body?.nextMorningFollowupEnabled === true || typeof body?.nextMorningFollowupDate === "string",
          nextMorningFollowupDate:
            typeof body?.nextMorningFollowupDate === "string" ? body.nextMorningFollowupDate : null,
          source: "manual",
        }
      : {
          ...parsedPlannedTime,
          source: parsedPlannedTime.confidence === "none" ? null : "query",
        };


    const selectedSearchLane = selectedSearchLaneFromRequestBody(body);
    const searchBody = {
      ...body,
      selectedSearchLane,
      ...(selectedSearchLane === "auto" ? { searchType: "auto" } : { searchType: selectedSearchLane }),
    };

    const betaAssignmentId = body?.betaAssignmentId || body?.beta_assignment_id || new URL(request.url).searchParams.get("betaAssignmentId") || request.headers.get("x-beta-assignment-id");
    const betaTesterId = body?.betaTesterId || body?.beta_tester_id || request.headers.get("x-beta-tester-id");
    const usedCustomPrompt = body?.usedCustomPrompt === true || body?.usedCustomPrompt === "true" || new URL(request.url).searchParams.get("usedCustomPrompt") === "true" || request.headers.get("x-used-custom-prompt") === "true";
    const betaDebug = process.env.NODE_ENV !== "production" || Boolean(betaAssignmentId || betaTesterId || body?.betaDebug);
    const betaFeedbackSubmitted = Boolean(betaTesterId && (body?.feedbackSubmitted === true || body?.feedback_submitted === true || body?.feedback || body?.feedback_type || body?.expected_result || body?.actual_result || body?.rating));
    const legacySearch = () => runEnterpriseSearch(cleanInput, {
      body: searchBody,
      useLLM: true,
      source: betaTesterId ? "beta_tester_search" : "public_create_search",
      route: "/api/generate",
      logPerformance: true,
      sessionId: request.headers.get("x-session-id") || null,
      betaAssignmentId,
      betaTesterId,
      usedCustomPrompt,
      betaDebug,
      searchHealthDebug: betaDebug,
      betaFeedbackSubmitted,
    });

    const marketDetection = detectRequestedMarket(cleanInput);
    const forceLegacyForLongIsland = marketDetection.requestedMarket === "LONG_ISLAND";
    const result: any = forceLegacyForLongIsland
      ? await legacySearch()
      : await runCreateSearchWithEdgeFallback(
          {
            ...searchBody,
            prompt: cleanInput,
            limit: body?.limit ?? 12,
            debug: betaDebug || Boolean(body?.debug),
          },
          {
            accessToken: request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null,
            fallbackDisabled: body?.disableLegacyFallback === true,
            legacySearch,
          },
        );

    const rawRestaurants = Array.isArray(result.restaurants) ? result.restaurants : [];
    const rawActivities = Array.isArray(result.activities) ? result.activities : [];
    const rawMatchedLocations = Array.isArray(result.matched_locations)
      ? result.matched_locations
      : Array.isArray(result.matchedLocations)
        ? result.matchedLocations
        : [];
    const rawCards = Array.isArray(result.cards) ? result.cards : [];
    const rawPairs = Array.isArray(result.pairs) ? result.pairs : [];

    const normalizeResultCard = (item: any) => {
      const card =
        typeof toCardRecord === "function"
          ? toCardRecord(item)
          : item;

      const mergedCard = {
        ...item,
        ...card,
        google_place_id: item?.google_place_id ?? card?.google_place_id ?? null,
        main_image: item?.main_image ?? card?.main_image ?? null,
        image_url: item?.image_url ?? card?.image_url ?? null,
        images: item?.images ?? card?.images ?? [],
        has_photos: item?.has_photos ?? card?.has_photos ?? false,
        photo_status: item?.photo_status ?? card?.photo_status ?? null,
      };

      return normalizePublicCardImage(mergedCard);
    };

    const resolvedMarketForGuardrail = (result.debug as any)?.resolvedMarket ?? (result.debug as any)?.normalizedIntent?.geo?.resolvedMarket ?? null;
    const explicitMarketRequestedForGuardrail = isExplicitMarket(resolvedMarketForGuardrail) && Boolean((result.debug as any)?.explicitMarketRequested ?? (result.debug as any)?.normalizedIntent?.geo?.explicitMarketRequested);
    const guardResult = (item: any) => !explicitMarketRequestedForGuardrail || isResultAllowedForResolvedMarket(item, resolvedMarketForGuardrail);

    const normalizedRestaurantsBeforeGuardrail = rawRestaurants.map(normalizeResultCard).filter(hasPublicCardImage);
    const normalizedActivitiesBeforeGuardrail = rawActivities.map(normalizeResultCard).filter(hasPublicCardImage);
    const normalizedMatchedBeforeGuardrail = rawMatchedLocations.map(normalizeResultCard).filter(hasPublicCardImage);
    const normalizedCardsBeforeGuardrail = rawCards.map(normalizeResultCard).filter(hasPublicCardImage);

    const publicRestaurants = normalizedRestaurantsBeforeGuardrail.filter(guardResult);
    const publicActivities = normalizedActivitiesBeforeGuardrail.filter(guardResult);
    const publicMatchedLocations = normalizedMatchedBeforeGuardrail.filter(guardResult);
    const publicResultCards = normalizedCardsBeforeGuardrail.filter(guardResult);
    const marketGuardrailRejected = (normalizedRestaurantsBeforeGuardrail.length - publicRestaurants.length) + (normalizedActivitiesBeforeGuardrail.length - publicActivities.length) + (normalizedMatchedBeforeGuardrail.length - publicMatchedLocations.length) + (normalizedCardsBeforeGuardrail.length - publicResultCards.length);

    const publicCardsByKey = new Map<string, any>();

    [
      ...publicRestaurants,
      ...publicActivities,
      ...publicMatchedLocations,
      ...publicResultCards,
    ]
      .map(normalizePublicCardImage)
      .filter(hasPublicCardImage)
      .forEach((card) => {
        const key = String(
          card.id ??
            card.source_id ??
            card.google_place_id ??
            `${card.location_type || "card"}:${
              card.name || card.restaurant_name || card.activity_name || card.image_url
            }`,
        );
        if (!publicCardsByKey.has(key)) publicCardsByKey.set(key, card);
      });

    const publicCards = Array.from(publicCardsByKey.values());

    const normalizeNestedPublicImages = (value: any): any => {
      if (Array.isArray(value)) return value.map(normalizeNestedPublicImages);

      if (!value || typeof value !== "object") return value;

      const normalizedChildren = Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          normalizeNestedPublicImages(item),
        ]),
      );

      return getLocationImage(normalizedChildren)
        ? normalizePublicCardImage(normalizedChildren)
        : normalizedChildren;
    };

    const normalizedPairsBeforeGuardrail = rawPairs.map(normalizeNestedPublicImages);
    const publicPairs = explicitMarketRequestedForGuardrail
      ? normalizedPairsBeforeGuardrail.filter((pair: any) => isPairAllowedForResolvedMarket(pair, resolvedMarketForGuardrail))
      : normalizedPairsBeforeGuardrail;

    if (process.env.NODE_ENV !== "production") {
      console.log("[generate] public image normalization", {
        rawRestaurants: rawRestaurants.length,
        publicRestaurants: publicRestaurants.length,
        rawActivities: rawActivities.length,
        publicActivities: publicActivities.length,
        rawMatchedLocations: rawMatchedLocations.length,
        publicMatchedLocations: publicMatchedLocations.length,
        publicCards: publicCards.length,
        resolvedMarket: resolvedMarketForGuardrail,
        explicitMarketRequested: explicitMarketRequestedForGuardrail,
        marketGuardrailRejected,
      });
      console.log("[generate] public image url check", {
        firstCard: publicCards[0]
          ? {
              name:
                publicCards[0].name ||
                publicCards[0].restaurant_name ||
                publicCards[0].activity_name,
              image_url: publicCards[0].image_url,
              main_image: publicCards[0].main_image,
              images: publicCards[0].images,
            }
          : null,
      });
    }

    const response = {
      ...result,
      reply: resolvedMarketForGuardrail === "LONG_ISLAND" && (publicRestaurants.length + publicActivities.length + publicMatchedLocations.length) === 0
        ? "We’re still expanding Long Island picks. Try a broader search like ‘dinner and activity in Long Island’ or check back soon."
        : result.reply,
      plannedTime,
      outingTiming: parsedOutingDateTime,
      ...parsedOutingDateTime,
      restaurants: publicRestaurants,
      activities: publicActivities,
      matched_locations: publicMatchedLocations,
      matchedLocations: publicMatchedLocations,
      cards: publicCards,
      pairs: publicPairs,
      restaurantCount: publicRestaurants.length,
      activityCount: publicActivities.length,
      cardCount: publicCards.length,
      card_counts: {
        ...(result.card_counts || {}),
        restaurants: publicRestaurants.length,
        activities: publicActivities.length,
        matched_locations: publicMatchedLocations.length,
      },
      cardCounts: {
        ...(result.cardCounts || result.card_counts || {}),
        restaurants: publicRestaurants.length,
        activities: publicActivities.length,
        matched_locations: publicMatchedLocations.length,
      },
      render_mode: result.render_mode === "empty" ? "empty" : result.render_mode,
      renderMode: result.renderMode || result.render_mode,
      searchPerformance: betaDebug && (result.debug as any)?.performance ? { totalMs: (result.debug as any).performance.total_ms, speedStatus: (result.debug as any).performance.speed_status, resultCount: (result.debug as any).performance.result_count } : undefined,
      debug: betaDebug ? { ...(result.debug || {}), marketGuardrailRejected: ((result.debug as any)?.marketGuardrailRejected ?? 0) + marketGuardrailRejected, resolvedMarket: resolvedMarketForGuardrail, explicitMarketRequested: explicitMarketRequestedForGuardrail, fallbackSuppressedBecauseExplicitMarket: explicitMarketRequestedForGuardrail && marketGuardrailRejected > 0, routeDebug: { ...((result.debug as any)?.routeDebug || {}), selectedSearchLane }, selectedSearchLane, plannedTime, outingTiming: parsedOutingDateTime } : undefined,
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
        marketGuardrailRejected,
        resolvedMarket: resolvedMarketForGuardrail,
        explicitMarketRequested: explicitMarketRequestedForGuardrail,
        fallbackSuppressedBecauseExplicitMarket: explicitMarketRequestedForGuardrail && marketGuardrailRejected > 0,
        final_restaurants: publicRestaurants.length,
        final_activities: publicActivities.length,
        fallback_used: Boolean(
          (result.debug as any)?.restaurantRecoveryUsed ||
            (result.debug as any)?.activityRecoveryUsed,
        ),
        no_results_reason:
          result.render_mode === "empty" ? "no_strong_matches" : null,
      },
    };

    const debug = (result.debug as any) ?? {};
    const normalizedIntent =
      debug.normalizedIntent ?? debug.intent ?? result.normalizedIntent ?? null;
    const counts = debug.counts ?? {
      restaurants: publicRestaurants.length,
      activities: publicActivities.length,
      pairs: result.pairs?.length ?? 0,
      finalDisplayedResultCount: publicCards.length,
    };
    const noResultsReason =
      result.no_results_reason ??
      result.noResultsReason ??
      debug.no_results_reason ??
      debug.noResultsReason ??
      response.diagnostics.no_results_reason ??
      null;
    const noPairsReason =
      result.no_pairs_reason ??
      result.noPairsReason ??
      debug.no_pairs_reason ??
      debug.noPairsReason ??
      null;
    const responsePayload = response as any;
    const resolvedIntentParserSource =
      debug.intentParserSource ??
      debug.intent_parser_source ??
      debug.intentParser?.source ??
      debug.normalizedIntent?.intentParserSource ??
      debug.normalizedIntent?.parserSource ??
      normalizedIntent?.intentParserSource ??
      normalizedIntent?.parserSource ??
      result?.intentParserSource ??
      result?.parserSource ??
      null;
    const resolvedSearchType =
      normalizedIntent?.searchType ??
      debug.normalizedIntent?.searchType ??
      debug.intent?.searchType ??
      result?.searchType ??
      responsePayload?.searchType ??
      null;
    const resolvedPrimaryDomain =
      normalizedIntent?.primaryDomain ??
      debug.normalizedIntent?.primaryDomain ??
      debug.intent?.primaryDomain ??
      result?.primaryDomain ??
      responsePayload?.primaryDomain ??
      null;
    const resolvedGeo =
      normalizedIntent?.geo ??
      debug.normalizedIntent?.geo ??
      debug.geo ??
      debug.originalGeo ??
      result?.geo ??
      responsePayload?.geo ??
      null;
    const resolvedOutingDate =
      metadataString(normalizedIntent?.outingDate?.date) ??
      metadataString(normalizedIntent?.dateTime?.date) ??
      metadataString(normalizedIntent?.outing?.date) ??
      metadataString(debug.normalizedIntent?.outingDate?.date) ??
      metadataString(debug.normalizedIntent?.dateTime?.date) ??
      null;
    const resolvedOutingTime =
      metadataString(normalizedIntent?.outingDate?.time) ??
      metadataString(normalizedIntent?.dateTime?.time) ??
      metadataString(normalizedIntent?.outing?.time) ??
      metadataString(debug.normalizedIntent?.outingDate?.time) ??
      metadataString(debug.normalizedIntent?.dateTime?.time) ??
      null;
    const resolvedOutingDateTime =
      metadataString(normalizedIntent?.outingDate?.dateTime) ??
      metadataString(normalizedIntent?.dateTime?.dateTime) ??
      metadataString(debug.normalizedIntent?.outingDate?.dateTime) ??
      metadataString(debug.normalizedIntent?.dateTime?.dateTime) ??
      null;
    const resolvedOutingTimeLabel =
      metadataString(normalizedIntent?.outingDate?.label) ??
      metadataString(normalizedIntent?.dateTime?.label) ??
      metadataString(debug.normalizedIntent?.outingDate?.label) ??
      metadataString(debug.normalizedIntent?.dateTime?.label) ??
      null;

    void logSearchEvent({
      source: "public_create_search",
      route: "/api/generate",
      rawQuery: cleanInput,
      normalizedQuery:
        normalizedIntent?.rawQuery ?? normalizedIntent?.query ?? cleanInput,
      searchType: resolvedSearchType,
      primaryDomain: resolvedPrimaryDomain,
      intentParserSource: resolvedIntentParserSource,
      anonymousId:
        (typeof body?.anonymousId === "string" ? body.anonymousId : null) ??
        request.headers.get("x-anonymous-id"),
      sessionId: request.headers.get("x-session-id"),
      betaAssignmentId: typeof betaAssignmentId === "string" ? betaAssignmentId : null,
      betaTesterId: typeof betaTesterId === "string" ? betaTesterId : null,
      geo: resolvedGeo,
      outingDate: resolvedOutingDate,
      outingTime: resolvedOutingTime,
      outingDateTime: resolvedOutingDateTime,
      outingTimeLabel: resolvedOutingTimeLabel,
      counts,
      performance: debug?.performance ?? {
        route: "/api/generate",
        total_ms: Date.now() - startedAt,
      },
      pairingPreference:
        normalizedIntent?.pairingPreference ?? debug?.pairingPreference ?? null,
      success: result?.success !== false,
      hadIssue: Boolean(
        noResultsReason ||
          noPairsReason ||
          debug?.event_type === "no_results" ||
          debug?.event_type === "no_valid_pairs",
      ),
      issueType: noResultsReason
        ? "no_results"
        : noPairsReason
          ? "no_valid_pairs"
          : null,
      issueLabel: noResultsReason ?? noPairsReason ?? null,
      noResultsReason,
      noPairsReason,
      metadata: sanitizeSearchMetadata({
        search_system: debug?.search_system,
        render_mode: debug?.render_mode ?? result?.render_mode,
        wantsPairing: normalizedIntent?.wantsPairing,
        needsRestaurant: normalizedIntent?.needsRestaurant,
        needsActivity: normalizedIntent?.needsActivity,
        normalizedIntent,
        geo: resolvedGeo,
        searchType: resolvedSearchType,
        primaryDomain: resolvedPrimaryDomain,
        intentParserSource: resolvedIntentParserSource,
        selectedSearchLane,
        raw_query: cleanInput,
        parsed_market: resolvedMarketForGuardrail,
        parsed_borough: normalizedIntent?.geo?.borough ?? debug?.parsedBorough ?? null,
        parsed_city: normalizedIntent?.geo?.city ?? debug?.parsedCity ?? null,
        explicit_market_requested: explicitMarketRequestedForGuardrail,
        final_result_markets_returned: Array.from(new Set([...publicRestaurants, ...publicActivities].map((item: any) => `${item.market || "UNKNOWN"}:${item.state || ""}`))),
        market_guardrail_rejected_count: marketGuardrailRejected,
        fallback_suppressed_count: explicitMarketRequestedForGuardrail && marketGuardrailRejected > 0 ? 1 : 0,
      }) as Record<string, any>,
    });

    if (result.source === "edge" || (result.debug as any)?.source === "edge") {
      void logSearchHealthEvent({
        source: betaTesterId ? "beta_tester_search" : "public_create_search",
        rawQuery: cleanInput,
        result,
        debug: result.debug,
        betaAssignmentId,
        betaTesterId,
        debugMode: betaDebug || Boolean(body?.debug),
        betaFeedbackSubmitted,
      });
    }

    console.log(
      "ROUTE_TIMING",
      JSON.stringify({
        route: "/api/generate",
        total_ms: Date.now() - startedAt,
        cache_status: isEdgeCreateSearchEnabled() ? "edge-or-legacy-fallback" : "enterprise-rpc",
        result_count:
          publicRestaurants.length +
          publicActivities.length +
          publicMatchedLocations.length,
      }),
    );

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("[api/generate] search failed", {
      message,
      stack: error instanceof Error ? error.stack : null,
      hint:
        message.includes("not iterable") || message.includes("intent.vibe")
          ? "Likely LLM intent shape regression. Check intent.vibe normalization."
          : "Search route failed after parsing or ranking.",
    });

    void logSearchEvent({
      source: "public_create_search",
      route: "/api/generate",
      rawQuery: searchHealthRawQuery,
      performance: {
        route: "/api/generate",
        total_ms: Date.now() - startedAt,
        speed_status: "failed",
      },
      success: false,
      hadIssue: true,
      issueType: "search_error",
      issueLabel: "Search route failed",
      metadata: {
        error: message,
      },
    });

    void logSearchHealthEvent({
      source: "public_create_search",
      rawQuery: searchHealthRawQuery,
      result: emptySearchResponse("Search is having trouble right now."),
      errors: [message],
      timingMs: Date.now() - startedAt,
      speedStatus: "failed",
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
