import { getLocationImage } from "@/lib/locationImage";
import {
  normalizePublicCardImage,
  hasPublicCardImage,
} from "@/lib/publicCardImage";
import {
  isEdgeCreateSearchEnabled,
  runCreateSearchWithEdgeFallback,
} from "@/lib/search/createSearch";
import { runEnterpriseSearch } from "@/lib/search/enterprise";
import { logSearchEvent } from "@/lib/search/enterprise/searchEventLogger";
import {
  buildCreateSearchDebugParity,
  getCreateSearchAnalyticsIntent,
} from "@/lib/search/enterprise/createSearchAnalytics";
import { logSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";
import {
  isExplicitMarket,
  isPairAllowedForResolvedMarket,
  isResultAllowedForResolvedMarket,
} from "@/lib/search/market-guardrails";
import { parsePlannedTimeFromQuery } from "@/lib/outings/parse-planned-time";
import { parseOutingDateTime } from "@/lib/search/parse-outing-date-time";
import { detectRequestedMarket } from "@/lib/location-markets";
import { normalizeCreateSearchRequest } from "@/lib/search/normalizeCreateSearchRequest";
import {
  checkSearchLimit,
  getCurrentSearchIdentity,
  recordSearchUsageEvent,
} from "@/lib/search-usage-limits";
import { NextRequest } from "next/server";
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
  const usableImage = getLocationImage(item) || "/toh_logo.png";

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
      (item?.restaurant_name
        ? "restaurant"
        : item?.activity_name
          ? "activity"
          : null),
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
      item?.reservation_url ??
      item?.reservation_link ??
      item?.booking_url ??
      null,
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

function normalizeSelectedSearchLane(
  value: unknown,
): "auto" | "restaurant" | "activity" | "mixed" | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/_/g, "-");
  if (
    [
      "restaurant",
      "restaurants",
      "food",
      "dining",
      "restaurant-only",
      "restaurant only",
    ].includes(normalized)
  )
    return "restaurant";
  if (
    [
      "activity",
      "activities",
      "things-to-do",
      "things to do",
      "activity-only",
      "activity only",
    ].includes(normalized)
  )
    return "activity";
  if (
    ["mixed", "mixed-outing", "mixed outing", "outing", "pairing"].includes(
      normalized,
    )
  )
    return "mixed";
  if (["auto", "any", "all", "default"].includes(normalized)) return "auto";
  return null;
}

