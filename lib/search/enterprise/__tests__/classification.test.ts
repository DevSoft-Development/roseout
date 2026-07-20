import { describe, expect, it } from "vitest";
import type { EnterpriseLocation, SearchIntent } from "../types";
import { classifySearchLocation, evaluateCandidateEligibility } from "../classification";
import { filterResultsBySearchDomain } from "../../domainFilters";

const intent = {
  rawQuery: "fried chicken in Queens",
  searchType: "restaurant",
  primaryDomain: "restaurant",
  needsRestaurant: true,
  needsActivity: false,
  wantsPairing: false,
  restaurantIntent: { mealTerms: [], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  activityIntent: { activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  geo: { aliases: [], geoStrictness: "none" },
  vibe: [],
  strictness: "medium",
} as SearchIntent;

function loc(overrides: Partial<EnterpriseLocation>): EnterpriseLocation {
  return { id: overrides.id ?? "loc", name: "Test", is_searchable: true, active: true, ...overrides };
}

describe("canonical search classification", () => {
  it("honors administrator canonical type over conflicting description text", () => {
    const result = classifySearchLocation(loc({ canonical_search_type: "restaurant", location_type: "activity", description: "bowling arcade museum" } as any));
    expect(result.canonicalType).toBe("restaurant");
    expect(result.evidence).toContain("admin_canonical_search_type");
  });

  it("rejects activity-only records from restaurant recovery with machine-readable reasons", () => {
    const activity = loc({ id: "arcade", location_type: "activity", activity_type: "arcade", primary_category: "Arcade" });
    const debug: Record<string, any> = {};
    const filtered = filterResultsBySearchDomain({ restaurants: [activity], activities: [], intent, debug, lane: "restaurant_recovery" });
    expect(filtered.restaurants).toHaveLength(0);
    expect(debug.recoveryCandidatesEvaluated).toBe(1);
    expect(debug.recoveryRejectedWrongDomain).toBe(1);
    expect(debug.recovery.rejectionReasons.wrong_domain).toBe(1);
  });

  it("rejects restaurant-only records from activity recovery", () => {
    const restaurant = loc({ id: "food", location_type: "restaurant", restaurant_name: "Chicken House", cuisine: "fried chicken" });
    const result = evaluateCandidateEligibility({ location: restaurant, intent: { ...intent, primaryDomain: "activity", needsRestaurant: false, needsActivity: true }, expectedDomain: "activity", lane: "activity_recovery" });
    expect(result.eligible).toBe(false);
    expect(result.hardRejectReasons).toContain("wrong_domain");
  });

  it("excludes unsupported and unavailable records", () => {
    const closed = loc({ id: "closed", location_type: "restaurant", restaurant_name: "Closed Cafe", status: "closed" });
    const unsupported = loc({ id: "unsupported", location_type: "unsupported" });
    expect(evaluateCandidateEligibility({ location: closed, expectedDomain: "restaurant" }).hardRejectReasons).toContain("unavailable");
    expect(evaluateCandidateEligibility({ location: unsupported, expectedDomain: "restaurant" }).hardRejectReasons).toContain("unsupported_location_type");
  });
});
