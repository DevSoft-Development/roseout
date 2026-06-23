import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation, SearchDomain, SearchIntent } from "./types";
import {
  isExplicitMarket,
  isResultAllowedForResolvedMarket,
} from "../market-guardrails";
import {
  activityRpcTerms,
  activitySearchTermsOriginal,
  hasRelaxedActivityIntent,
  isBroadGenericActivityIntent,
  hasSpecificRestaurantFoodOrCuisine,
  pruneActivityRpcTerms,
  pruneRelaxedActivityTerms,
  pruneSportsWatchActivityTerms,
  restaurantSearchTerms,
  restaurantSearchTermsOriginal,
} from "./normalize-intent";
import {
  detectSingleVenueWithIntent,
  userAskedForPlaceOfWorship,
} from "./taxonomy";

type RpcDebug = {
  rpcTermsBeforeCap?: string[];
  rpcTermsAfterCap?: string[];
  rpcTermsRemovedForPerformance?: string[];
  rpcCalls: string[];
  // RPC-safe terms after deterministic pruning.
  restaurantRpcTerms?: string[];
  activityRpcTerms?: string[];
  restaurantRpcTermsOriginal?: string[];
  activityRpcTermsOriginal?: string[];
  restaurantRpcTermsPruned?: string[];
  activityRpcTermsPruned?: string[];
  relaxedActivityPruningApplied?: boolean;
  activityTermsRemovedForRelaxedIntent?: string[];
  relaxedActivityRpcSlimmingApplied?: boolean;
  activityTermsRemovedFromRpcForRelaxedIntent?: string[];
  activityRpcTermsRemovedForSportsWatchIntent?: string[];
  compactGenericActivityRpcApplied?: boolean;
  expandedGenericActivityRpcTerms?: string[];
  restaurantRpcCount?: number;
  activityRpcCount?: number;
  marketFallbackFilters?: Record<string, unknown>;
  marketFallbackRestaurantCount?: number;
  marketFallbackActivityCount?: number;
  restaurantRecoveryUsed?: boolean;
  restaurantRecoveryReason?: string | null;
  restaurantRecoveryTermsTried?: string[][];
  restaurantRecoveryAttemptResults?: {
    reason: string;
    terms: string[];
    resultCount: number;
    filteredCount: number;
    relaxedFood?: boolean;
    relaxedFeature?: boolean;
  }[];
  restaurantRecoveryRelaxedFood?: boolean;
  restaurantRecoveryRelaxedFeature?: boolean;
  restaurantRecoverySucceeded?: boolean;
  activityRecoveryUsed?: boolean;
  recoveryTerms?: string[];
  activityRecoveryReason?: string | null;
  activityRecoveryTermsTried?: string[][];
  neighborhoodRecoveryUsed?: boolean;
  neighborhoodRecoveryReason?: "strict_neighborhood_zero_results" | null;
  neighborhoodRecoveryFrom?: string | null;
  neighborhoodRecoveryTo?: string | null;
  neighborhoodRecoveryRadiusMiles?: number | null;
  neighborhoodRecoveryResultCount?: number;
  neighborhoodRecoveryTerms?: string[];
  neighborhoodRecoveryGeo?: object | null;
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  radiusMiles?: number | null;
  errors: string[];
};

export function mapRpcLocation(row: any): EnterpriseLocation {
  return {
    ...row,
    id: row?.id ?? null,
    latitude: row?.latitude == null ? null : Number(row.latitude),
    longitude: row?.longitude == null ? null : Number(row.longitude),
    distance_miles:
      row?.distance_miles == null ? null : Number(row.distance_miles),
  };
}

function explicitMarketForIntent(intent: SearchIntent): string | null {
  const market =
    (intent.geo as any)?.resolvedMarket ??
    (intent.geo as any)?.requestedMarket ??
    null;
  const explicit = (intent.geo as any)?.explicitMarketRequested !== false;
  return explicit && isExplicitMarket(market)
    ? String(market).toUpperCase()
    : null;
}

