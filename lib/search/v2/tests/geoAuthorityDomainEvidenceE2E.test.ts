import { describe, expect, it } from "vitest";
import { hasStrongDomainEvidence } from "../retrieval/retrieveUnifiedLocations";

const request = (overrides: Record<string, unknown> = {}) => ({
  desiredRole: "restaurant",
  retrievalTerms: [],
  cuisines: [],
  foods: [],
  categories: [],
  features: [],
  geo: { market: "NYC", city: "Astoria", borough: "Queens", neighborhood: "Astoria", county: null, state: "NY", latitude: 40.7644, longitude: -73.9235, radiusMiles: 3 },
  ...overrides,
}) as any;

describe("strong domain evidence", () => {
  it("rejects generic restaurant text for an Italian request", () => {
    expect(hasStrongDomainEvidence({ location_type: "restaurant", cuisine: "wine_bar", search_document: "restaurant dinner wine bar" } as any, request({ cuisines: ["italian"] }))).toBe(false);
  });

  it("accepts structured and semantic cuisine aliases", () => {
    expect(hasStrongDomainEvidence({ location_type: "restaurant", cuisine: "pizza", semantic_tags: ["italian"] } as any, request({ cuisines: ["italian"] }))).toBe(true);
    expect(hasStrongDomainEvidence({ location_type: "restaurant", cuisine_type: "japanese", search_keywords: ["omakase"] } as any, request({ cuisines: ["sushi"] }))).toBe(true);
    expect(hasStrongDomainEvidence({ location_type: "restaurant", tags: ["zabiha"] } as any, request({ cuisines: ["halal"] }))).toBe(true);
  });

  it("accepts strong activity aliases and rejects unrelated activities", () => {
    const karaoke = request({ desiredRole: "karaoke_activity", categories: ["karaoke"] });
    expect(hasStrongDomainEvidence({ location_type: "activity", activity_type: "karaoke_bar" } as any, karaoke)).toBe(true);
    expect(hasStrongDomainEvidence({ location_type: "activity", activity_type: "bowling" } as any, karaoke)).toBe(false);
  });

  it("does not require evidence for generic unconstrained lanes", () => {
    expect(hasStrongDomainEvidence({ location_type: "restaurant" } as any, request())).toBe(true);
  });
});
