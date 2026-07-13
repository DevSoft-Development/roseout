from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f"Expected block not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


page = "app/create/page.tsx"
replace_once(page, 'type DistancePreference = "walking" | "miles";', '''type AnchorLocationCard = (RestaurantCard | ActivityCard) & {
  location_type?: string | null;
  borough?: string | null;
};

type DistancePreference = "walking" | "miles";''')
replace_once(page, '''  matched_locations?: unknown[];
  distancePreference?: DistancePreference;''', '''  matched_locations?: unknown[];
  anchor_location?: AnchorLocationCard | null;
  search_context?: {
    mode?: string | null;
    heading?: string | null;
    anchor_position?: string | null;
  } | null;
  distancePreference?: DistancePreference;''')
replace_once(page, '''  matched_locations?: unknown[];
  display_mode?: string;''', '''  matched_locations?: unknown[];
  anchor_location?: AnchorLocationCard | null;
  search_context?: {
    mode?: string | null;
    heading?: string | null;
    anchor_position?: string | null;
  } | null;
  display_mode?: string;''')
replace_once(page, '''      const responseMatchedLocations = data.matched_locations || [];
      const normalizedCards = normalizeApiCards(data);''', '''      const responseMatchedLocations = data.matched_locations || [];
      const responseAnchorLocation = data.anchor_location
        ? (normalizePublicCardImage(data.anchor_location) as AnchorLocationCard)
        : null;
      const normalizedCards = normalizeApiCards(data);''')
replace_once(page, '''        matched_locations: responseMatchedLocations,
        pairingPreference,''', '''        matched_locations: responseMatchedLocations,
        anchor_location: responseAnchorLocation,
        search_context: data.search_context ?? null,
        pairingPreference,''')
replace_once(page, '''        assistantMessage.pairs?.length ||
        assistantMessage.matched_locations?.length;''', '''        assistantMessage.pairs?.length ||
        assistantMessage.matched_locations?.length ||
        Boolean(assistantMessage.anchor_location);''')
replace_once(page, '''            const matchedLocations = message.matched_locations || [];
            const hasCards =
              restaurants.length > 0 ||
              activities.length > 0 ||
              pairs.length > 0 ||
              matchedLocations.length > 0;''', '''            const matchedLocations = message.matched_locations || [];
            const anchorLocation = message.anchor_location ?? null;
            const anchorImage = anchorLocation
              ? getLocationImage(normalizePublicCardImage(anchorLocation))
              : null;
            const anchoredHeading = message.search_context?.heading?.trim() || null;
            const hasCards =
              restaurants.length > 0 ||
              activities.length > 0 ||
              pairs.length > 0 ||
              matchedLocations.length > 0 ||
              Boolean(anchorLocation);''')
replace_once(page, '''                    <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                      Tight matches for your outing
                    </h2>''', '''                    <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                      {anchoredHeading || "Tight matches for your outing"}
                    </h2>''')
replace_once(page, '''                </div>

                {resultOrder.map((sectionKind) => {''', '''                </div>

                {anchorLocation ? (
                  <div className="mb-5 overflow-hidden rounded-2xl border border-[#e1062a]/35 bg-gradient-to-br from-[#19070b] via-[#10090b] to-black shadow-lg shadow-black/30">
                    <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                      <div className="relative min-h-36 bg-white/5 sm:min-h-full">
                        {anchorImage ? (
                          <Image
                            src={anchorImage}
                            alt={getLocationName(anchorLocation)}
                            fill
                            sizes="(max-width: 640px) 100vw, 180px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full min-h-36 items-center justify-center text-4xl" aria-hidden="true">
                            📍
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                      </div>
                      <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
                          Searching near
                        </p>
                        <h3 className="mt-2 break-words text-2xl font-black tracking-[-0.035em] text-white sm:text-3xl">
                          {getLocationName(anchorLocation)}
                        </h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-white/55">
                          {formatAddress(anchorLocation)}
                        </p>
                        <p className="mt-3 text-sm font-semibold leading-6 text-white/70">
                          The recommendations below are measured from this location.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {resultOrder.map((sectionKind) => {''')

