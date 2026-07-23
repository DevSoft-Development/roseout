import { getLocationImage } from "@/lib/locationImage";
import { sanitizePublicBranding } from "@/lib/publicBranding";
import {
  normalizePublicCardImage,
  hasPublicCardImage,
} from "@/lib/publicCardImage";
import { runOutingSearch as defaultRunOutingSearch } from "@/lib/search/runSearch";
import { shapePublicSearchCard } from "@/lib/search/resultCards";
import { logSearchEvent as defaultLogSearchEvent } from "@/lib/search/enterprise/searchEventLogger";
import {
  buildCreateSearchDebugParity,
  getCreateSearchAnalyticsIntent,
} from "@/lib/search/enterprise/createSearchAnalytics";
import { resolveSearchTelemetry } from "@/lib/search/enterprise/searchTelemetry";
import { logSearchHealthEvent as defaultLogSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";
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
  checkSearchLimit as defaultCheckSearchLimit,
  getCurrentSearchIdentity as defaultGetCurrentSearchIdentity,
  recordSearchUsageEvent as defaultRecordSearchUsageEvent,
} from "@/lib/search-usage-limits";
import {
  normalizePublicSearchRequest,
  parseJsonBody,
} from "./normalizeRequest";
import {
  createPublicSearchResponse,
  publicErrorFrom,
  serializePublicSearchResponse,
  statusFromSuccessfulPayload,
} from "./normalizeResponse";
import {
  PublicSearchError,
  mapErrorToStatus,
  withStageDeadline,
  resolveRequestId,
} from "./errors";
import { scheduleNoncriticalOperation } from "./noncritical";
import { applyFinalPublicActivityGuard } from "./finalActivityGuard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function resolvePublicIntentParserSource(result: any): string | null {
  return (
    metadataString(result?.debug?.intentParserSource) ??
    metadataString(result?.debug?.intent_parser_source) ??
    metadataString(result?.debug?.normalizedIntent?.intentParserSource) ??
    metadataString(result?.metadata?.intentParserSource) ??
    metadataString(result?.metadata?.intent_parser_source) ??
    null
  );
}

