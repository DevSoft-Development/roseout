import { beforeEach, describe, expect, it } from "vitest";
import { scoreCandidates } from "../scoreCandidates";

function plan(rawQuery: string, options: { activity?: boolean; foods?: string[] } = {}) {
  const activity = options.activity === true;
  return {
    version: "search-plan-v1",
    requestId: "occasion-eligibility-test",
    rawQuery,
    mode: activity ? "activity_only" : "restaurant_only",
    restaurant: {
      required: !activity,
      cuisines: [],
      foods: options.foods ?? [],
      mealPeriods: [],
      features: [],
      exclusions: [],
    },
    activity: {
      required: activity,
      categories: [],
      features: [],
      exclusions: [],
    },
    geo: {
      source: "explicit",
      market: "NYC_CORE",
      city: "New York",
      borough: "Queens",
      neighborhood: null,
      county: "Queens County",
      state: "NY",
      latitude: 40.7282,
      longitude: -73.7949,
      radiusMiles: 10,
      strictness: "strict",
    },
    anchor: {
      requested: false,
      rawName: null,
      locationId: null,
      name: null,
      latitude: null,
      longitude: null,
      entityType: "none",
      generic: false,
      exactNameRequired: false,
    },
    travel: {
      mode: "unspecified",
      constraint: "none",
      explicit: false,
      maxWalkingMinutes: null,
      maxDrivingMinutes: null,
    },
    pairing: {
      required: false,
      sameVenuePreferred: false,
      sameVenueRequired: false,
      sequence: null,
      maxDistanceMiles: null,
      maxWalkingMinutes: null,
      maxDrivingMinutes: null,
      requireWalkable: false,
    },
    audience: {
      familyFriendly: false,
      minorsPresent: false,
      adultOnlyRequested: false,
    },
    occasion: activity ? null : "date_night",
    partySize: null,
    plannedFor: null,
    fallback: {
      allowNearbyPair: true,
      allowPartial: true,
      allowBroaderGeo: true,
      maximumRadiusMiles: 45,
    },
    confidence: {
      overall: 0.95,
      mode: 0.95,
      restaurant: 0.95,
      activity: 0.95,
      geo: 0.95,
    },
    parser: { source: "deterministic", reasons: [] },
  } as any;
}

function candidate(location: Record<string, unknown>, role: "restaurant" | "general_activity") {
  return {
    candidate: {
      location,
      retrievalSources: [String(location.inventory_type) === "event" ? "enterprise_search_events" : "enterprise_search_locations"],
      matchedRetrievalTerms: [],
      requestedRoles: [role],
      distanceMiles: 1,
      geoMatch: {
        accepted: true,
        tier: "exact_locality",
        scopeLevel: "borough",
        reason: "exact_borough_match",
        distanceMiles: 1,
        requestedLocality: "Queens",
        candidateLocality: "Queens",
      },
      retrievalGeoLevel: "borough",
    },
    roles: [{ role, confidence: 0.95, evidence: [] }],
  } as any;
}

function restaurant(id: string, name: string, extra: Record<string, unknown> = {}) {
  return candidate({
    id,
    name,
    restaurant_name: name,
    location_type: "restaurant",
    primary_category: "restaurant",
    city: "Queens",
    borough: "Queens",
    state: "NY",
    quality_score: 90,
    popularity_score: 80,
    ...extra,
  }, "restaurant");
}

function activity(id: string, name: string, extra: Record<string, unknown> = {}) {
  return candidate({
    id,
    name,
    activity_name: name,
    location_type: "activity",
    primary_category: "activity",
    activity_type: "activity",
    city: "Queens",
    borough: "Queens",
    state: "NY",
    quality_score: 90,
    popularity_score: 80,
    ...extra,
  }, "general_activity");
}

describe("occasion-aware candidate eligibility", () => {
  beforeEach(() => {
    process.env.ML_ENABLED = "false";
  });

  it("removes Starbucks and bare pizza from a generic date-night restaurant lane", async () => {
    const scored = await scoreCandidates({
      plan: plan("date night in queens"),
      candidates: [
        restaurant("romantic", "Queens Bistro", {
          search_document: "full-service table service intimate restaurant with reservations and cocktails",
        }),
        restaurant("starbucks", "STARBUCKS"),
        restaurant("pizza", "NAPOLI PIZZA"),
        restaurant("full-pizza", "Luna Pizzeria", {
          search_document: "wood-fired pizza with full-service table service reservations intimate dining and wine",
        }),
      ],
    });

    const ids = scored.restaurants.map((item) => item.candidate.candidate.location.id);
    expect(ids).toContain("romantic");
    expect(ids).toContain("full-pizza");
    expect(ids).not.toContain("starbucks");
    expect(ids).not.toContain("pizza");
  });

  it("allows pizza when the user explicitly asks for a pizza date", async () => {
    const scored = await scoreCandidates({
      plan: plan("pizza date night in queens", { foods: ["pizza"] }),
      candidates: [
        restaurant("pizza", "NAPOLI PIZZA"),
        restaurant("other", "Queens Bistro", {
          search_document: "full-service intimate restaurant with reservations",
        }),
      ],
    });

    const ids = scored.restaurants.map((item) => item.candidate.candidate.location.id);
    expect(ids).toContain("pizza");
    expect(ids).not.toContain("other");
  });

  it("removes stadium and arena venue records from generic activity results", async () => {
    const scored = await scoreCandidates({
      plan: plan("date activities in queens", { activity: true }),
      candidates: [
        activity("stadium", "Forest Hills Stadium", { primary_category: "stadium", activity_type: "stadium" }),
        activity("arena", "Queens Arena", { primary_category: "arena", activity_type: "arena" }),
        activity("museum", "Queens Museum", { primary_category: "museum", activity_type: "museum" }),
      ],
    });

    const ids = scored.activities.map((item) => item.candidate.candidate.location.id);
    expect(ids).toEqual(["museum"]);
  });

  it("keeps a real canonical event even when its venue name contains Stadium", async () => {
    const scored = await scoreCandidates({
      plan: plan("things to do in queens", { activity: true }),
      candidates: [
        candidate({
          id: "event:concert-1",
          inventory_type: "event",
          location_type: "event",
          name: "Concert at Forest Hills Stadium",
          activity_name: "Concert at Forest Hills Stadium",
          activity_type: "event",
          primary_category: "event",
          city: "Queens",
          borough: "Queens",
          state: "NY",
          quality_score: 80,
          popularity_score: 80,
        }, "general_activity"),
      ],
    });

    expect(scored.activities).toHaveLength(1);
    expect(scored.activities[0].candidate.candidate.location.id).toBe("event:concert-1");
  });
});
