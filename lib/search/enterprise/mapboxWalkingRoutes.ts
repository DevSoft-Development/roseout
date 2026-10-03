import type {
  SearchRouteMatrixEntry,
  SearchRoutingProvider,
} from "@/lib/search-framework";
import {
  createMapboxSearchRoutingProviderFromEnvironment,
} from "@/lib/search/routing/mapboxSearchRoutingProvider";
import {
  getEffectiveWalkingPairLimitMinutes,
  userAskedForWalking,
} from "./distance";
import type {
  EnterprisePair,
  PairingPreference,
} from "./types";

export type EnterpriseWalkingRouteEnrichment = {
  pairs: EnterprisePair[];
  providerConfigured: boolean;
  providerId: string | null;
  routeRequestAttempted: boolean;
  routeRequestFailed: boolean;
  verifiedPairCount: number;
  unreachablePairCount: number;
  rejectedOverLimitCount: number;
};

export async function enrichEnterprisePairsWithWalkingRoutes(
  pairs: readonly EnterprisePair[],
  preference: PairingPreference | null | undefined,
  routingProvider: SearchRoutingProvider | null =
    createMapboxSearchRoutingProviderFromEnvironment(),
): Promise<EnterpriseWalkingRouteEnrichment> {
  const walkingRequested = userAskedForWalking(preference);
  if (!walkingRequested || pairs.length === 0) {
    return {
      pairs: [...pairs],
      providerConfigured: Boolean(routingProvider),
      providerId: routingProvider?.providerId ?? null,
      routeRequestAttempted: false,
      routeRequestFailed: false,
      verifiedPairCount: 0,
      unreachablePairCount: 0,
      rejectedOverLimitCount: 0,
    };
  }

  if (!routingProvider) {
    return {
      pairs: [...pairs],
      providerConfigured: false,
      providerId: null,
      routeRequestAttempted: false,
      routeRequestFailed: false,
      verifiedPairCount: 0,
      unreachablePairCount: 0,
      rejectedOverLimitCount: 0,
    };
  }

  const origins = uniquePairPoints(
    pairs.map((pair) => ({
      id: String(pair.restaurant.id),
      latitude: pair.restaurant.latitude,
      longitude: pair.restaurant.longitude,
    })),
  );
  const destinations = uniquePairPoints(
    pairs.map((pair) => ({
      id: String(pair.activity.id),
      latitude: pair.activity.latitude,
      longitude: pair.activity.longitude,
    })),
  );

  if (!origins.length || !destinations.length) {
    return {
      pairs: preference?.requireWalkablePair ? [] : [...pairs],
      providerConfigured: true,
      providerId: routingProvider.providerId,
      routeRequestAttempted: false,
      routeRequestFailed: false,
      verifiedPairCount: 0,
      unreachablePairCount: pairs.length,
      rejectedOverLimitCount: 0,
    };
  }

  let matrix;
  try {
    matrix = await routingProvider.routeMatrix({
      mode: "walking",
      origins,
      destinations,
    });
  } catch {
    return {
      pairs: preference?.requireWalkablePair ? [] : pairs.map((pair) => ({
        ...pair,
        pairWarnings: [
          ...pair.pairWarnings,
          "walking_route_provider_unavailable",
        ],
      })),
      providerConfigured: true,
      providerId: routingProvider.providerId,
      routeRequestAttempted: true,
      routeRequestFailed: true,
      verifiedPairCount: 0,
      unreachablePairCount: 0,
      rejectedOverLimitCount: 0,
    };
  }

  const byKey = new Map<string, SearchRouteMatrixEntry>(
    matrix.entries.map((entry) => [
      routeKey(entry.originId, entry.destinationId),
      entry,
    ]),
  );
  const limitMinutes = getEffectiveWalkingPairLimitMinutes(preference);
  const requireVerified = preference?.requireWalkablePair === true;
  let verifiedPairCount = 0;
  let unreachablePairCount = 0;
  let rejectedOverLimitCount = 0;
  const enriched: EnterprisePair[] = [];

  for (const pair of pairs) {
    const key = routeKey(
      String(pair.restaurant.id),
      String(pair.activity.id),
    );
    const route = byKey.get(key);

    if (
      !route ||
      route.confidence !== "verified" ||
      route.durationMinutes == null ||
      route.distanceMiles == null
    ) {
      unreachablePairCount += 1;
      if (requireVerified) continue;
      enriched.push({
        ...pair,
        pairWarnings: [
          ...pair.pairWarnings,
          "walking_route_unverified",
        ],
      });
      continue;
    }

    if (
      limitMinutes != null &&
      route.durationMinutes > limitMinutes + 1e-9
    ) {
      rejectedOverLimitCount += 1;
      continue;
    }

    verifiedPairCount += 1;
    const roundedMinutes = Math.max(1, Math.round(route.durationMinutes));
    const roundedMiles = Number(route.distanceMiles.toFixed(2));
    enriched.push({
      ...pair,
      distance_miles: roundedMiles,
      pairDistanceMiles: roundedMiles,
      pairWalkingMinutes: roundedMinutes,
      routeDurationMinutes: route.durationMinutes,
      walking_route_minutes: route.durationMinutes,
      routeDistanceMiles: route.distanceMiles,
      walkingRouteSource: route.source,
      walkingRouteConfidence: "verified",
      isWalkable: true,
      pairDistanceLabel: `About a ${roundedMinutes}-minute walk`,
      pairWarnings: pair.pairWarnings.filter(
        (warning) =>
          warning !== "walking_minutes_estimated" &&
          warning !== "walking_route_unverified",
      ),
    });
  }

  return {
    pairs: enriched,
    providerConfigured: true,
    providerId: routingProvider.providerId,
    routeRequestAttempted: true,
    routeRequestFailed: false,
    verifiedPairCount,
    unreachablePairCount,
    rejectedOverLimitCount,
  };
}

function uniquePairPoints(
  values: Array<{
    id: string;
    latitude: unknown;
    longitude: unknown;
  }>,
) {
  const points = new Map<
    string,
    { id: string; latitude: number; longitude: number }
  >();

  for (const value of values) {
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    if (
      !value.id ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }
    points.set(value.id, {
      id: value.id,
      latitude,
      longitude,
    });
  }

  return [...points.values()];
}

function routeKey(originId: string, destinationId: string) {
  return `${originId}::${destinationId}`;
}
