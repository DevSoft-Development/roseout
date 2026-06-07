import { firstImage, getLocationImage } from "@/lib/locationImage";
import { isEdgeCreateSearchEnabled, runCreateSearchWithEdgeFallback } from "@/lib/search/createSearch";
import { runEnterpriseSearch } from "@/lib/search/enterprise";
import { logSearchEvent } from "@/lib/search/enterprise/searchEventLogger";
import { logSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";
import { parsePlannedTimeFromQuery } from "@/lib/outings/parse-planned-time";
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
    image_url: usableImage,
    main_image: usableImage,
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


    const betaAssignmentId = body?.betaAssignmentId || body?.beta_assignment_id || new URL(request.url).searchParams.get("betaAssignmentId") || request.headers.get("x-beta-assignment-id");
    const betaTesterId = body?.betaTesterId || body?.beta_tester_id || request.headers.get("x-beta-tester-id");
    const usedCustomPrompt = body?.usedCustomPrompt === true || body?.usedCustomPrompt === "true" || new URL(request.url).searchParams.get("usedCustomPrompt") === "true" || request.headers.get("x-used-custom-prompt") === "true";
    const betaDebug = process.env.NODE_ENV !== "production" || Boolean(betaAssignmentId || betaTesterId || body?.betaDebug);
    const betaFeedbackSubmitted = Boolean(betaTesterId && (body?.feedbackSubmitted === true || body?.feedback_submitted === true || body?.feedback || body?.feedback_type || body?.expected_result || body?.actual_result || body?.rating));
    const legacySearch = () => runEnterpriseSearch(cleanInput, {
      body,
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

    const result: any = await runCreateSearchWithEdgeFallback(
      {
        ...body,
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

    const cards = [
      ...(result.restaurants || []),
      ...(result.activities || []),
      ...(result.matched_locations || []),
    ]
      .map(toCardRecord)
      .filter((card) => firstImage(card.main_image) || firstImage(card.image_url));

    const response = {
      ...result,
      plannedTime,
      cards,
      render_mode: result.render_mode === "empty" ? "empty" : result.render_mode,
      renderMode: result.renderMode || result.render_mode,
      searchPerformance: betaDebug && (result.debug as any)?.performance ? { totalMs: (result.debug as any).performance.total_ms, speedStatus: (result.debug as any).performance.speed_status, resultCount: (result.debug as any).performance.result_count } : undefined,
      debug: betaDebug ? { ...(result.debug || {}), plannedTime } : undefined,
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

    const debug = (result.debug as any) ?? {};
    const normalizedIntent =
      debug.normalizedIntent ?? debug.intent ?? result.normalizedIntent ?? null;
    const counts = debug.counts ?? {
      restaurants: result.restaurants?.length ?? 0,
      activities: result.activities?.length ?? 0,
      pairs: result.pairs?.length ?? 0,
      finalDisplayedResultCount:
        result.matched_locations?.length ??
        result.matchedLocations?.length ??
        result.cards?.length ??
        0,
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
          (result.restaurants?.length || 0) +
          (result.activities?.length || 0) +
          (result.matched_locations?.length || 0),
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
