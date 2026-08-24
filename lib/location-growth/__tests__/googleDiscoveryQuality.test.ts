import { describe, expect, it } from "vitest";
import { evaluateGoogleDiscoveryCandidate } from "@/lib/location-growth/googleDiscoveryQuality";

function candidate(overrides: Partial<Parameters<typeof evaluateGoogleDiscoveryCandidate>[0]> = {}) {
  return {
    kind: "restaurant" as const,
    name: "Independent Restaurant",
    query: "date night restaurant in Manhattan",
    category: "date_night",
    rating: 4.6,
    reviewCount: 500,
    types: ["restaurant", "food", "point_of_interest"],
    editorialSummary: null,
    hasPhoto: true,
    hasPhone: true,
    hasWebsite: true,
    hasHours: true,
    hasLocation: true,
    ...overrides,
  };
}

describe("curated Google discovery quality", () => {
  it("rejects missing Google reputation instead of letting zero values bypass the gate", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({ rating: 0, reviewCount: 0 }));
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("missing_rating");
    expect(result.reasons).toContain("missing_reviews");
  });

  it("rejects known chains even when their Google rating is strong", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      name: "Wingstop",
      rating: 4.8,
      reviewCount: 2400,
      types: ["fast_food_restaurant", "restaurant", "meal_takeaway"],
    }));
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("chain_or_qsr");
  });

  it("rejects quick-service style candidates that are not on the chain list", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      name: "Local Hot Wings & Pizza Inc",
      rating: 4.8,
      reviewCount: 650,
      types: ["pizza_restaurant", "meal_takeaway", "restaurant"],
    }));
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("quick_service");
  });

  it("auto-imports a strong destination restaurant", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      name: "Skyline Dining Room",
      query: "rooftop restaurant in Manhattan",
      category: "rooftop",
      rating: 4.7,
      reviewCount: 1800,
      types: ["restaurant", "fine_dining_restaurant", "cocktail_bar", "event_venue"],
    }));
    expect(result.decision).toBe("auto_import");
    expect(result.outingFitScore).toBeGreaterThanOrEqual(18);
  });

  it("keeps a solid but not exceptional restaurant for manual review", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      rating: 4.3,
      reviewCount: 120,
    }));
    expect(result.decision).toBe("review");
  });

  it("allows strong niche activities to auto-import with a lower review threshold", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      kind: "activity",
      name: "Puzzle House",
      query: "escape room in Brooklyn",
      category: "escape_room",
      rating: 4.6,
      reviewCount: 120,
      types: ["escape_room", "tourist_attraction", "point_of_interest"],
    }));
    expect(result.decision).toBe("auto_import");
  });
});