function resolveEnterpriseRawActivityCandidateCount(result: any): number {
  const debug = result?.debug ?? {};
  const count = finiteNumberFrom(
    debug.rawActivityCandidateCount,
    debug.counts?.rawActivityCandidateCount,
  );
  if (count != null) return count;
  return Array.isArray(result?.activities) ? result.activities.length : 0;
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

export type PublicSearchControllerDeps = {
  getIdentity?: typeof defaultGetCurrentSearchIdentity;
  checkLimit?: typeof defaultCheckSearchLimit;
  runSearch?: typeof defaultRunOutingSearch;
  recordUsage?: typeof defaultRecordSearchUsageEvent;
  logAnalytics?: typeof defaultLogSearchEvent;
  logSearchHealth?: typeof defaultLogSearchHealthEvent;
  logRouteTiming?: (payload: Record<string, unknown>) => unknown;
  now?: () => number;
};

export function createPublicSearchController(
  deps: PublicSearchControllerDeps = {},
) {
  return (request: Request) => handleGeneratePost(request, deps);
}

export async function handleGeneratePost(
  request: Request,
  deps: PublicSearchControllerDeps = {},
) {
  const now = deps.now ?? Date.now;
  const getIdentity = deps.getIdentity ?? defaultGetCurrentSearchIdentity;
  const checkLimit = deps.checkLimit ?? defaultCheckSearchLimit;
  const runSearch = deps.runSearch ?? defaultRunOutingSearch;
  const recordUsage = deps.recordUsage ?? defaultRecordSearchUsageEvent;
  const logAnalytics = deps.logAnalytics ?? defaultLogSearchEvent;
  const logHealth = deps.logSearchHealth ?? defaultLogSearchHealthEvent;
  const logRouteTiming =
    deps.logRouteTiming ??
    ((payload: Record<string, unknown>) =>
      console.log("ROUTE_TIMING", JSON.stringify(payload)));
  const startedAt = now();
  const timings: Record<string, number | null> = {
    parseMs: null,
    identityMs: null,
    limitMs: null,
    geoMs: null,
    anchorMs: null,
    intentMs: null,
    searchMs: null,
    pairingMs: null,
    rankingMs: null,
    normalizeMs: null,
    telemetryScheduleMs: null,
    totalMs: null,
  };
  const measure = async <T>(
    name: keyof typeof timings,
    work: () => Promise<T> | T,
  ): Promise<T> => {
    const t = now();
    try {
      return await work();
    } finally {
      timings[name] = Math.max(0, now() - t);
    }
  };
  const requestId = resolveRequestId(request.headers);
  let searchHealthRawQuery: string | null = null;

  try {
    const body = await measure("parseMs", () =>
      withStageDeadline("parse", parseJsonBody(request)),
    );
    const publicRequest = await measure("normalizeMs", () =>
      normalizePublicSearchRequest(body, request),
    );

    const input =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.input === "string"
          ? body.input
          : typeof body?.query === "string"
            ? body.query
            : "";

    const normalizedRequest = await measure("geoMs", () =>
      normalizeCreateSearchRequest({
        rawQuery: input,
        body,
        source: "public_create",
      }),
    );
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
      throw new PublicSearchError(
        "QUERY_REQUIRED",
        "Please enter what you want to search for.",
        400,
        false,
      );
    }

    const searchIdentity = await measure("identityMs", () =>
      withStageDeadline("identity", getIdentity(request)),
    );
    const limitCheck = await measure("limitMs", () =>
      withStageDeadline("limit", checkLimit(searchIdentity, cleanInput)),
    );
    if (!limitCheck.allowed) {
      await recordUsage({
        identity: searchIdentity,
        query: cleanInput,
        allowed: false,
        reason: "weekly_limit_reached",
        planKey: limitCheck.plan.planKey,
      });
      const blocked = serializePublicSearchResponse(
        createPublicSearchResponse({
          requestId,
          status: "limited",
          payload: {
            limit: {
              planKey: limitCheck.plan.planKey,
              weeklyLimit: limitCheck.weeklyLimit,
              usedThisWeek: limitCheck.usedThisWeek,
              resetWindow: "weekly",
              message: limitCheck.message,
            },
          },
          error: {
            code: "SEARCH_LIMIT_REACHED",
            message: limitCheck.message ?? "Search limit reached.",
            retryable: true,
          },
        }),
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
      requestId,
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
      String(body?.outingTimeConfidence ?? ""),
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
    const canonicalSearch = () =>
      runSearch({
        query: cleanInput,
        body: searchBody,
        userLocation: currentLocationUserLocation,
        useLLM: true,
        source: betaTesterId ? "beta_tester_search" : "public_create_search",
        route: "/api/generate",
        logPerformance: true,
        sessionId: request.headers.get("x-session-id") || null,
        betaAssignmentId:
          typeof betaAssignmentId === "string" ? betaAssignmentId : null,
        betaTesterId: typeof betaTesterId === "string" ? betaTesterId : null,
        usedCustomPrompt,
        betaDebug,
        searchHealthDebug: betaDebug,
        betaFeedbackSubmitted,
      });

    const marketDetection = detectRequestedMarket(cleanInput);
    const forceLegacyForLongIsland = false;
    const forceLegacyForUserLocation = false;
    const currentLocationBackendDecision = currentLocationUserLocation
      ? "enterprise_with_user_location"
      : "enterprise_without_user_location";
    const searchBackendUsed = "enterprise";
    const rawResult: any = await measure("searchMs", () =>
      withStageDeadline("search", canonicalSearch()),
    );
    const enterpriseRawActivityCandidateCount =
      resolveEnterpriseRawActivityCandidateCount(rawResult);
    const result: any = applyFinalPublicActivityGuard(rawResult, cleanInput);
    const searchTelemetry = resolveSearchTelemetry({
      result,
      debug: result.debug,
      selectedSearchLane,
      routeSearchMs: timings.searchMs,
    });
    const enterpriseIntentParserSource =
      resolvePublicIntentParserSource(rawResult) ??
      searchTelemetry.intentParserSource;
    timings.pairingMs = searchTelemetry.pairingMs;
    timings.rankingMs = searchTelemetry.rankingMs;
    timings.intentMs = searchTelemetry.intentMs;

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
      const card = shapePublicSearchCard(item);

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
    const mlResultIdsByLocationId = new Map<string, any>();
    [
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
      .forEach((item: any) => {
        if (!mlResultIdsByLocationId.has(item.location_id)) {
          mlResultIdsByLocationId.set(item.location_id, {
            ...item,
            rank: mlResultIdsByLocationId.size + 1,
          });
        }
      });
    const mlResultIds = Array.from(mlResultIdsByLocationId.values()).slice(
      0,
      25,
    );
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
      rawCandidateCount:
        Number((result.debug as any)?.rawCandidateCount ?? NaN) ||
        publicRestaurants.length + publicActivities.length,
      qualifiedRestaurantCount: publicRestaurants.length,
      rawActivityCandidateCount: enterpriseRawActivityCandidateCount,
      qualifiedActivityCount: publicActivities.length,
      fallbackActivityCount: Number((result.debug as any)?.fallbackActivityCount ?? 0),
      primaryPairCount: publicPairs.length,
      finalDisplayedResultCount:
        publicPairs.length > 0
          ? publicPairs.length
          : publicCards.length > 0
            ? publicCards.length
            : publicRestaurants.length +
              publicActivities.length +
              publicMatchedLocations.length,
      pairCandidatesEvaluated:
        searchTelemetry.pairCandidatesEvaluated ??
        (result.debug as any)?.pairCandidatesEvaluated,
      validPairCountBeforeRender:
        searchTelemetry.validPairCountBeforeRender ??
        (result.debug as any)?.validPairCountBeforeRender,
      candidatePairCountBeforeRequiredPairSuppression:
        searchTelemetry.candidatePairCountBeforeRequiredPairSuppression ??
        (result.debug as any)?.candidatePairCountBeforeRequiredPairSuppression,
      pairsRejectedForDistance:
        searchTelemetry.pairsRejectedForDistance ??
        (result.debug as any)?.pairsRejectedForDistance,
      pairsRejectedForMissingCoordinates:
        searchTelemetry.pairsRejectedForMissingCoordinates ??
        (result.debug as any)?.pairsRejectedForMissingCoordinates,
      extremeWalkingRoutesRejected:
        searchTelemetry.extremeWalkingRoutesRejected ??
        (result.debug as any)?.extremeWalkingRoutesRejected,
      invalidWalkingRoutesHiddenFromDisplay:
        searchTelemetry.invalidWalkingRoutesHiddenFromDisplay ??
        (result.debug as any)?.invalidWalkingRoutesHiddenFromDisplay,
      pairQualityScorePreview: (result.debug as any)?.pairQualityScorePreview,
    };
    const preAnalyticsIntent = getCreateSearchAnalyticsIntent({
      result,
      debug: result.debug,
      counts: preAnalyticsCounts,
      canonicalGeo: normalizedRequest.canonicalGeo,
      selectedSearchLane,
    });
    const preIntentParserSource = enterpriseIntentParserSource;
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
        edgeSearchUsed: false,
        edgeSearchUsesMl: false,
        enterpriseSearchUsed: true,
        legacyFallbackUsed: false,
        legacyFallbackReason: null,
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
      edgeSearchUsed: false,
      edgeSearchUsesMl: false,
      enterpriseSearchUsed: true,
      legacyFallbackUsed: false,
      legacyFallbackReason: null,
      intentParserSource: preIntentParserSource,
      mlAppliedInPublicPath: Boolean(
        (result.debug as any)?.mlSearchDebug?.mlEnabled,
      ),
      mlUnavailableReason:
        (result.debug as any)?.mlSearchDebug?.mlUnavailableReason ?? null,
      resolvedMarket: resolvedMarketForGuardrail,
      allowedMarkets: marketFiltering.allowedMarkets,
      explicitMarketRequested: explicitMarketRequestedForGuardrail,
      explicitGeoRequested: typedLocationIntent,
      canonicalLatitudePresent:
        normalizedRequest.canonicalGeo?.latitude != null,
      canonicalLongitudePresent:
        normalizedRequest.canonicalGeo?.longitude != null,
      userLocationUsedAsPrimaryGeo:
        normalizedRequest.debugParity.userLocationUsedAsPrimaryGeo,
      userLocationUsedAsSoftBoost:
        normalizedRequest.debugParity.userLocationUsedAsSoftBoost,
      analyticsIntent: preAnalyticsIntent,
      renderMode: result.render_mode ?? result.renderMode ?? null,
      counts: preAnalyticsCounts,
    });

    Object.assign(debugParity, {
      searchHealthMode: body?.searchHealthMode ?? "public",
      usesPublicSearchPath: true,
      forceLegacyForMlDebug: false,
      debugPayloadLevel: betaDebug || body?.debug ? "debug" : "compact",
      publicSearchUsesMl: true,
      edgeSearchUsed: false,
      edgeSearchUsesMl: false,
      enterpriseSearchUsed: true,
      legacyFallbackUsed: false,
      legacyFallbackReason: null,
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
      rawCandidateCount: debug.rawCandidateCount ?? publicRestaurants.length + publicActivities.length,
      rawActivityCandidateCount: enterpriseRawActivityCandidateCount,
      qualifiedActivityCount: publicActivities.length,
      fallbackActivityCount: debug.fallbackActivityCount ?? 0,
      finalDisplayedResultCount:
        publicPairs.length ||
        publicCards.length ||
        publicRestaurants.length +
          publicActivities.length +
          publicMatchedLocations.length,
      pairCandidatesEvaluated:
        searchTelemetry.pairCandidatesEvaluated ??
        debug.pairCandidatesEvaluated ??
        debug.counts?.pairCandidatesEvaluated,
      validPairCountBeforeRender:
        searchTelemetry.validPairCountBeforeRender ??
        debug.validPairCountBeforeRender ??
        debug.counts?.validPairCountBeforeRender,
      candidatePairCountBeforeRequiredPairSuppression:
        searchTelemetry.candidatePairCountBeforeRequiredPairSuppression ??
        debug.candidatePairCountBeforeRequiredPairSuppression,
      pairsRejectedForDistance:
        searchTelemetry.pairsRejectedForDistance ??
        debug.pairsRejectedForDistance,
      pairsRejectedForMissingCoordinates:
        searchTelemetry.pairsRejectedForMissingCoordinates ??
        debug.pairsRejectedForMissingCoordinates,
      extremeWalkingRoutesRejected:
        searchTelemetry.extremeWalkingRoutesRejected ??
        debug.extremeWalkingRoutesRejected,
      invalidWalkingRoutesHiddenFromDisplay:
        searchTelemetry.invalidWalkingRoutesHiddenFromDisplay ??
        debug.invalidWalkingRoutesHiddenFromDisplay,
      pairQualityScorePreview: debug.pairQualityScorePreview,
    };
    const normalizedIntent = getCreateSearchAnalyticsIntent({
      result,
      responsePayload,
      debug,
      counts,
      canonicalGeo: normalizedRequest.canonicalGeo,
      selectedSearchLane,
    });
    const analyticsIntent:
      | (Record<string, any> & { intentParserSource: string | null })
      | null =
      normalizedIntent == null
        ? null
        : {
            ...normalizedIntent,
            intentParserSource: enterpriseIntentParserSource,
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
    const resolvedIntentParserSource =
      enterpriseIntentParserSource ?? searchTelemetry.intentParserSource;
    const analyticsDebugParity = {
      ...debugParity,
      intentParserSource: resolvedIntentParserSource,
    };
    const analyticsNormalizedIntent:
      | (Record<string, any> & { intentParserSource: string | null })
      | null =
      analyticsIntent == null
        ? null
        : {
            ...analyticsIntent,
            intentParserSource: resolvedIntentParserSource,
          };
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
      normalizedRequest.canonicalGeo ??
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

    scheduleNoncriticalOperation(requestId, "logSearchEvent", () =>
      logAnalytics({
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
        performance: {
          ...(debug?.performance ?? {}),
          route: "/api/generate",
          requestId,
          total_ms: now() - startedAt,
          timing_ms: now() - startedAt,
          llm_ms: timings.intentMs,
          rpc_ms: timings.searchMs,
          pairing_ms: timings.pairingMs,
          ranking_ms: timings.rankingMs,
          speed_status:
            now() - startedAt <= 3000
              ? "fast"
              : now() - startedAt <= 10000
                ? "ok"
                : "slow",
          publicSearchTimings: { ...timings, totalMs: now() - startedAt },
        },
        pairingPreference:
          analyticsIntent?.pairingPreference ??
          debug?.pairingPreference ??
          null,
        distanceMode: searchTelemetry.distanceMode,
        maxPairDistanceMiles: searchTelemetry.maxPairDistanceMiles,
        maxPairWalkingMinutes: searchTelemetry.maxPairWalkingMinutes,
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
          requestId,
          search_system: debug?.search_system,
          render_mode: debug?.render_mode ?? result?.render_mode,
          wantsPairing: analyticsIntent?.wantsPairing,
          needsRestaurant: analyticsIntent?.needsRestaurant,
          needsActivity: analyticsIntent?.needsActivity,
          normalizedIntent: analyticsNormalizedIntent,
          originalRawQuery: rawQueryBeforeNearMeStrip || input || cleanInput,
          raw_query_before_near_me_strip: rawQueryBeforeNearMeStrip,
          raw_query_after_near_me_strip: cleanInput,
          debugParity: analyticsDebugParity,
          geo: resolvedGeo,
          searchType: resolvedSearchType,
          primaryDomain: resolvedPrimaryDomain,
          intentParserSource: resolvedIntentParserSource,
          selectedSearchLane,
          ...nearMeDebug,
          geoSource: debug?.geoSource,
          raw_query: rawQueryBeforeNearMeStrip || input || cleanInput,
          result_ids: mlResultIds,
          pair_ids: mlPairIds,
          mlStatus: searchTelemetry.mlStatus,
          mlReason: searchTelemetry.mlReason,
          searchTelemetry: {
            pairCandidatesEvaluated:
              searchTelemetry.pairCandidatesEvaluated,
            validPairCountBeforeRender:
              searchTelemetry.validPairCountBeforeRender,
            candidatePairCountBeforeRequiredPairSuppression:
              searchTelemetry.candidatePairCountBeforeRequiredPairSuppression,
            pairsRejectedForDistance:
              searchTelemetry.pairsRejectedForDistance,
            pairsRejectedForMissingCoordinates:
              searchTelemetry.pairsRejectedForMissingCoordinates,
            extremeWalkingRoutesRejected:
              searchTelemetry.extremeWalkingRoutesRejected,
            invalidWalkingRoutesHiddenFromDisplay:
              searchTelemetry.invalidWalkingRoutesHiddenFromDisplay,
            distanceMode: searchTelemetry.distanceMode,
            maxPairDistanceMiles: searchTelemetry.maxPairDistanceMiles,
            maxPairWalkingMinutes: searchTelemetry.maxPairWalkingMinutes,
            intentMs: searchTelemetry.intentMs,
            searchMs: searchTelemetry.searchMs,
            pairingMs: searchTelemetry.pairingMs,
            rankingMs: searchTelemetry.rankingMs,
          },
          mlAppliedInPublicPath: Boolean(
            (result.debug as any)?.mlSearchDebug?.mlApplied,
          ),
          mlNotAppliedReason: Boolean(
            (result.debug as any)?.mlSearchDebug?.mlApplied,
          )
            ? null
            : ((result.debug as any)?.mlSearchDebug?.mlUnavailableReason ??
              "ml_did_not_materially_change_results"),
          ml_result_ids: Boolean(
            (result.debug as any)?.mlSearchDebug?.mlApplied,
          )
            ? mlResultIds
            : undefined,
          ml_pair_ids: Boolean((result.debug as any)?.mlSearchDebug?.mlApplied)
            ? mlPairIds
            : undefined,
          parsed_market: resolvedMarketForGuardrail,
          requestedMarket:
            normalizedIntent?.geo?.requestedMarket ??
            marketFiltering.requestedMarket,
          resolvedMarket:
            normalizedIntent?.geo?.resolvedMarket ?? resolvedMarketForGuardrail,
          parsed_borough:
            normalizedIntent?.geo?.borough ??
            debug?.parsedBorough ??
            normalizedRequest.canonicalGeo?.borough ??
            null,
          parsed_city:
            normalizedIntent?.geo?.city ??
            debug?.parsedCity ??
            normalizedRequest.canonicalGeo?.city ??
            null,
          explicit_market_requested: explicitMarketRequestedForGuardrail,
          explicitGeoRequested: typedLocationIntent,
          canonicalLatitudePresent:
            normalizedRequest.canonicalGeo?.latitude != null,
          canonicalLongitudePresent:
            normalizedRequest.canonicalGeo?.longitude != null,
          userLocationUsedAsPrimaryGeo:
            normalizedRequest.debugParity.userLocationUsedAsPrimaryGeo,
          userLocationUsedAsSoftBoost:
            normalizedRequest.debugParity.userLocationUsedAsSoftBoost,
          final_result_markets_returned: Array.from(
            new Set(
              [...publicRestaurants, ...publicActivities].map(
                (item: any) =>
                  `${item.market || "UNKNOWN"}:${item.state || ""}`,
              ),
            ),
          ),
          market_guardrail_rejected_count: marketGuardrailRejected,
          fallback_suppressed_count:
            explicitMarketRequestedForGuardrail && marketGuardrailRejected > 0
              ? 1
              : 0,
        }) as Record<string, any>,
      }),
    );

    if (result.source === "edge" || (result.debug as any)?.source === "edge") {
      scheduleNoncriticalOperation(requestId, "logSearchHealthEvent", () =>
        logHealth({
          source: betaTesterId ? "beta_tester_search" : "public_create_search",
          rawQuery: cleanInput,
          result,
          debug: result.debug,
          betaAssignmentId:
            typeof betaAssignmentId === "string" ? betaAssignmentId : null,
          betaTesterId: typeof betaTesterId === "string" ? betaTesterId : null,
          debugMode: betaDebug || Boolean(body?.debug),
          betaFeedbackSubmitted,
        }),
      );
    }

    scheduleNoncriticalOperation(requestId, "logRouteTiming", () =>
      logRouteTiming({
        route: "/api/generate",
        requestId,
        total_ms: now() - startedAt,
        cache_status: "canonical-enterprise-rpc",
        result_count:
          publicRestaurants.length +
          publicActivities.length +
          publicMatchedLocations.length,
      }),
    );

    scheduleNoncriticalOperation(requestId, "recordSearchUsageEvent", () =>
      recordUsage({
        identity: searchIdentity,
        query: cleanInput,
        allowed: true,
        planKey: limitCheck.plan.planKey,
      }),
    );
    const publicResponse = createPublicSearchResponse({
      requestId,
      status: statusFromSuccessfulPayload(response as Record<string, unknown>),
      payload: sanitizePublicBranding(response) as Record<string, unknown>,
    });
    const finalResponse = serializePublicSearchResponse(publicResponse);
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

    scheduleNoncriticalOperation(requestId, "logSearchEvent.failure", () =>
      logAnalytics({
        source: "public_create_search",
        route: "/api/generate",
        rawQuery: searchHealthRawQuery,
        performance: {
          route: "/api/generate",
          requestId,
          total_ms: now() - startedAt,
          speed_status: "failed",
        },
        success: false,
        hadIssue: true,
        issueType: "search_error",
        issueLabel: "Search route failed",
        metadata: {
          requestId,
          error: process.env.NODE_ENV === "development" ? message : "redacted",
        },
      }),
    );

    scheduleNoncriticalOperation(
      requestId,
      "logSearchHealthEvent.failure",
      () =>
        logHealth({
          source: "public_create_search",
          rawQuery: searchHealthRawQuery,
          result: emptySearchResponse("Search is having trouble right now."),
          errors: [message],
          timingMs: now() - startedAt,
          speedStatus: "failed",
        }),
    );

    const publicError = publicErrorFrom(error);
    return serializePublicSearchResponse(
      createPublicSearchResponse({
        requestId,
        status: publicError.status,
        payload: emptySearchResponse(publicError.message),
        error: {
          code: publicError.code,
          message: publicError.message,
          retryable: publicError.retryable,
        },
      }),
      { status: mapErrorToStatus(error) },
    );
  }
}
