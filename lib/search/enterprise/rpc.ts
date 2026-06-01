import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation, SearchDomain, SearchIntent } from "./types";
import { activitySearchTerms, restaurantSearchTerms } from "./normalize-intent";
import { userAskedForPlaceOfWorship } from "./taxonomy";

type RpcDebug = {
  rpcCalls: string[];
  restaurantRpcTerms?: string[];
  activityRpcTerms?: string[];
  restaurantRpcCount?: number;
  activityRpcCount?: number;
  restaurantRecoveryUsed?: boolean;
  activityRecoveryUsed?: boolean;
  recoveryTerms?: string[];
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
      ? activitySearchTerms(intent)
      : [...restaurantSearchTerms(intent), ...activitySearchTerms(intent)];
}

function params(intent: SearchIntent, domain: SearchDomain, limit: number) {
  const terms = termsFor(intent, domain);
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
    const p = params(intent, domain, 40);

    debug?.rpcCalls.push(`enterprise_search_locations:${domain}`);

    if (domain === "restaurant" && debug) {
      debug.restaurantRpcTerms = p.p_search_terms;
    }

    if (domain === "activity" && debug) {
      debug.activityRpcTerms = p.p_search_terms;
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
) {
  try {
    const p = params(intent, domain, 80);

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
    geoLatitude: intent.geo.latitude ?? null,
    geoLongitude: intent.geo.longitude ?? null,
    radiusMiles: intent.geo.radiusMiles ?? null,
    errors: [],
  };
}
