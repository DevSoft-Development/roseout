import { describe, expect, it } from "vitest";
import { hasNightlifeIdentity, hasStrongActivityIdentity, hasStrongRestaurantIdentity, isFamilyUnsafeActivity, isGenericActivityEligible } from "../roles/domainIdentity";
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
  it("classifies nightlife separately from restaurant and activity identity", () => {
    const location = { id: "nightlife", location_type: "activity", activity_type: "nightlife", activity_name: "Taj Mahal Lounge", cuisine: "cafe", primary_category: "nightlife" } as any;
    expect(hasStrongRestaurantIdentity(location)).toBe(false);
    expect(hasNightlifeIdentity(location)).toBe(true);
    expect(hasStrongActivityIdentity(location)).toBe(false);
  });

  it("qualifies a generic family-safe activity from requested general activity role", () => {
    const candidates = [{ location: { id: "museum", location_type: "activity", activity_name: "Queens Museum", activity_type: "museum", primary_category: "museum" }, retrievalSources: ["enterprise_search_locations"], matchedRetrievalTerms: ["activity"], requestedRoles: ["general_activity"], distanceMiles: null }] as any;
    const result = assignCandidateRoles({ plan: basePlan, candidates });
    expect(result[0].roles.some((role) => role.role === "general_activity")).toBe(true);
  });

  it("keeps dining and nightlife venues out of the global generic activity lane", () => {
    expect(isGenericActivityEligible({ location_type: "restaurant", restaurant_name: "Dinner House", primary_category: "restaurant" } as any)).toBe(false);
    expect(isGenericActivityEligible({ location_type: "activity", activity_type: "nightlife", activity_name: "H Hookah Lounge", primary_category: "hookah lounge" } as any)).toBe(false);
    expect(isGenericActivityEligible({ location_type: "nightlife", activity_name: "Rooftop Lounge", primary_category: "rooftop bar" } as any)).toBe(false);
    expect(isGenericActivityEligible({ location_type: "activity", activity_name: "Monster Mini Golf", activity_type: "mini golf", primary_category: "mini golf" } as any)).toBe(true);
  });

  it("does not let a general-activity retrieval label override a dining-first venue", () => {
    const candidates = [{ location: { id: "hybrid", location_type: "restaurant", restaurant_name: "La Terraza Bar & Grill", activity_name: "La Terraza Bar & Grill", primary_category: "bar and grill" }, retrievalSources: ["enterprise_search_locations"], matchedRetrievalTerms: ["activity"], requestedRoles: ["general_activity"], distanceMiles: null }] as any;
    const result = assignCandidateRoles({ plan: { ...basePlan, audience: { familyFriendly: false, minorsPresent: false, adultOnlyRequested: false } } as any, candidates });
    expect(result.flatMap((item) => item.roles).some((role) => role.role === "general_activity")).toBe(false);
  });

  it("hard rejects adult-only activities for family searches", () => {
    expect(isFamilyUnsafeActivity({ activity_type: "nightclub", tags: ["21+"] } as any)).toBe(true);
  });
});
