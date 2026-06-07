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

type RpcDebug = {
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
  restaurantRecoveryUsed?: boolean;
  activityRecoveryUsed?: boolean;
  recoveryTerms?: string[];
  activityRecoveryReason?: string | null;
  activityRecoveryTermsTried?: string[][];
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

function params(intent: SearchIntent, domain: SearchDomain, limit: number, overrideTerms?: string[]) {
  const terms = overrideTerms ?? termsFor(intent, domain);
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

    const { data, error } = await supabase.rpc("enterprise_search_locations", p);

    if (error) {
      const message = addDebugError(debug, error.message);

      console.error("[enterprise_search_locations] RPC failed", {
        domain,
        message,
      });

      return [];
    }

    const rows = (data ?? []).map(mapRpcLocation);

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
    const p = params(intent, domain, 80, overrideTerms);

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
    activityRecoveryUsed: false,
    relaxedActivityPruningApplied: hasRelaxedActivityIntent(intent.rawQuery),
    activityTermsRemovedForRelaxedIntent: [],
    relaxedActivityRpcSlimmingApplied: hasRelaxedActivityIntent(intent.rawQuery),
    activityTermsRemovedFromRpcForRelaxedIntent: [],
    compactGenericActivityRpcApplied: isBroadGenericActivityIntent(intent),
    expandedGenericActivityRpcTerms: [],
    activityRecoveryReason: null,
    activityRecoveryTermsTried: [],
    geoLatitude: intent.geo.latitude ?? null,
    geoLongitude: intent.geo.longitude ?? null,
    radiusMiles: intent.geo.radiusMiles ?? null,
    errors: [],
  };
}