function stateForMarket(market: string) {
  if (market === "NORTHERN_NJ") return "NJ";
  return "NY";
}

function domainOrFilter(domain: SearchDomain) {
  if (domain === "restaurant") {
    return "restaurant_name.not.is.null,cuisine.not.is.null,cuisine_type.not.is.null,location_type.ilike.%restaurant%,primary_category.ilike.%restaurant%,primary_category.ilike.%dining%,primary_category.ilike.%cafe%,primary_category.ilike.%bakery%,primary_category.ilike.%bistro%,primary_category.ilike.%steakhouse%,primary_category.ilike.%bar and grill%,primary_category.ilike.%gastropub%";
  }

  if (domain === "activity") {
    return "activity_name.not.is.null,activity_type.not.is.null,location_type.ilike.%activity%,primary_category.ilike.%activity%,primary_category.ilike.%experience%,primary_category.ilike.%entertainment%,primary_category.ilike.%lounge%,primary_category.ilike.%hookah%,primary_category.ilike.%bowling%,primary_category.ilike.%museum%,primary_category.ilike.%theater%,primary_category.ilike.%theatre%,primary_category.ilike.%cinema%,primary_category.ilike.%arcade%,primary_category.ilike.%karaoke%,primary_category.ilike.%gallery%,primary_category.ilike.%park%,primary_category.ilike.%spa%";
  }

  return null;
}

async function searchExplicitMarketLaneFallback(
  supabase: SupabaseClient,
  intent: SearchIntent,
  domain: SearchDomain,
  limit: number,
  debug?: RpcDebug,
) {
  const market = explicitMarketForIntent(intent);
  if (!market) return [];

  const state = stateForMarket(market);
  const filters = { market, state, is_searchable: true, domain };
  if (debug) debug.marketFallbackFilters = filters;

  let query = supabase
    .from("locations")
    .select("*")
    .eq("market", market)
    .eq("state", state)
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .is("duplicate_of", null)
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("is_hidden", "is", true)
    .is("deleted_at", null)
    .not("status", "in", '("closed","archived","hidden","deleted")')
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .limit(limit);

  const domainFilter = domainOrFilter(domain);
  if (domainFilter) query = query.or(domainFilter);

  const { data, error } = await query;
  if (error) {
    addDebugError(debug, `explicit_market_fallback:${error.message}`);
    return [];
  }

  const rows = (data ?? [])
    .map(mapRpcLocation)
    .filter((row) => isResultAllowedForResolvedMarket(row, market));

  if (debug) {
    if (domain === "restaurant")
      debug.marketFallbackRestaurantCount = rows.length;
    if (domain === "activity") debug.marketFallbackActivityCount = rows.length;
  }

  return rows;
}

function mergeMarketFallbackRows(
  rows: EnterpriseLocation[],
  fallbackRows: EnterpriseLocation[],
) {
  if (!fallbackRows.length) return rows;
  const seen = new Set(rows.map((row) => row.id).filter(Boolean));
  return [
    ...rows,
    ...fallbackRows.filter((row) => {
      if (!row.id) return true;
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }),
  ];
}

const GENERIC_MEAL_RESTAURANT_TERMS = new Set([
  "dinner",
  "brunch",
  "lunch",
  "breakfast",
  "food",
  "restaurant",
]);

function maybeExpandGenericMealRestaurantTerms(
  intent: SearchIntent,
  domain: SearchDomain,
  terms: string[],
  debug?: RpcDebug,
) {
  if (
    domain !== "restaurant" ||
    !intent.wantsPairing ||
    !intent.needsActivity
  ) {
    return terms;
  }

  const normalized = uniqLowerRpcTerms(terms);
  const onlyGenericMeal =
    normalized.length > 0 &&
    normalized.every((term) => GENERIC_MEAL_RESTAURANT_TERMS.has(term));

  if (!onlyGenericMeal) {
    if (debug) {
      (debug as any).restaurantTermsExpandedForGenericMeal = false;
      (debug as any).restaurantTermsBeforeExpansion = normalized;
      (debug as any).restaurantTermsAfterExpansion = normalized;
    }
    return terms;
  }

  const expanded = uniqLowerRpcTerms([
    ...normalized,
    "restaurant",
    "dining",
    "food",
    "date night",
    "dinner",
  ]);
  if (debug) {
    (debug as any).restaurantTermsExpandedForGenericMeal = true;
    (debug as any).restaurantGenericMealExpansionReason =
      "mixed_outing_generic_meal_restaurant_lane";
    (debug as any).restaurantTermsBeforeExpansion = normalized;
    (debug as any).restaurantTermsAfterExpansion = expanded;
  }
  return expanded;
}

