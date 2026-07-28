import { describe, expect, it } from "vitest";
import { hasStrongActivityIdentity, hasStrongRestaurantIdentity, isFamilyUnsafeActivity } from "../roles/domainIdentity";
import { assignCandidateRoles } from "../roles/assignCandidateRoles";
import type { SearchPlan } from "../planner/searchPlanTypes";

const basePlan = {
  version: "search-plan-v1", requestId: "test", rawQuery: "family-friendly activity with dinner afterward", mode: "paired_outing",
  restaurant: { required: true, cuisines: [], foods: [], mealPeriods: ["dinner"], features: [], exclusions: [] },
  activity: { required: true, categories: [], features: [], exclusions: [] },
  geo: { source: "explicit", market: "NYC", city: "Long Island City", borough: "Queens", neighborhood: "Long Island City", county: null, state: "NY", latitude: null, longitude: null, radiusMiles: 8, strictness: "strict" },
  anchor: { requested: false, rawName: null, locationId: null, name: null, latitude: null, longitude: null },
  pairing: { required: true, sameVenuePreferred: false, sameVenueRequired: false, sequence: "activity_first", maxDistanceMiles: 3, maxWalkingMinutes: null, requireWalkable: false },
  audience: { familyFriendly: true, minorsPresent: true, adultOnlyRequested: false }, occasion: "family_outing", partySize: null, plannedFor: null,
  fallback: { allowNearbyPair: true, allowPartial: true, allowBroaderGeo: true, maximumRadiusMiles: 45 },
  confidence: { overall: .9, mode: .9, restaurant: .9, activity: .9, geo: .9 }, parser: { source: "deterministic", reasons: [] },
} as unknown as SearchPlan;

describe("V2 domain, anchor and builder E2E contracts", () => {
  it("does not classify nightlife activity with cuisine metadata as a restaurant", () => {
    const location = { id: "nightlife", location_type: "activity", activity_type: "nightlife", activity_name: "Taj Mahal Lounge", cuisine: "cafe", primary_category: "nightlife" } as any;
    expect(hasStrongRestaurantIdentity(location)).toBe(false);
    expect(hasStrongActivityIdentity(location)).toBe(true);
  });

  it("qualifies a generic family-safe activity from requested general activity role", () => {
    const candidates = [{ location: { id: "museum", location_type: "activity", activity_name: "Queens Museum", activity_type: "museum", primary_category: "museum" }, retrievalSources: ["enterprise_search_locations"], matchedRetrievalTerms: ["activity"], requestedRoles: ["general_activity"], distanceMiles: null }] as any;
    const result = assignCandidateRoles({ plan: basePlan, candidates });
    expect(result[0].roles.some((role) => role.role === "general_activity")).toBe(true);
  });

  it("hard rejects adult-only activities for family searches", () => {
    expect(isFamilyUnsafeActivity({ activity_type: "nightclub", tags: ["21+"] } as any)).toBe(true);
  });
});