function selectedSearchLaneFromRequestBody(
  body: any,
): "auto" | "restaurant" | "activity" | "mixed" {
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

function finiteNumberFrom(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function normalizeRequestCoordinates(body: any) {
  const latitude = finiteNumberFrom(
    body?.latitude,
    body?.lat,
    body?.userLatitude,
    body?.user_latitude,
    body?.userLocation?.latitude,
    body?.user_location?.latitude,
    body?.userLocation?.lat,
    body?.user_location?.lat,
  );
  const longitude = finiteNumberFrom(
    body?.longitude,
    body?.lng,
    body?.lon,
    body?.userLongitude,
    body?.user_longitude,
    body?.userLocation?.longitude,
    body?.user_location?.longitude,
    body?.userLocation?.lng,
    body?.user_location?.lng,
  );
  return latitude != null && longitude != null ? { latitude, longitude } : null;
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
      .replace(
        /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g,
        "[redacted_phone]",
      );
  }

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, unknown>
  >((acc, [key, item]) => {
    if (/email|phone|address/i.test(key)) return acc;
    acc[key] = sanitizeSearchMetadata(item);
    return acc;
  }, {});
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

    const normalizedRequest = normalizeCreateSearchRequest({
      rawQuery: input,
      body,
      source: "public_create",
    });
    const {
      cleanedQuery: cleanInput,
      nearMeIntent,
      typedLocationIntent,
      useCurrentLocation,
      userLatitude,
      userLongitude,
      rawQueryBeforeNearMeStrip,
      rawQueryAfterNearMeStrip,
      selectedSearchLane,
    } = normalizedRequest;
    searchHealthRawQuery = cleanInput;

    if (!cleanInput) {
      return Response.json(
        emptySearchResponse("Please enter what you want to search for."),
      );
    }

    const searchIdentity = await getCurrentSearchIdentity(request);
    const limitCheck = await checkSearchLimit(searchIdentity, cleanInput);
    if (!limitCheck.allowed) {
      await recordSearchUsageEvent({
        identity: searchIdentity,
        query: cleanInput,
        allowed: false,
        reason: "weekly_limit_reached",
        planKey: limitCheck.plan.planKey,
      });
      const blocked = Response.json(
        {
          success: false,
          error: "SEARCH_LIMIT_REACHED",
          limit: {
            planKey: limitCheck.plan.planKey,
            weeklyLimit: limitCheck.weeklyLimit,
            usedThisWeek: limitCheck.usedThisWeek,
            resetWindow: "weekly",
            message: limitCheck.message,
          },
        },
        { status: 429 },
      );
      if (searchIdentity.setGuestCookie && searchIdentity.guestId)
        blocked.headers.append(
          "Set-Cookie",
          `guest_search_id=${searchIdentity.guestId}; Path=/; Max-Age=31536000; SameSite=Lax`,
        );
      return blocked;
    }

    console.log("[api/generate] request", {
      input: cleanInput,
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      nodeEnv: process.env.NODE_ENV,
      nearMeIntent,
      useCurrentLocation:
        body?.useCurrentLocation === true ||
        body?.use_current_location === true,
      userLatitudePresent: Number.isFinite(
        Number(body?.userLatitude ?? body?.user_latitude),
      ),
      userLongitudePresent: Number.isFinite(
        Number(body?.userLongitude ?? body?.user_longitude),
      ),
      rawQueryBeforeNearMeStrip,
      rawQueryAfterNearMeStrip: cleanInput,
    });
    const timezone =
      typeof body?.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim()
        : "America/New_York";
    const manualConfidence = ["none", "date_only", "exact"].includes(
      body?.outingTimeConfidence,
    )
      ? body.outingTimeConfidence
      : null;
    const parsedOutingDateTime = parseOutingDateTime(cleanInput);
    const parsedPlannedTime = parsePlannedTimeFromQuery(cleanInput, timezone);
    const plannedTime = manualConfidence
      ? {
          plannedFor:
            typeof body?.plannedFor === "string" ? body.plannedFor : null,
          timezone,
          matchedText: null,
          dateContext:
            typeof body?.outingDateContext === "string"
              ? body.outingDateContext
              : null,
          confidence: manualConfidence,
          shouldSchedulePreOutingReminders:
            manualConfidence === "exact" &&
            typeof body?.plannedFor === "string",
          shouldScheduleNextMorningFollowup:
            body?.nextMorningFollowupEnabled === true ||
            typeof body?.nextMorningFollowupDate === "string",
          nextMorningFollowupDate:
            typeof body?.nextMorningFollowupDate === "string"
              ? body.nextMorningFollowupDate
              : null,
          source: "manual",
        }
      : {
          ...parsedPlannedTime,
          source: parsedPlannedTime.confidence === "none" ? null : "query",
        };

    const userLatitudePresent = userLatitude != null;
    const userLongitudePresent = userLongitude != null;
    const currentLocationUserLocation =
      useCurrentLocation && userLatitudePresent && userLongitudePresent
        ? {
            latitude: userLatitude,
            longitude: userLongitude,
            radiusMiles: Number.isFinite(
              Number(body?.radiusMiles ?? body?.radius_miles),
            )
              ? Number(body?.radiusMiles ?? body?.radius_miles)
              : 12,
            label: "Current location",
          }
        : null;
    const nearMeDebug = {
      nearMeIntent,
      typedLocationIntent,
      useCurrentLocation,
      userLatitudePresent,
      userLongitudePresent,
      rawQueryBeforeNearMeStrip,
      rawQueryAfterNearMeStrip: cleanInput,
    };
    const searchBody = normalizedRequest.searchBody;

    const betaAssignmentId =
      body?.betaAssignmentId ||
      body?.beta_assignment_id ||
      new URL(request.url).searchParams.get("betaAssignmentId") ||
      request.headers.get("x-beta-assignment-id");
    const betaTesterId =
      body?.betaTesterId ||
      body?.beta_tester_id ||
      request.headers.get("x-beta-tester-id");
    const usedCustomPrompt =
      body?.usedCustomPrompt === true ||
      body?.usedCustomPrompt === "true" ||
      new URL(request.url).searchParams.get("usedCustomPrompt") === "true" ||
      request.headers.get("x-used-custom-prompt") === "true";
    const betaDebug =
      process.env.NODE_ENV !== "production" ||
      Boolean(
        betaAssignmentId || betaTesterId || body?.betaDebug || body?.debug,
      );
    const betaFeedbackSubmitted = Boolean(
      betaTesterId &&
      (body?.feedbackSubmitted === true ||
        body?.feedback_submitted === true ||
        body?.feedback ||
        body?.feedback_type ||
        body?.expected_result ||
        body?.actual_result ||
        body?.rating),
    );
    const legacySearch = () =>
      runEnterpriseSearch(cleanInput, {
        body: searchBody,
        userLocation: currentLocationUserLocation,
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
    const forceLegacyForLongIsland = false;
    const forceLegacyForUserLocation = false;
    const currentLocationBackendDecision = currentLocationUserLocation
      ? "edge_with_user_location_context"
      : "no_current_location";
    const searchBackendUsed = isEdgeCreateSearchEnabled()
      ? "edge"
      : "enterprise";
    const result: any =
      forceLegacyForLongIsland
        ? await legacySearch()
        : await runCreateSearchWithEdgeFallback(
            {
              ...searchBody,
              prompt: cleanInput,
              limit: body?.limit ?? 12,
              debug: betaDebug || Boolean(body?.debug),
            },
            {
              accessToken:
                request.headers
                  .get("Authorization")
                  ?.replace(/^Bearer\s+/i, "") ?? null,
              fallbackDisabled: body?.disableLegacyFallback === true,
              legacySearch,
            },
          );

    const rawRestaurants = Array.isArray(result.restaurants)
      ? result.restaurants
      : [];
    const rawActivities = Array.isArray(result.activities)
      ? result.activities
      : [];
    const rawMatchedLocations = Array.isArray(result.matched_locations)
      ? result.matched_locations
      : Array.isArray(result.matchedLocations)
        ? result.matchedLocations
        : [];
    const rawCards = Array.isArray(result.cards) ? result.cards : [];
    const rawPairs = Array.isArray(result.pairs) ? result.pairs : [];

    const normalizeResultCard = (item: any) => {
      const card =
        typeof toCardRecord === "function" ? toCardRecord(item) : item;

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

    const resolvedMarketForGuardrail =
      (result.debug as any)?.resolvedMarket ??
      (result.debug as any)?.normalizedIntent?.geo?.resolvedMarket ??
      null;
    const explicitMarketRequestedForGuardrail =
      isExplicitMarket(resolvedMarketForGuardrail) &&
      Boolean(
        (result.debug as any)?.explicitMarketRequested ??
        (result.debug as any)?.normalizedIntent?.geo?.explicitMarketRequested,
      );
    const guardResult = (item: any) =>
      resolvedMarketForGuardrail === "LONG_ISLAND"
        ? true
        : !explicitMarketRequestedForGuardrail ||
          isResultAllowedForResolvedMarket(item, resolvedMarketForGuardrail);

    const normalizedRestaurantsBeforeGuardrail = rawRestaurants
      .map(normalizeResultCard)
      .filter(hasPublicCardImage);
    const normalizedActivitiesBeforeGuardrail = rawActivities
      .map(normalizeResultCard)
      .filter(hasPublicCardImage);
    const normalizedMatchedBeforeGuardrail = rawMatchedLocations
      .map(normalizeResultCard)
      .filter(hasPublicCardImage);
    const normalizedCardsBeforeGuardrail = rawCards
      .map(normalizeResultCard)
      .filter(hasPublicCardImage);

    const publicRestaurants =
      normalizedRestaurantsBeforeGuardrail.filter(guardResult);
    const publicActivities =
      normalizedActivitiesBeforeGuardrail.filter(guardResult);
    const publicMatchedLocations =
      normalizedMatchedBeforeGuardrail.filter(guardResult);
    const publicResultCards =
      normalizedCardsBeforeGuardrail.filter(guardResult);
    const marketGuardrailRejected =
      normalizedRestaurantsBeforeGuardrail.length -
      publicRestaurants.length +
      (normalizedActivitiesBeforeGuardrail.length - publicActivities.length) +
      (normalizedMatchedBeforeGuardrail.length -
        publicMatchedLocations.length) +
      (normalizedCardsBeforeGuardrail.length - publicResultCards.length);

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
              card.name ||
              card.restaurant_name ||
              card.activity_name ||
              card.image_url
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

    const normalizedPairsBeforeGuardrail = rawPairs.map(
      normalizeNestedPublicImages,
    );
    const publicPairs =
      explicitMarketRequestedForGuardrail &&
      resolvedMarketForGuardrail !== "LONG_ISLAND"
        ? normalizedPairsBeforeGuardrail.filter((pair: any) =>
            isPairAllowedForResolvedMarket(pair, resolvedMarketForGuardrail),
          )
        : normalizedPairsBeforeGuardrail;
    const mlResultIds = [
      ...publicRestaurants,
      ...publicActivities,
      ...publicMatchedLocations,
      ...publicCards,
    ]
      .map((item: any, index) => ({
        location_id: typeof item?.id === "string" ? item.id : null,
        location_type:
          item?.location_type === "activity"
            ? "activity"
            : item?.location_type === "restaurant"
              ? "restaurant"
              : null,
        name:
          item?.name || item?.restaurant_name || item?.activity_name || null,
        rank: index + 1,
        market: item?.market || resolvedMarketForGuardrail || null,
        city: item?.city || null,
        state: item?.state || null,
      }))
      .filter((item: any) => item.location_id && item.location_type)
      .slice(0, 25);
    const mlPairIds = publicPairs
      .map((pair: any, index: number) => {
        const restaurant =
          pair?.restaurant ||
          pair?.restaurant_location ||
          pair?.restaurantLocation;
        const activity =
          pair?.activity || pair?.activity_location || pair?.activityLocation;
        if (pair?.pair_type === "activity_activity") {
          return {
            first_activity_location_id:
              typeof restaurant?.id === "string" ? restaurant.id : null,
            second_activity_location_id:
              typeof activity?.id === "string" ? activity.id : null,
            activity_location_id:
              typeof restaurant?.id === "string" ? restaurant.id : null,
            paired_activity_location_id:
              typeof activity?.id === "string" ? activity.id : null,
            first_activity_name:
              restaurant?.name || restaurant?.activity_name || null,
            second_activity_name:
              activity?.name || activity?.activity_name || null,
            pair_type: "activity_activity",
            rank: index + 1,
            pair_distance_miles:
              pair?.pairDistanceMiles ??
              pair?.distance_miles ??
              pair?.pair_distance_miles ??
              null,
            market:
              pair?.market ||
              restaurant?.market ||
              activity?.market ||
              resolvedMarketForGuardrail ||
              null,
          };
        }
        return {
          restaurant_location_id:
            typeof restaurant?.id === "string" ? restaurant.id : null,
          activity_location_id:
            typeof activity?.id === "string" ? activity.id : null,
          restaurant_name:
            restaurant?.name || restaurant?.restaurant_name || null,
          activity_name: activity?.name || activity?.activity_name || null,
          pair_type: "restaurant_activity",
          rank: index + 1,
          pair_distance_miles:
            pair?.pairDistanceMiles ??
            pair?.distance_miles ??
            pair?.pair_distance_miles ??
            null,
          market:
            pair?.market ||
            restaurant?.market ||
            activity?.market ||
            resolvedMarketForGuardrail ||
            null,
        };
      })
      .filter((pair: any) =>
        pair.pair_type === "activity_activity"
          ? pair.first_activity_location_id && pair.second_activity_location_id
          : pair.restaurant_location_id && pair.activity_location_id,
      )
      .slice(0, 10);

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

    const marketFiltering = {
      explicitMarketRequested: explicitMarketRequestedForGuardrail,
      resolvedMarket: resolvedMarketForGuardrail,
      requestedMarket:
        (result.debug as any)?.requestedMarket ??
        marketDetection.requestedMarket,
      allowedMarkets:
        (result.debug as any)?.allowedMarkets ?? marketDetection.allowedMarkets,
      geoSource: explicitMarketRequestedForGuardrail
        ? "typed_location"
        : currentLocationUserLocation
          ? "current_location"
          : ((result.debug as any)?.geoSource ?? "default_market"),
      userLocationReceived: userLatitudePresent && userLongitudePresent,
      userLocationUsedAsPrimaryGeo: Boolean(currentLocationUserLocation),
      userLocationUsedAsSoftBoost: Boolean(
        nearMeIntent &&
        typedLocationIntent &&
        userLatitudePresent &&
        userLongitudePresent,
      ),
      restaurantCandidatesBeforeMarketFilter:
        normalizedRestaurantsBeforeGuardrail.length,
      restaurantCandidatesAfterMarketFilter: publicRestaurants.length,
      activityCandidatesBeforeMarketFilter:
        normalizedActivitiesBeforeGuardrail.length,
      activityCandidatesAfterMarketFilter: publicActivities.length,
      outOfMarketRestaurantsRemoved:
        normalizedRestaurantsBeforeGuardrail.length - publicRestaurants.length,
      outOfMarketActivitiesRemoved:
        normalizedActivitiesBeforeGuardrail.length - publicActivities.length,
    };

    const preAnalyticsCounts = {
      restaurants: publicRestaurants.length,
      activities: publicActivities.length,
      pairs: publicPairs.length,
      cards: publicCards.length,
      finalDisplayedResultCount:
        publicCards.length ||
        publicRestaurants.length +
          publicActivities.length +
          publicMatchedLocations.length +
          publicPairs.length,
      pairCandidatesEvaluated: (result.debug as any)?.pairCandidatesEvaluated,
      validPairCountBeforeRender: (result.debug as any)
        ?.validPairCountBeforeRender,
      candidatePairCountBeforeRequiredPairSuppression: (result.debug as any)
        ?.candidatePairCountBeforeRequiredPairSuppression,
      pairsRejectedForDistance: (result.debug as any)?.pairsRejectedForDistance,
      pairsRejectedForMissingCoordinates: (result.debug as any)
        ?.pairsRejectedForMissingCoordinates,
      extremeWalkingRoutesRejected: (result.debug as any)
        ?.extremeWalkingRoutesRejected,
      invalidWalkingRoutesHiddenFromDisplay: (result.debug as any)
        ?.invalidWalkingRoutesHiddenFromDisplay,
      pairQualityScorePreview: (result.debug as any)?.pairQualityScorePreview,
    };
    const preAnalyticsIntent = getCreateSearchAnalyticsIntent({
      result,
      debug: result.debug,
      counts: preAnalyticsCounts,
    });
    const preIntentParserSource =
      (result.debug as any)?.intentParserSource ??
      (result.debug as any)?.intent_parser_source ??
      preAnalyticsIntent?.intentParserSource ??
      preAnalyticsIntent?.parserSource ??
      null;
    const debugParity = buildCreateSearchDebugParity({
      existing: {
        ...normalizedRequest.debugParity,
        source: "public_create_search",
        forceLegacyForLongIsland,
        forceLegacyForUserLocation,
        currentLocationBackendDecision,
        searchHealthMode: body?.searchHealthMode ?? "public",
        usesPublicSearchPath: true,
        forceLegacyForMlDebug: false,
        debugPayloadLevel: betaDebug || body?.debug ? "debug" : "compact",
        publicSearchUsesMl: true,
        edgeSearchUsed: searchBackendUsed === "edge",
        edgeSearchUsesMl: false,
        enterpriseSearchUsed:
          searchBackendUsed !== "edge" ||
          Boolean((result.debug as any)?.search_system),
        mlAppliedInPublicPath: Boolean(
          (result.debug as any)?.mlSearchDebug?.mlEnabled,
        ),
        mlUnavailableReason:
          (result.debug as any)?.mlSearchDebug?.mlUnavailableReason ?? null,
        resultCounts: {
          restaurants: publicRestaurants.length,
          activities: publicActivities.length,
          pairs: publicPairs.length,
          cards: publicCards.length,
        },
        firstResultNames: [
          ...publicRestaurants,
          ...publicActivities,
          ...publicCards,
        ]
          .slice(0, 5)
          .map(
            (item: any) =>
              item.name || item.restaurant_name || item.activity_name,
          )
          .filter(Boolean),
      },
      rawQueryReceived: input,
      cleanedQuery: cleanInput,
      rawQueryBeforeNearMeStrip,
      rawQueryAfterNearMeStrip: cleanInput,
      nearMeIntent,
      typedLocationIntent,
      useCurrentLocation,
      userLatitudePresent,
      userLongitudePresent,
      searchBackendUsed,
      currentLocationBackendDecision,
      searchHealthMode: body?.searchHealthMode ?? "public",
      usesPublicSearchPath: true,
      forceLegacyForMlDebug: false,
      debugPayloadLevel: betaDebug || body?.debug ? "debug" : "compact",
      publicSearchUsesMl: true,
      edgeSearchUsed: searchBackendUsed === "edge",
      edgeSearchUsesMl: searchBackendUsed !== "edge" ? false : false,
      enterpriseSearchUsed:
        searchBackendUsed !== "edge" ||
        Boolean((result.debug as any)?.search_system),
      mlAppliedInPublicPath: Boolean(
        (result.debug as any)?.mlSearchDebug?.mlEnabled,
      ),
      mlUnavailableReason:
        (result.debug as any)?.mlSearchDebug?.mlUnavailableReason ?? null,
      resolvedMarket: resolvedMarketForGuardrail,
      allowedMarkets: marketFiltering.allowedMarkets,
      explicitMarketRequested: explicitMarketRequestedForGuardrail,
      analyticsIntent: preAnalyticsIntent,
      renderMode: result.render_mode ?? result.renderMode ?? null,
      counts: preAnalyticsCounts,
      intentParserSource: preIntentParserSource,
    });

    Object.assign(debugParity, {
      searchHealthMode: body?.searchHealthMode ?? "public",
      usesPublicSearchPath: true,
      forceLegacyForMlDebug: false,
      debugPayloadLevel: betaDebug || body?.debug ? "debug" : "compact",
      publicSearchUsesMl: true,
      edgeSearchUsed: searchBackendUsed === "edge",
      edgeSearchUsesMl: false,
      enterpriseSearchUsed:
        searchBackendUsed !== "edge" ||
        Boolean((result.debug as any)?.search_system),
      mlAppliedInPublicPath: Boolean(
        (result.debug as any)?.mlSearchDebug?.mlEnabled,
      ),
      mlUnavailableReason:
        (result.debug as any)?.mlSearchDebug?.mlUnavailableReason ?? null,
    });

    const response = {
      ...result,
      reply:
        currentLocationUserLocation &&
        publicRestaurants.length +
          publicActivities.length +
          publicMatchedLocations.length ===
          0
          ? "We couldn’t find dinner spots near your current location yet. Try a nearby neighborhood or turn off Location and search by borough."
          : resolvedMarketForGuardrail === "LONG_ISLAND" &&
              publicRestaurants.length +
                publicActivities.length +
                publicMatchedLocations.length ===
                0
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
      render_mode:
        result.render_mode === "empty" ? "empty" : result.render_mode,
      renderMode: result.renderMode || result.render_mode,
      searchPerformance:
        betaDebug && (result.debug as any)?.performance
          ? {
              totalMs: (result.debug as any).performance.total_ms,
              speedStatus: (result.debug as any).performance.speed_status,
              resultCount: (result.debug as any).performance.result_count,
            }
          : undefined,
      debugParity: betaDebug ? debugParity : undefined,
      marketFiltering: betaDebug ? marketFiltering : undefined,
      debug: betaDebug
        ? {
            ...(result.debug || {}),
            rawQuery: rawQueryBeforeNearMeStrip,
            cleanedQuery: cleanInput,
            searchType:
              (result.debug as any)?.normalizedIntent?.searchType ??
              (result.debug as any)?.intent?.searchType ??
              (result as any)?.searchType ??
              selectedSearchLane,
            usedUserLocation: Boolean(currentLocationUserLocation),
            receivedLatitude: userLatitude,
            receivedLongitude: userLongitude,
            geoCenter: currentLocationUserLocation
              ? { latitude: userLatitude, longitude: userLongitude }
              : ((result.debug as any)?.effectiveGeo ??
                (result.debug as any)?.geo ??
                null),
            radiusMiles:
              currentLocationUserLocation?.radiusMiles ??
              (result.debug as any)?.rpcRadiusMiles ??
              null,
            resultCount:
              publicRestaurants.length +
              publicActivities.length +
              publicMatchedLocations.length +
              publicPairs.length,
            fallbackUsed: Boolean(
              (result.debug as any)?.restaurantRecoveryUsed ||
              (result.debug as any)?.activityRecoveryUsed,
            ),
            renderSafeResultCount:
              publicRestaurants.length +
              publicActivities.length +
              publicMatchedLocations.length,
            ...nearMeDebug,
            debugParity,
            marketFiltering,
            searchBackendUsed,
            geoSource: (result.debug as any)?.geoSource,
            marketGuardrailRejected:
              ((result.debug as any)?.marketGuardrailRejected ?? 0) +
              marketGuardrailRejected,
            resolvedMarket: resolvedMarketForGuardrail,
            explicitMarketRequested: explicitMarketRequestedForGuardrail,
            fallbackSuppressedBecauseExplicitMarket:
              explicitMarketRequestedForGuardrail &&
              marketGuardrailRejected > 0,
            routeDebug: {
              ...((result.debug as any)?.routeDebug || {}),
              selectedSearchLane,
            },
            selectedSearchLane,
            plannedTime,
            outingTiming: parsedOutingDateTime,
          }
        : undefined,
      diagnostics: {
        requested_locations:
          result.debug && (result.debug as any).geo
            ? [(result.debug as any).geo.raw].filter(Boolean)
            : [],
        restaurant_search_input: (
          (result.debug as any)?.restaurantTerms ?? []
        ).join(" "),
        activity_search_input: (
          (result.debug as any)?.activityTerms ?? []
        ).join(" "),
        marketGuardrailRejected,
        resolvedMarket: resolvedMarketForGuardrail,
        explicitMarketRequested: explicitMarketRequestedForGuardrail,
        fallbackSuppressedBecauseExplicitMarket:
          explicitMarketRequestedForGuardrail && marketGuardrailRejected > 0,
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
    const responsePayload = response as any;
    const counts = {
      ...(debug.counts ?? {}),
      restaurants: publicRestaurants.length,
      activities: publicActivities.length,
      pairs: publicPairs.length,
      finalDisplayedResultCount:
        publicCards.length ||
        publicRestaurants.length +
          publicActivities.length +
          publicMatchedLocations.length +
          publicPairs.length,
      pairCandidatesEvaluated:
        debug.pairCandidatesEvaluated ?? debug.counts?.pairCandidatesEvaluated,
      validPairCountBeforeRender:
        debug.validPairCountBeforeRender ??
        debug.counts?.validPairCountBeforeRender,
      candidatePairCountBeforeRequiredPairSuppression:
        debug.candidatePairCountBeforeRequiredPairSuppression,
      pairsRejectedForDistance: debug.pairsRejectedForDistance,
      pairsRejectedForMissingCoordinates:
        debug.pairsRejectedForMissingCoordinates,
      extremeWalkingRoutesRejected: debug.extremeWalkingRoutesRejected,
      invalidWalkingRoutesHiddenFromDisplay:
        debug.invalidWalkingRoutesHiddenFromDisplay,
      pairQualityScorePreview: debug.pairQualityScorePreview,
    };
    const normalizedIntent = getCreateSearchAnalyticsIntent({
      result,
      responsePayload,
      debug,
      counts,
    });
    const analyticsIntent = normalizedIntent;
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
      rawQuery: rawQueryBeforeNearMeStrip || input || cleanInput,
      normalizedQuery: cleanInput,
      searchType: resolvedSearchType,
      primaryDomain: resolvedPrimaryDomain,
      intentParserSource: resolvedIntentParserSource,
      anonymousId:
        (typeof body?.anonymousId === "string" ? body.anonymousId : null) ??
        request.headers.get("x-anonymous-id"),
      sessionId: request.headers.get("x-session-id"),
      betaAssignmentId:
        typeof betaAssignmentId === "string" ? betaAssignmentId : null,
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
        analyticsIntent?.pairingPreference ?? debug?.pairingPreference ?? null,
      wantsPairing: analyticsIntent?.wantsPairing ?? null,
      needsRestaurant: analyticsIntent?.needsRestaurant ?? null,
      needsActivity: analyticsIntent?.needsActivity ?? null,
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
        wantsPairing: analyticsIntent?.wantsPairing,
        needsRestaurant: analyticsIntent?.needsRestaurant,
        needsActivity: analyticsIntent?.needsActivity,
        normalizedIntent: analyticsIntent,
        originalRawQuery: rawQueryBeforeNearMeStrip || input || cleanInput,
        raw_query_before_near_me_strip: rawQueryBeforeNearMeStrip,
        raw_query_after_near_me_strip: cleanInput,
        debugParity,
        geo: resolvedGeo,
        searchType: resolvedSearchType,
        primaryDomain: resolvedPrimaryDomain,
        intentParserSource: resolvedIntentParserSource,
        selectedSearchLane,
        ...nearMeDebug,
        geoSource: debug?.geoSource,
        raw_query: rawQueryBeforeNearMeStrip || input || cleanInput,
        ml_result_ids: mlResultIds,
        ml_pair_ids: mlPairIds,
        parsed_market: resolvedMarketForGuardrail,
        requestedMarket: marketFiltering.requestedMarket,
        resolvedMarket: resolvedMarketForGuardrail,
        parsed_borough:
          normalizedIntent?.geo?.borough ?? debug?.parsedBorough ?? null,
        parsed_city: normalizedIntent?.geo?.city ?? debug?.parsedCity ?? null,
        explicit_market_requested: explicitMarketRequestedForGuardrail,
        final_result_markets_returned: Array.from(
          new Set(
            [...publicRestaurants, ...publicActivities].map(
              (item: any) => `${item.market || "UNKNOWN"}:${item.state || ""}`,
            ),
          ),
        ),
        market_guardrail_rejected_count: marketGuardrailRejected,
        fallback_suppressed_count:
          explicitMarketRequestedForGuardrail && marketGuardrailRejected > 0
            ? 1
            : 0,
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
        cache_status: isEdgeCreateSearchEnabled()
          ? "edge-or-legacy-fallback"
          : "enterprise-rpc",
        result_count:
          publicRestaurants.length +
          publicActivities.length +
          publicMatchedLocations.length,
      }),
    );

    await recordSearchUsageEvent({
      identity: searchIdentity,
      query: cleanInput,
      allowed: true,
      planKey: limitCheck.plan.planKey,
    });
    const finalResponse = Response.json(response);
    if (searchIdentity.setGuestCookie && searchIdentity.guestId)
      finalResponse.headers.append(
        "Set-Cookie",
        `guest_search_id=${searchIdentity.guestId}; Path=/; Max-Age=31536000; SameSite=Lax`,
      );
    return finalResponse;
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