logger = "lib/search/enterprise/searchEventLogger.ts"
replace_once(logger, '''      metadata: cleanMetadata({ ...(args.metadata ?? {}), primary_intent: mlIntent.primaryIntent, secondary_intents: mlIntent.secondaryIntents, all_intents: mlIntent.allIntents, intent_confidence: mlIntent.confidence, inferred_search_mode: inferredSearchMode }),''', '''      metadata: cleanMetadata({
        ...(args.metadata ?? {}),
        primary_intent:
          args.metadata?.primary_intent ?? args.metadata?.primaryIntent ?? mlIntent.primaryIntent,
        secondary_intents:
          args.metadata?.secondary_intents ?? args.metadata?.secondaryIntents ?? mlIntent.secondaryIntents,
        all_intents:
          args.metadata?.all_intents ?? args.metadata?.allIntents ?? mlIntent.allIntents,
        intent_confidence:
          safeNumber(args.metadata?.intent_confidence ?? args.metadata?.intentConfidence) ??
          mlIntent.confidence,
        inferred_search_mode:
          args.metadata?.inferred_search_mode ??
          args.metadata?.inferredSearchMode ??
          inferredSearchMode,
      }),''')

route = "app/api/generate/route.ts"
replace_once(route, '''    const publicCards = Array.from(publicCardsByKey.values());

    const normalizeNestedPublicImages = (value: any): any => {''', '''    const publicCards = Array.from(publicCardsByKey.values());
    const publicAnchorLocation = result.anchor_location
      ? normalizeResultCard(result.anchor_location)
      : null;

    const normalizeNestedPublicImages = (value: any): any => {''')
replace_once(route, '''      geoSource: explicitMarketRequestedForGuardrail
        ? "typed_location"
        : currentLocationUserLocation
          ? "current_location"
          : ((result.debug as any)?.geoSource ?? "default_market"),''', '''      geoSource:
        (result.debug as any)?.geoSource ??
        (explicitMarketRequestedForGuardrail
          ? "typed_location"
          : currentLocationUserLocation
            ? "current_location"
            : "default_market"),''')
replace_once(route, '''      mlUnavailableReason:
        (result.debug as any)?.mlSearchDebug?.mlUnavailableReason ?? null,
    });''', '''      mlUnavailableReason:
        (result.debug as any)?.mlSearchDebug?.mlUnavailableReason ?? null,
      geoSource: (result.debug as any)?.geoSource ?? debugParity.geoSource,
      selectedSearchLane:
        (result.debug as any)?.selectedSearchLane ?? debugParity.selectedSearchLane,
      resolvedMarket:
        (result.debug as any)?.resolvedMarket ?? debugParity.resolvedMarket,
      distanceMode:
        (result.debug as any)?.distanceMode ?? debugParity.distanceMode,
      intentParserSource:
        (result.debug as any)?.intentParserSource ?? debugParity.intentParserSource,
      primaryIntent:
        (result.debug as any)?.primaryIntent ?? debugParity.primaryIntent,
      intentConfidence:
        (result.debug as any)?.intentConfidence ?? debugParity.intentConfidence,
    });''')
replace_once(route, '''      matchedLocations: publicMatchedLocations,
      cards: publicCards,
      pairs: publicPairs,''', '''      matchedLocations: publicMatchedLocations,
      anchor_location: publicAnchorLocation,
      search_context: result.search_context ?? null,
      cards: publicCards,
      pairs: publicPairs,''')
replace_once(route, '''              routeDebug: {
                ...((result.debug as any)?.routeDebug || {}),
                selectedSearchLane,
              },
              selectedSearchLane,''', '''              routeDebug: {
                ...((result.debug as any)?.routeDebug || {}),
                selectedSearchLane:
                  (result.debug as any)?.selectedSearchLane ?? selectedSearchLane,
              },
              selectedSearchLane:
                (result.debug as any)?.selectedSearchLane ?? selectedSearchLane,''')
replace_once(route, '''        intentParserSource: resolvedIntentParserSource,
        selectedSearchLane,
        ...nearMeDebug,
        geoSource: debug?.geoSource,''', '''        intentParserSource: resolvedIntentParserSource,
        selectedSearchLane: debug?.selectedSearchLane ?? selectedSearchLane,
        primary_intent: debug?.primaryIntent ?? debug?.primary_intent,
        intent_confidence: debug?.intentConfidence ?? debug?.intent_confidence,
        all_intents: debug?.allIntents ?? debug?.all_intents,
        inferred_search_mode: debug?.primaryIntent ?? debug?.primary_intent,
        speedStatus: debug?.performance?.speed_status ?? debug?.speedStatus ?? null,
        ...nearMeDebug,
        geoSource: debug?.geoSource ?? marketFiltering.geoSource,''')