function termsFor(intent: SearchIntent, domain: SearchDomain) {
  return domain === "restaurant"
    ? restaurantSearchTerms(intent)
    : domain === "activity"
      ? activityRpcTerms(intent).terms
      : [...restaurantSearchTerms(intent), ...activityRpcTerms(intent).terms];
}

function originalTermsFor(intent: SearchIntent, domain: SearchDomain) {
  return domain === "restaurant"
    ? restaurantSearchTermsOriginal(intent)
    : domain === "activity"
      ? activitySearchTermsOriginal(intent)
      : [
          ...restaurantSearchTermsOriginal(intent),
          ...activitySearchTermsOriginal(intent),
        ];
}

function laneLimitFor(intent: SearchIntent, domain: SearchDomain) {
  if (domain === "restaurant") {
    if (intent.strictness === "high") {
      return hasSpecificRestaurantFoodOrCuisine(intent) ? 24 : 16;
    }

    return 40;
  }

  if (domain === "activity") {
    if (hasRelaxedActivityIntent(intent.rawQuery ?? "")) {
      return 16;
    }

    if (intent.strictness === "high") {
      return 24;
    }

    return 40;
  }

  return intent.strictness === "high" ? 24 : 40;
}

const WEAK_RPC_TERMS = new Set([
  "and",
  "to",
  "do",
  "with",
  "after",
  "before",
  "in",
  "near",
  "around",
  "night",
  "friday",
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "tonight",
  "tomorrow",
  "today",
  "this friday",
  "this weekend",
  "weekend",
]);

const SAME_VENUE_SECONDARY_SYNONYMS_FOR_RPC: Record<string, string[]> = {
  hookah: ["hookah", "shisha", "hookah lounge", "lounge"],
  shisha: ["hookah", "shisha", "hookah lounge", "lounge"],
  "live music": ["live music", "music", "jazz", "band", "dj", "performance"],
  jazz: ["live music", "music", "jazz", "band", "performance"],
  dj: ["dj", "live dj", "music", "dancing"],
  rooftop: [
    "rooftop",
    "roof top",
    "skyline",
    "rooftop views",
    "city views",
    "view",
    "views",
  ],
  "rooftop views": [
    "rooftop",
    "roof top",
    "skyline",
    "rooftop views",
    "city views",
    "view",
    "views",
  ],
  "outdoor seating": [
    "outdoor seating",
    "patio",
    "garden",
    "terrace",
    "sidewalk seating",
    "outdoor",
  ],
  patio: ["outdoor seating", "patio", "garden", "terrace", "outdoor"],
  "bottomless mimosas": [
    "bottomless",
    "mimosas",
    "bottomless mimosas",
    "brunch cocktails",
  ],
  cocktails: ["cocktails", "drinks", "bar", "mixology"],
  margaritas: ["margaritas", "cocktails", "drinks", "bar"],
  games: [
    "games",
    "arcade",
    "board games",
    "bowling",
    "darts",
    "pool table",
    "billiards",
  ],
  arcade: ["games", "arcade", "board games", "drinks"],
  bowling: ["bowling", "games", "arcade"],
  "private room": [
    "private room",
    "private rooms",
    "private dining",
    "event room",
    "group dining",
  ],
  "private rooms": [
    "private room",
    "private rooms",
    "private dining",
    "event room",
    "group dining",
  ],
  "late night": ["late night", "open late", "after hours"],
  "open late": ["late night", "open late", "after hours"],
};

