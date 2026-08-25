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

  it("auto-imports a strong destination restaurant when the place itself has outing evidence", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      name: "Skyline Rooftop Dining Room",
      query: "rooftop restaurant in Manhattan",
      category: "rooftop",
      rating: 4.7,
      reviewCount: 1800,
      types: ["restaurant", "fine_dining_restaurant", "cocktail_bar", "event_venue"],
    }));
    expect(result.decision).toBe("auto_import");
    expect(result.outingFitScore).toBeGreaterThanOrEqual(18);
  });

  it("does not treat the search phrase alone as proof of outing fit", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      name: "Generic Dining Room",
      query: "rooftop date night restaurant in Manhattan",
      category: "rooftop",
      rating: 4.7,
      reviewCount: 1800,
      types: ["restaurant", "food", "point_of_interest"],
      editorialSummary: null,
    }));
    expect(result.decision).not.toBe("auto_import");
    expect(result.outingFitScore).toBe(5);
  });

  it("keeps a solid but not exceptional restaurant for manual review", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      rating: 4.3,
      reviewCount: 120,
    }));
    expect(result.decision).toBe("review");
  });

  it("keeps high-rated low-volume hidden gems for review instead of auto-publishing a subjective label", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      name: "Neighborhood Table",
      query: "hidden gem neighborhood restaurant in Forest Hills Queens",
      category: "hidden_gem",
      rating: 4.7,
      reviewCount: 48,
      types: ["restaurant", "food", "point_of_interest"],
    }));
    expect(result.decision).toBe("review");
    expect(result.reasons).toContain("subjective_hidden_gem_requires_review");
    expect(result.thresholds.reviewMinReviews).toBe(25);
  });

  it("allows strong niche activities to auto-import with a lower review threshold", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      kind: "activity",
      name: "Puzzle House Escape Room",
      query: "escape room in Brooklyn Heights",
      category: "escape_room",
      rating: 4.6,
      reviewCount: 120,
      types: ["escape_room", "tourist_attraction", "point_of_interest"],
    }));
    expect(result.decision).toBe("auto_import");
  });

  it("keeps promising first-time activities with only a small review history", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      kind: "activity",
      name: "Brooklyn Glassblowing Studio",
      query: "glassblowing class in Williamsburg Brooklyn",
      category: "glassblowing",
      rating: 4.7,
      reviewCount: 32,
      types: ["art_studio", "tourist_attraction", "point_of_interest"],
    }));
    expect(result.decision).toBe("review");
    expect(result.thresholds.reviewMinReviews).toBe(20);
  });

  it("recognizes hookah lounges as outing destinations when the venue itself says hookah", () => {
    const result = evaluateGoogleDiscoveryCandidate(candidate({
      kind: "activity",
      name: "Independent Hookah Lounge",
      query: "hookah shisha lounge in Forest Hills Queens",
      category: "hookah",
      rating: 4.6,
      reviewCount: 250,
      types: ["hookah_bar", "bar", "night_club", "point_of_interest"],
    }));
    expect(result.decision).toBe("auto_import");
    expect(result.reasons).toContain("hookah_destination");
  });
});