run_search = "lib/search/runSearch.ts"
replace_once(run_search, '''type AnchoredResultWithCards = EnterpriseSearchResult & {
  cards?: EnterpriseLocation[];
};''', '''type AnchoredResultWithCards = EnterpriseSearchResult & {
  cards?: EnterpriseLocation[];
  anchor_location?: EnterpriseLocation | null;
  search_context?: Record<string, any> | null;
};

function anchoredSpeedStatus(totalMs: number) {
  if (totalMs < 1500) return "fast";
  if (totalMs < 3000) return "acceptable";
  if (totalMs < 5000) return "slow";
  return "critical";
}''')
replace_once(run_search, '''  displayLimit: number,
): EnterpriseSearchResult {''', '''  displayLimit: number,
  totalMs: number,
): EnterpriseSearchResult {''')
replace_once(run_search, '''  if (anchored.activities.length > displayLimit) {
    anchored.activities = anchored.activities.slice(0, displayLimit);
    anchored.cards = anchored.activities;
    anchored.card_counts.activities = anchored.activities.length;
  }

  return anchored;''', '''  if (anchored.activities.length > displayLimit) {
    anchored.activities = anchored.activities.slice(0, displayLimit);
    anchored.cards = anchored.activities;
    anchored.card_counts.activities = anchored.activities.length;
  }

  const anchor = anchored.anchor_location;
  const requestedDomain = anchored.restaurants.length > 0 ? "restaurant" : "activity";
  const intentName = `anchored_nearby_${requestedDomain}`;
  const resolvedMarket =
    (typeof anchor?.market === "string" && anchor.market) ||
    (anchored.debug as any)?.resolvedMarket ||
    null;
  const maxDistanceMiles =
    Number((anchored.search_context as any)?.max_distance_miles) ||
    Number((anchored.debug as any)?.maxAnchorDistanceMiles) ||
    null;
  const anchorConfidence = Number((anchored.debug as any)?.anchorConfidence);
  const speedStatus = anchoredSpeedStatus(totalMs);

  anchored.debug = {
    ...(anchored.debug ?? {}),
    intentParserSource: "named_location_anchor",
    intent_parser_source: "named_location_anchor",
    primaryIntent: intentName,
    primary_intent: intentName,
    intentConfidence: Number.isFinite(anchorConfidence) ? anchorConfidence : 1,
    intent_confidence: Number.isFinite(anchorConfidence) ? anchorConfidence : 1,
    allIntents: [intentName],
    all_intents: [intentName],
    selectedSearchLane: `anchored_${requestedDomain}`,
    selected_search_lane: `anchored_${requestedDomain}`,
    geoSource: "named_location_anchor",
    geo_source: "named_location_anchor",
    resolvedMarket,
    resolved_market: resolvedMarket,
    distanceMode: "anchor_radius",
    distance_mode: "anchor_radius",
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "anchor_radius",
      maxPairDistanceMiles: maxDistanceMiles,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
    performance: {
      ...((anchored.debug as any)?.performance ?? {}),
      route: "/api/generate",
      total_ms: totalMs,
      result_count: anchored.restaurants.length + anchored.activities.length,
      speed_status: speedStatus,
    },
    speedStatus,
  };

  return anchored;''')
replace_once(run_search, '''  const displayLimit = Math.max(1, input.displayLimit ?? 12);
  const anchored = await runAnchoredNearbySearch({''', '''  const displayLimit = Math.max(1, input.displayLimit ?? 12);
  const anchoredStartedAt = Date.now();
  const anchored = await runAnchoredNearbySearch({''')
replace_once(run_search, '''  if (anchored) {
    return finalizeAnchoredResult(anchored, query, displayLimit);
  }''', '''  if (anchored) {
    return finalizeAnchoredResult(
      anchored,
      query,
      displayLimit,
      Date.now() - anchoredStartedAt,
    );
  }''')
