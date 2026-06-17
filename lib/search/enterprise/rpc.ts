import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation, SearchDomain, SearchIntent } from "./types";
import {
  activityRpcTerms,
  activitySearchTerms,
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
import { userAskedForPlaceOfWorship } from "./taxonomy";

type RestaurantRpcCacheEntry = { expiresAt: number; rows: EnterpriseLocation[] };
const restaurantRpcCache = new Map<string, RestaurantRpcCacheEntry>();

function restaurantRpcCacheKey(intent: SearchIntent, terms: string[]) {
  return `restaurant-search:v2:${String(intent.rawQuery || "").trim().toLowerCase()}:${intent.geo.latitude ?? ""}:${intent.geo.longitude ?? ""}:${intent.geo.radiusMiles ?? ""}:${terms.join("|")}`;
}

type RpcDebug = {
  rpcCalls: string[];
  // RPC-safe terms after deterministic pruning.
  restaurantRpcTerms?: string[];
  activityRpcTerms?: string[];
  restaurantRpcTermsOriginal?: string[];
  activityRpcTermsOriginal?: string[];
  restaurantRpcTermsPruned?: string[];
  activityRpcTermsPruned?: string[];
  restaurantRpcTimedOut?: boolean;
  restaurantRpcTimeoutMs?: number;
  restaurantRpcFallbackUsed?: boolean;
  restaurantRpcFallbackReason?: string | null;
  relaxedActivityPruningApplied?: boolean;
  activityTermsRemovedForRelaxedIntent?: string[];
  relaxedActivityRpcSlimmingApplied?: boolean;
  activityTermsRemovedFromRpcForRelaxedIntent?: string[];
  activityRpcTermsRemovedForSportsWatchIntent?: string[];
  compactGenericActivityRpcApplied?: boolean;
  expandedGenericActivityRpcTerms?: string[];
  restaurantRpcCount?: number;
  activityRpcCount?: number;
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
      : [...restaurantSearchTermsOriginal(intent), ...activitySearchTermsOriginal(intent)];
}

function compactRestaurantRpcTerms(intent: SearchIntent) {
  const foodTerms = intent?.restaurantIntent?.foodTerms || [];
  const cuisineTerms = intent?.restaurantIntent?.cuisineTerms || [];
  const featureTerms = intent?.restaurantIntent?.featureTerms || [];
  const categoryTerms = intent?.restaurantIntent?.categoryTerms || [];
  const preferredFood = [...cuisineTerms, ...foodTerms].filter(Boolean);
  const preferredFeatures = featureTerms.filter((term: string) =>
    ["rooftop", "terrace", "outdoor dining", "skyline", "views", "roof deck", "outdoor seating"].includes(term.toLowerCase()),
  );
  const compact = [...preferredFood.slice(0, 4), ...preferredFeatures.slice(0, 4), ...categoryTerms.slice(0, 1)];
  return Array.from(new Set(compact.map((term) => String(term).toLowerCase()))).slice(0, 8);
}

function laneLimitFor(intent: SearchIntent, domain: SearchDomain) {
  if (domain === "restaurant") {
    return intent.strictness === "high" ? (hasSpecificRestaurantFoodOrCuisine(intent) ? 18 : 16) : 18;
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

function params(intent: SearchIntent, domain: SearchDomain, limit: number, overrideTerms?: string[]) {
  const terms = overrideTerms ?? (domain === "restaurant" ? compactRestaurantRpcTerms(intent) : termsFor(intent, domain));
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
  };
}

function locationParams(intent: SearchIntent, domain: SearchDomain, limit: number) {
  return {
    ...params(intent, domain, limit),
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
    const p = locationParams(intent, domain, laneLimitFor(intent, domain));

    debug?.rpcCalls.push(`enterprise_search_locations:${domain}`);

    const cacheKey = domain === "restaurant" ? restaurantRpcCacheKey(intent, p.p_search_terms) : null;
    if (cacheKey) {
      const cached = restaurantRpcCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (debug) {
          debug.restaurantRpcTerms = p.p_search_terms;
          debug.restaurantRpcTermsOriginal = originalTermsFor(intent, domain);
          debug.restaurantRpcTermsPruned = p.p_search_terms;
          debug.restaurantRpcCount = cached.rows.length;
          (debug as any).restaurantRpcCacheHit = true;
        }
        return cached.rows;
      }
    }

    if (domain === "restaurant" && debug) {
      debug.restaurantRpcTerms = p.p_search_terms;
      debug.restaurantRpcTermsOriginal = originalTermsFor(intent, domain);
      debug.restaurantRpcTermsPruned = p.p_search_terms;
    }

    if (domain === "activity" && debug) {
      const activityTermsOriginal = activitySearchTermsOriginal(intent);
      const activityTermsAfterHookah = pruneActivityRpcTerms(intent, activityTermsOriginal);
      const activityTermsAfterSportsWatch = pruneSportsWatchActivityTerms(intent, activityTermsAfterHookah);
      const activityTermsPruned = pruneRelaxedActivityTerms(intent, activityTermsAfterSportsWatch);
      const rpcTerms = activityRpcTerms(intent);
      const prunedNormalized = new Set(activityTermsPruned.map((term) => term.toLowerCase()));
      const relaxedActivityIntent = hasRelaxedActivityIntent(intent.rawQuery);

      debug.activityRpcTerms = p.p_search_terms;
      debug.activityRpcTermsOriginal = activityTermsOriginal;
      debug.activityRpcTermsPruned = rpcTerms.terms;
      debug.compactGenericActivityRpcApplied = Boolean((rpcTerms as any).compactGenericActivityRpcApplied);
      debug.expandedGenericActivityRpcTerms = (rpcTerms as any).expandedTerms ?? [];
      debug.activityRpcTermsRemovedForSportsWatchIntent = (rpcTerms as any).removedForSportsWatchIntent ?? [];
      debug.relaxedActivityPruningApplied = relaxedActivityIntent;
      debug.activityTermsRemovedForRelaxedIntent = relaxedActivityIntent
        ? activityTermsAfterHookah.filter((term) => !prunedNormalized.has(term.toLowerCase()))
        : [];
      debug.relaxedActivityRpcSlimmingApplied = relaxedActivityIntent;
      debug.activityTermsRemovedFromRpcForRelaxedIntent = relaxedActivityIntent
        ? rpcTerms.removedForRelaxedIntent
        : [];
    }

    const timeoutMs = domain === "restaurant" ? 3500 : 10000;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC_TIMEOUT_${timeoutMs}`)), timeoutMs),
    );
    const { data, error } = await Promise.race([supabase.rpc("enterprise_search_locations", p), timeout]);

    if (error) {
      const message = addDebugError(debug, error.message);

      console.error("[enterprise_search_locations] RPC failed", {
        domain,
        message,
      });

      return [];
    }

    const rows = (data ?? []).map(mapRpcLocation);
    if (cacheKey && !error) {
      restaurantRpcCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, rows });
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
    if (domain === "restaurant" && message.includes("RPC_TIMEOUT")) {
      if (debug) {
        debug.restaurantRpcTimedOut = true;
        debug.restaurantRpcTimeoutMs = 3500;
        debug.restaurantRpcFallbackUsed = true;
        debug.restaurantRpcFallbackReason = "restaurant_rpc_timeout";
        debug.restaurantRpcCount = 0;
      }
      return [];
    }

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
    const p = params(intent, domain, domain === "restaurant" ? 12 : 80, overrideTerms);

    debug?.rpcCalls.push(`enterprise_search_recovery:${domain}`);

    if (debug) {
      debug.recoveryTerms = p.p_search_terms;
    }

    if (domain === "restaurant" && debug) {
      debug.restaurantRecoveryUsed = true;
    }

    if (domain === "activity" && debug) {
      debug.activityRecoveryUsed = true;
    }

    const { data, error } = await supabase.rpc("enterprise_search_recovery", p);

    if (error) {
      const message = addDebugError(debug, error.message);

      console.error("[enterprise_search_recovery] RPC failed", {
        domain,
        message,
      });

      return [];
    }

    return (data ?? []).map(mapRpcLocation);
  } catch (error) {
    const message = addDebugError(debug, error);

    console.error("[enterprise_search_recovery] RPC crashed", {
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
    restaurantRpcTimedOut: false,
    restaurantRpcTimeoutMs: 3500,
    restaurantRpcFallbackUsed: false,
    restaurantRpcFallbackReason: null,
    activityRecoveryUsed: false,
    relaxedActivityPruningApplied: hasRelaxedActivityIntent(intent.rawQuery),
    activityTermsRemovedForRelaxedIntent: [],
    relaxedActivityRpcSlimmingApplied: hasRelaxedActivityIntent(intent.rawQuery),
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