function uniqLowerRpcTerms(terms: unknown[]) {
  return Array.from(
    new Set(
      terms
        .flat()
        .map((term) =>
          String(term ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

function buildBalancedSameVenueRestaurantTerms(
  intent: SearchIntent,
  sourceTerms: string[],
) {
  const singleVenue = detectSingleVenueWithIntent(intent.rawQuery);
  const sameVenuePreferred =
    Boolean((intent as any).sameVenuePreferred) || singleVenue.matched;
  if (!sameVenuePreferred) return null;
  const query = String(intent.rawQuery ?? "").toLowerCase();
  const connectorSplit = query.split(
    /\b(?:with|has|have|serving|serves|offering|offers|featuring|features|including|includes)\b/,
  );
  const afterWith = connectorSplit.slice(1).join(" ");
  const primaryFoodTerms = uniqLowerRpcTerms([
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.mealTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
    ...singleVenue.foodTerms,
    ...singleVenue.venueTerms,
    ...sourceTerms.filter((term) => query.includes(String(term).toLowerCase())),
  ]);
  const secondaryAttributeTerms = uniqLowerRpcTerms([
    ...((intent as any).secondaryAttributeTerms ?? []),
    ...singleVenue.featureTerms,
    ...Object.keys(SAME_VENUE_SECONDARY_SYNONYMS_FOR_RPC).filter((term) =>
      afterWith.includes(term),
    ),
  ]);
  const expandedSecondaryAttributeTerms = uniqLowerRpcTerms(
    secondaryAttributeTerms.flatMap(
      (term) => SAME_VENUE_SECONDARY_SYNONYMS_FOR_RPC[term] ?? [term],
    ),
  );
  if (!primaryFoodTerms.length || !expandedSecondaryAttributeTerms.length)
    return null;

  const normalizedSource = uniqLowerRpcTerms(sourceTerms);
  const explicitPrimary = primaryFoodTerms.filter((term) =>
    query.includes(term),
  );
  const explicitSecondary = secondaryAttributeTerms.filter((term) =>
    query.includes(term),
  );
  const strongSecondarySynonyms = expandedSecondaryAttributeTerms.filter(
    (term) => !explicitSecondary.includes(term),
  );
  const inferredPrimary = primaryFoodTerms.filter(
    (term) => !explicitPrimary.includes(term),
  );
  const genericMeal = normalizedSource.filter((term) =>
    ["dinner", "brunch", "lunch", "breakfast"].includes(term),
  );
  const balanced = uniqLowerRpcTerms([
    ...explicitPrimary,
    ...explicitSecondary,
    ...strongSecondarySynonyms,
    ...inferredPrimary,
    ...normalizedSource.filter(
      (term) =>
        ![
          ...genericMeal,
          ...explicitPrimary,
          ...explicitSecondary,
          ...strongSecondarySynonyms,
          ...inferredPrimary,
        ].includes(term),
    ),
    ...genericMeal,
  ]);

  return {
    terms: balanced,
    primaryFoodTerms,
    secondaryAttributeTerms,
    expandedSecondaryAttributeTerms,
  };
}

function capRpcTerms(
  terms: string[],
  domain: SearchDomain,
  recovery = false,
  preserve?: string[],
) {
  const max = recovery
    ? 10
    : domain === "restaurant"
      ? 12
      : domain === "activity"
        ? 14
        : 16;
  const normalized = Array.from(
    new Set(
      terms
        .map((term) =>
          String(term || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
  const required = Array.from(
    new Set(
      (preserve ?? [])
        .map((term) =>
          String(term || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
  const hasSpecific = normalized.some(
    (term) =>
      term.includes(" ") ||
      !["restaurant", "activity", "food", "dinner"].includes(term),
  );
  const kept = normalized
    .filter((term) => !WEAK_RPC_TERMS.has(term))
    .filter(
      (term) => !(hasSpecific && term === "activity" && domain === "activity"),
    )
    .filter(
      (term) =>
        !(hasSpecific && term === "restaurant" && domain === "restaurant"),
    )
    .sort(
      (a, b) =>
        Number(b.includes(" ")) - Number(a.includes(" ")) ||
        b.length - a.length,
    );
  const balancedKept = Array.from(
    new Set([...required.filter((term) => normalized.includes(term)), ...kept]),
  ).slice(0, max);
  const finalKept = balancedKept.length
    ? balancedKept
    : normalized.slice(0, max);
  return {
    terms: finalKept,
    removed: normalized.filter((term) => !finalKept.includes(term)),
  };
}

function params(
  intent: SearchIntent,
  domain: SearchDomain,
  limit: number,
  overrideTerms?: string[],
  debug?: RpcDebug,
) {
  const baseTerms = maybeExpandGenericMealRestaurantTerms(
    intent,
    domain,
    overrideTerms ?? termsFor(intent, domain),
    debug,
  );
  const balanced =
    !overrideTerms && domain === "restaurant"
      ? buildBalancedSameVenueRestaurantTerms(intent, baseTerms)
      : null;
  const sourceTerms = balanced?.terms ?? baseTerms;
  const preserve = balanced
    ? [
        balanced.primaryFoodTerms[0],
        balanced.secondaryAttributeTerms[0] ??
          balanced.expandedSecondaryAttributeTerms[0],
      ].filter(Boolean)
    : undefined;
  const capped = capRpcTerms(
    sourceTerms,
    domain,
    Boolean(overrideTerms),
    preserve,
  );
  const terms = capped.terms;
  const allowPlacesOfWorship = userAskedForPlaceOfWorship(intent.rawQuery);

  return {
    p_search_terms: terms.length ? terms : [intent.rawQuery],
    p_domain: domain,
    p_neighborhood: intent.geo.neighborhood ?? null,
    p_borough: intent.geo.borough ?? null,
    p_city: intent.geo.city ?? null,
    p_county: intent.geo.county ?? null,
    p_region: intent.geo.region ?? null,
    p_state: intent.geo.state ?? null,
    p_latitude: intent.geo.latitude ?? null,
    p_longitude: intent.geo.longitude ?? null,
    p_radius_miles: intent.geo.radiusMiles ?? null,
    p_limit: limit,
    p_allow_places_of_worship: allowPlacesOfWorship,
    __debug_before_terms: sourceTerms,
    __debug_removed_terms: capped.removed,
    __debug_same_venue_balanced: balanced,
  } as any;
}

function locationParams(
  intent: SearchIntent,
  domain: SearchDomain,
  limit: number,
  debug?: RpcDebug,
) {
  return {
    ...params(intent, domain, limit, undefined, debug),
    p_allow_low_level: false,
  };
}

function addDebugError(debug: RpcDebug | undefined, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  debug?.errors.push(message);
  return message;
}

export async function searchEnterpriseLane(
  supabase: SupabaseClient,
  intent: SearchIntent,
  domain: SearchDomain,
  debug?: RpcDebug,
) {
  try {
    const p = locationParams(
      intent,
      domain,
      laneLimitFor(intent, domain),
      debug,
    );

    debug?.rpcCalls.push(`enterprise_search_locations:${domain}`);

    if (domain === "restaurant" && debug) {
      debug.restaurantRpcTerms = p.p_search_terms;
      debug.restaurantRpcTermsOriginal = originalTermsFor(intent, domain);
      debug.restaurantRpcTermsPruned = p.p_search_terms;
      const balanced = (p as any).__debug_same_venue_balanced;
      if (balanced) {
        (debug as any).primaryFoodTerms = balanced.primaryFoodTerms;
        (debug as any).secondaryAttributeTerms =
          balanced.secondaryAttributeTerms;
        (debug as any).expandedSecondaryAttributeTerms =
          balanced.expandedSecondaryAttributeTerms;
        (debug as any).sameVenueBalancedTermsPreserved = true;
      }
    }

    if (domain === "activity" && debug) {
      const activityTermsOriginal = activitySearchTermsOriginal(intent);
      const activityTermsAfterHookah = pruneActivityRpcTerms(
        intent,
        activityTermsOriginal,
      );
      const activityTermsAfterSportsWatch = pruneSportsWatchActivityTerms(
        intent,
        activityTermsAfterHookah,
      );
      const activityTermsPruned = pruneRelaxedActivityTerms(
        intent,
        activityTermsAfterSportsWatch,
      );
      const rpcTerms = activityRpcTerms(intent);
      const prunedNormalized = new Set(
        activityTermsPruned.map((term) => term.toLowerCase()),
      );
      const relaxedActivityIntent = hasRelaxedActivityIntent(intent.rawQuery);

      debug.activityRpcTerms = p.p_search_terms;
      debug.activityRpcTermsOriginal = activityTermsOriginal;
      debug.activityRpcTermsPruned = rpcTerms.terms;
      debug.compactGenericActivityRpcApplied = Boolean(
        (rpcTerms as any).compactGenericActivityRpcApplied,
      );
      debug.expandedGenericActivityRpcTerms =
        (rpcTerms as any).expandedTerms ?? [];
      debug.activityRpcTermsRemovedForSportsWatchIntent =
        (rpcTerms as any).removedForSportsWatchIntent ?? [];
      debug.relaxedActivityPruningApplied = relaxedActivityIntent;
      debug.activityTermsRemovedForRelaxedIntent = relaxedActivityIntent
        ? activityTermsAfterHookah.filter(
            (term) => !prunedNormalized.has(term.toLowerCase()),
          )
        : [];
      debug.relaxedActivityRpcSlimmingApplied = relaxedActivityIntent;
      debug.activityTermsRemovedFromRpcForRelaxedIntent = relaxedActivityIntent
        ? rpcTerms.removedForRelaxedIntent
        : [];
    }

    if (debug) {
      debug.rpcTermsBeforeCap = (p as any).__debug_before_terms;
      debug.rpcTermsAfterCap = p.p_search_terms;
      debug.rpcTermsRemovedForPerformance =
        (p as any).__debug_removed_terms ?? [];
    }
    delete (p as any).__debug_before_terms;
    delete (p as any).__debug_removed_terms;
    delete (p as any).__debug_same_venue_balanced;

    const { data, error } = await supabase.rpc(
      "enterprise_search_locations",
      p,
    );

    if (error) {
      const message = addDebugError(debug, error.message);

      console.error("[enterprise_search_locations] RPC failed", {
        domain,
        message,
      });

      const fallbackRows = await searchExplicitMarketLaneFallback(
        supabase,
        intent,
        domain,
        laneLimitFor(intent, domain),
        debug,
      );
      if (fallbackRows.length) return fallbackRows;

      return [];
    }

    let rows = (data ?? []).map(mapRpcLocation);
    if (debug) (debug as any).sameVenueRecoveryResultCount = rows.length;
    const market = explicitMarketForIntent(intent);
    if (
      market &&
      rows.filter((row: EnterpriseLocation) =>
        isResultAllowedForResolvedMarket(row, market),
      ).length < Math.min(3, laneLimitFor(intent, domain))
    ) {
      rows = mergeMarketFallbackRows(
        rows,
        await searchExplicitMarketLaneFallback(
          supabase,
          intent,
          domain,
          laneLimitFor(intent, domain),
          debug,
        ),
      );
    }

    if (domain === "restaurant" && debug) {
      debug.restaurantRpcCount = rows.length;
    }

    if (domain === "activity" && debug) {
      debug.activityRpcCount = rows.length;
    }

    return rows;
  } catch (error) {
    const message = addDebugError(debug, error);

    console.error("[enterprise_search_locations] RPC crashed", {
      domain,
      message,
    });

    return [];
  }
}

export async function recoverEnterpriseLane(
  supabase: SupabaseClient,
  intent: SearchIntent,
  domain: SearchDomain,
  debug?: RpcDebug,
  overrideTerms?: string[],
) {
  try {
    const p = params(intent, domain, 80, overrideTerms, debug);

    debug?.rpcCalls.push(`enterprise_search_locations:recovery:${domain}`);

    if (debug) {
      debug.recoveryTerms = p.p_search_terms;
      (debug as any).sameVenueRecoveryFallbackUsed = true;
      (debug as any).sameVenueRecoverySkipped = false;
    }

    if (domain === "restaurant" && debug) {
      debug.restaurantRecoveryUsed = true;
    }

    if (domain === "activity" && debug) {
      debug.activityRecoveryUsed = true;
    }

    if (debug) {
      debug.rpcTermsBeforeCap = (p as any).__debug_before_terms;
      debug.rpcTermsAfterCap = p.p_search_terms;
      debug.rpcTermsRemovedForPerformance =
        (p as any).__debug_removed_terms ?? [];
    }
    delete (p as any).__debug_before_terms;
    delete (p as any).__debug_removed_terms;

    const { data, error } = await supabase.rpc(
      "enterprise_search_locations",
      p,
    );

    if (error) {
      const message = String(error.message ?? error);
      if (debug) {
        (debug as any).sameVenueRecoveryError = message;
        (debug as any).sameVenueRecoveryWarning =
          "same venue recovery skipped or failed; primary results returned";
      }

      console.warn("[enterprise_search_locations:recovery] RPC failed", {
        domain,
        message,
      });

      const fallbackRows = await searchExplicitMarketLaneFallback(
        supabase,
        intent,
        domain,
        80,
        debug,
      );
      if (fallbackRows.length) return fallbackRows;

      return [];
    }

    let rows = (data ?? []).map(mapRpcLocation);
    if (debug) (debug as any).sameVenueRecoveryResultCount = rows.length;
    const market = explicitMarketForIntent(intent);
    if (market) {
      rows = mergeMarketFallbackRows(
        rows,
        await searchExplicitMarketLaneFallback(
          supabase,
          intent,
          domain,
          80,
          debug,
        ),
      );
    }

    return rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (debug) {
      (debug as any).sameVenueRecoveryError = message;
      (debug as any).sameVenueRecoveryWarning =
        "same venue recovery skipped or failed; primary results returned";
    }

    console.warn("[enterprise_search_locations:recovery] RPC crashed", {
      domain,
      message,
    });

    return [];
  }
}

export function createRpcDebug(intent: SearchIntent): RpcDebug {
  return {
    rpcCalls: [],
    restaurantRecoveryUsed: false,
    restaurantRecoveryReason: null,
    restaurantRecoveryTermsTried: [],
    restaurantRecoveryAttemptResults: [],
    restaurantRecoveryRelaxedFood: false,
    restaurantRecoveryRelaxedFeature: false,
    restaurantRecoverySucceeded: false,
    activityRecoveryUsed: false,
    relaxedActivityPruningApplied: hasRelaxedActivityIntent(intent.rawQuery),
    activityTermsRemovedForRelaxedIntent: [],
    relaxedActivityRpcSlimmingApplied: hasRelaxedActivityIntent(
      intent.rawQuery,
    ),
    activityTermsRemovedFromRpcForRelaxedIntent: [],
    compactGenericActivityRpcApplied: isBroadGenericActivityIntent(intent),
    expandedGenericActivityRpcTerms: [],
    activityRecoveryReason: null,
    activityRecoveryTermsTried: [],
    neighborhoodRecoveryUsed: false,
    neighborhoodRecoveryReason: null,
    neighborhoodRecoveryFrom: null,
    neighborhoodRecoveryTo: null,
    neighborhoodRecoveryRadiusMiles: null,
    neighborhoodRecoveryResultCount: 0,
    neighborhoodRecoveryTerms: [],
    neighborhoodRecoveryGeo: null,
    geoLatitude: intent.geo.latitude ?? null,
    geoLongitude: intent.geo.longitude ?? null,
    radiusMiles: intent.geo.radiusMiles ?? null,
    errors: [],
  };
}
