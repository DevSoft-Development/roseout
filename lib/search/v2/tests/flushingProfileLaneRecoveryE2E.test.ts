import { describe, expect, it } from "vitest";
import { createSearchTrace } from "../observability/searchTrace";
import { buildPairs } from "../pairing/buildPairs";
import { retrieveCandidates } from "../retrieval/retrieveCandidates";

const FLUSHING_QUERIES = [
  "Halal restaurant and karaoke within a 20-minute walk in Flushing",
  "Halal dinner and karaoke within a 20-minute walk in Flushing",
] as const;

function plan(rawQuery: string) {
  return {
    version: "search-plan-v1",
    requestId: `flushing-${rawQuery.length}`,
    rawQuery,
    mode: "paired_outing",
    restaurant: {
      required: true,
      cuisines: ["halal"],
      foods: ["halal"],
      mealPeriods: rawQuery.includes("dinner") ? ["dinner"] : [],
      features: [],
      exclusions: [],
    },
    activity: {
      required: true,
      categories: ["karaoke"],
      features: [],
      exclusions: [],
    },
    geo: {
      source: "explicit",
      market: "NYC",
      city: "New York",
      borough: "Queens",
      neighborhood: "Flushing",
      county: "Queens County",
      state: "NY",
      latitude: 40.7675,
      longitude: -73.8331,
      radiusMiles: 3,
      strictness: "strict",
    },
    anchor: {
      requested: false,
      rawName: null,
      locationId: null,
      name: null,
      latitude: null,
      longitude: null,
    },
    travel: { mode: "walking", constraint: "hard", explicit: true },
    pairing: {
      required: true,
      sameVenuePreferred: false,
      sameVenueRequired: false,
      sequence: "restaurant_first",
      maxDistanceMiles: 1,
      maxWalkingMinutes: 20,
      requireWalkable: true,
    },
    audience: {
      familyFriendly: false,
      minorsPresent: false,
      adultOnlyRequested: false,
    },
    occasion: null,
    partySize: null,
    plannedFor: null,
    fallback: {
      allowNearbyPair: false,
      allowPartial: false,
      allowBroaderGeo: false,
      maximumRadiusMiles: 3,
    },
    confidence: {
      overall: 1,
      mode: 1,
      restaurant: 1,
      activity: 1,
      geo: 1,
    },
    parser: { source: "deterministic", reasons: ["flushing production regression"] },
  } as any;
}

function restaurantRow() {
  return {
    id: "flushing-halal-restaurant",
    name: "Flushing Zabiha Kitchen",
    restaurant_name: "Flushing Zabiha Kitchen",
    location_type: "restaurant",
    city: "New York",
    neighborhood: "Flushing",
    borough: "Queens",
    county: "Queens County",
    state: "NY",
    latitude: 40.7582,
    longitude: -73.8317,
    distance_miles: 0.65,
    cuisine: "zabiha halal",
    primary_category: "halal restaurant",
    search_document: "zabiha halal restaurant dinner",
  };
}

function karaokeRow() {
  return {
    id: "flushing-karaoke-activity",
    name: "Flushing KTV Rooms",
    activity_name: "Flushing KTV Rooms",
    location_type: "activity",
    city: "New York",
    neighborhood: "Flushing",
    borough: "Queens",
    county: "Queens County",
    state: "NY",
    latitude: 40.7592,
    longitude: -73.8298,
    distance_miles: 0.72,
    activity_type: "karaoke",
    primary_category: "ktv singing room",
    search_document: "karaoke ktv singing room sing-along private rooms",
  };
}

function fakeSupabase() {
  const calls: Array<{ rpc: string; params: Record<string, any> }> = [];
  return {
    calls,
    client: {
      rpc: async (rpc: string, params: Record<string, any>) => {
        calls.push({ rpc, params });
        if (rpc === "enterprise_search_profile_locations") {
          if (
            params.p_domain === "restaurant" &&
            Array.isArray(params.p_categories) &&
            params.p_categories.includes("zabiha")
          ) {
            return { data: [restaurantRow()], error: null };
          }
          return { data: [], error: null };
        }
        if (rpc === "enterprise_search_locations") {
          return params.p_domain === "activity"
            ? { data: [karaokeRow()], error: null }
            : { data: [], error: null };
        }
        return { data: [], error: null };
      },
    } as any,
  };
}

function scored(candidate: any) {
  return {
    candidate: { candidate },
    scores: { total: 90, quality: 90 },
  } as any;
}

describe("Flushing canonical profile lane recovery", () => {
  for (const query of FLUSHING_QUERIES) {
    it(`recovers only the missing lane for: ${query}`, async () => {
      const currentPlan = plan(query);
      const trace = createSearchTrace(currentPlan.requestId);
      const supabase = fakeSupabase();

      const retrieved = await retrieveCandidates({
        plan: currentPlan,
        supabase: supabase.client,
        trace,
        rolloutOverride: { mode: "primary", canaryPercent: 100 },
      });

      const predicateEvents = trace.decisions
        .filter((decision) => decision.stage === "profile_retrieval_predicates")
        .map((decision) => JSON.parse(decision.reason));
      const restaurantPredicates = predicateEvents.filter(
        (event) => event.domain === "restaurant",
      );
      const activityPredicates = predicateEvents.filter(
        (event) => event.domain === "activity",
      );

      expect(restaurantPredicates.length).toBeGreaterThan(0);
      expect(activityPredicates.length).toBeGreaterThan(0);
      expect(
        restaurantPredicates.some((event) =>
          event.predicates.p_categories.includes("zabiha"),
        ),
      ).toBe(true);
      expect(
        activityPredicates.some((event) =>
          ["karaoke", "ktv", "singing room", "sing-along"].every((term) =>
            event.predicates.p_categories.includes(term),
          ),
        ),
      ).toBe(true);

      const legacyCalls = supabase.calls.filter(
        (call) => call.rpc === "enterprise_search_locations",
      );
      expect(legacyCalls.length).toBeGreaterThan(0);
      expect(legacyCalls.every((call) => call.params.p_domain === "activity")).toBe(true);
      expect(trace.retrieval.fallbackDomains).toEqual(["activity"]);
      expect(trace.retrieval.servedSource).toBe("mixed");

      const recovery = trace.decisions.find(
        (decision) => decision.decision === "missing_profile_lane_legacy_recovery",
      );
      expect(recovery).toBeDefined();
      expect(JSON.parse(recovery!.reason)).toMatchObject({
        domain: "activity",
        requestedAreaRadiusMiles: 3,
        pairMaxWalkingMinutes: 20,
        pairMaxDistanceMiles: 1,
      });

      const restaurant = retrieved.candidates.find((candidate) =>
        candidate.requestedRoles.some((role) => role === "restaurant"),
      );
      const activity = retrieved.candidates.find((candidate) =>
        candidate.requestedRoles.some((role) => role === "activity"),
      );
      expect(restaurant).toBeDefined();
      expect(activity).toBeDefined();

      const pairs = await buildPairs({
        plan: currentPlan,
        restaurants: [scored(restaurant)],
        activities: [scored(activity)],
        trace,
      });
      expect(pairs).toHaveLength(1);
      expect(pairs[0].walkingMinutes).toBeLessThanOrEqual(20);
    });
  }
});
