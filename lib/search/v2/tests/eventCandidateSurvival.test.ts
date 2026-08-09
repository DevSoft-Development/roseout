import { beforeEach, describe, expect, it } from "vitest";
import { createSearchTrace } from "../observability/searchTrace";
import { scoreCandidates } from "../scoring/scoreCandidates";
import { resolveFallback } from "../fallback/resolveFallback";
import { buildPublicSearchResponse } from "../response/buildPublicSearchResponse";

function plan(rawQuery: string, mode: "activity_only" | "paired_outing" = "activity_only") {
  const paired = mode === "paired_outing";
  return {
    version: "search-plan-v1",
    requestId: `event-survival-${mode}`,
    rawQuery,
    mode,
    restaurant: {
      required: paired,
      cuisines: [],
      foods: [],
      mealPeriods: [],
      features: [],
      exclusions: [],
    },
    activity: {
      required: true,
      categories: [],
      features: [],
      exclusions: [],
    },
    geo: {
      source: "explicit",
      market: "NYC_CORE",
      city: "New York",
      borough: "Brooklyn",
      neighborhood: null,
      county: "Kings County",
      state: "NY",
      latitude: 40.6782,
      longitude: -73.9442,
      radiusMiles: 9,
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
      required: paired,
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
    occasion: null,
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
      restaurant: 0.9,
      activity: 0.95,
      geo: 0.95,
    },
    parser: {
      source: "deterministic",
      reasons: [],
    },
  } as any;
}

function activityCandidate(location: Record<string, unknown>) {
  return {
    candidate: {
      location,
      retrievalSources: [String(location.inventory_type) === "event" ? "enterprise_search_events" : "enterprise_search_locations"],
      matchedRetrievalTerms: [],
      requestedRoles: ["general_activity"],
      distanceMiles: null,
      geoMatch: {
        accepted: true,
        tier: "exact_locality",
        scopeLevel: "borough",
        reason: "exact_borough_match",
        distanceMiles: null,
        requestedLocality: "Brooklyn",
        candidateLocality: "Brooklyn",
      },
      retrievalGeoLevel: "borough",
    },
    roles: [{ role: "general_activity", confidence: 0.9, evidence: [] }],
  } as any;
}

function restaurantCandidate() {
  return {
    candidate: {
      location: {
        id: "restaurant-1",
        location_type: "restaurant",
        name: "Brooklyn Bistro",
        restaurant_name: "Brooklyn Bistro",
        primary_category: "restaurant",
        city: "New York",
        borough: "Brooklyn",
        state: "NY",
        quality_score: 90,
        popularity_score: 90,
      },
      retrievalSources: ["enterprise_search_locations"],
      matchedRetrievalTerms: [],
      requestedRoles: ["restaurant"],
      distanceMiles: null,
      geoMatch: {
        accepted: true,
        tier: "exact_locality",
        scopeLevel: "borough",
        reason: "exact_borough_match",
        distanceMiles: null,
        requestedLocality: "Brooklyn",
        candidateLocality: "Brooklyn",
      },
      retrievalGeoLevel: "borough",
    },
    roles: [{ role: "restaurant", confidence: 0.95, evidence: [] }],
  } as any;
}

const canonicalEvent = activityCandidate({
  id: "event:5f4f2b58-690e-4ee1-8f13-7f527122c80c",
  event_id: "5f4f2b58-690e-4ee1-8f13-7f527122c80c",
  inventory_type: "event",
  location_type: "event",
  type: "activity",
  name: "Brooklyn Weekend Festival",
  activity_name: "Brooklyn Weekend Festival",
  activity_type: "event",
  primary_category: "event",
  city: "New York",
  borough: "Brooklyn",
  state: "NY",
  public_url: "/events/5f4f2b58-690e-4ee1-8f13-7f527122c80c",
  event_starts_at: "2026-08-15T18:00:00Z",
  quality_score: 0,
  popularity_score: 0,
});

const staticActivity = activityCandidate({
  id: "activity-1",
  location_type: "activity",
  type: "activity",
  name: "Brooklyn Steel",
  activity_name: "Brooklyn Steel",
  activity_type: "music venue",
  primary_category: "music venue",
  city: "New York",
  borough: "Brooklyn",
  state: "NY",
  quality_score: 100,
  popularity_score: 100,
  rating: 5,
  review_count: 10000,
});

describe("canonical Event candidate survival", () => {
  beforeEach(() => {
    process.env.ML_ENABLED = "false";
  });

  it("prefers canonical Event inventory for an explicit Event request even when a static activity scores higher", async () => {
    const scored = await scoreCandidates({
      plan: plan("events this weekend in Brooklyn"),
      candidates: [staticActivity, canonicalEvent],
    });

    expect(scored.all[0].candidate.candidate.location.id).toBe("activity-1");
    expect(scored.activities).toHaveLength(1);
    expect(scored.activities[0].candidate.candidate.location.id).toBe("event:5f4f2b58-690e-4ee1-8f13-7f527122c80c");
  });

  it("falls back to static activities when an explicit Event request has no canonical Event inventory", async () => {
    const scored = await scoreCandidates({
      plan: plan("events this weekend in Brooklyn"),
      candidates: [staticActivity],
    });

    expect(scored.activities).toHaveLength(1);
    expect(scored.activities[0].candidate.candidate.location.id).toBe("activity-1");
  });

  it("preserves canonical Event metadata through fallback finalization and the public response", async () => {
    const searchPlan = plan("events this weekend in Brooklyn");
    const trace = createSearchTrace(searchPlan.requestId);
    const scored = await scoreCandidates({
      plan: searchPlan,
      candidates: [staticActivity, canonicalEvent],
      trace,
    });
    const resolved = await resolveFallback({
      plan: searchPlan,
      scored: { restaurants: scored.restaurants, activities: scored.activities },
      pairs: [],
      retrievedCount: 2,
      trace,
    });
    const response = buildPublicSearchResponse({ plan: searchPlan, result: resolved, trace });

    expect(response.activities).toHaveLength(1);
    expect(response.activities[0].id).toBe("event:5f4f2b58-690e-4ee1-8f13-7f527122c80c");
    expect(response.activities[0].inventory_type).toBe("event");
    expect(response.activities[0].location_type).toBe("event");
    expect(response.activities[0].public_url).toBe("/events/5f4f2b58-690e-4ee1-8f13-7f527122c80c");
  });

  it("keeps restaurant plus Event requests paired against canonical Event inventory when available", async () => {
    const scored = await scoreCandidates({
      plan: plan("restaurant then an event", "paired_outing"),
      candidates: [restaurantCandidate(), staticActivity, canonicalEvent],
    });

    expect(scored.restaurants).toHaveLength(1);
    expect(scored.activities).toHaveLength(1);
    expect(scored.activities[0].candidate.candidate.location.inventory_type).toBe("event");
  });

  it("does not force Event inventory for ordinary activity searches", async () => {
    const scored = await scoreCandidates({
      plan: plan("things to do tonight"),
      candidates: [staticActivity, canonicalEvent],
    });

    expect(scored.activities).toHaveLength(2);
  });
});
