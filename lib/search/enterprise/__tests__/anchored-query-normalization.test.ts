import { describe, expect, it } from "vitest";
import {
  matchesAnchoredQualifier,
  normalizeAnchoredQuery,
} from "../anchoredQueryNormalization";

const location = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "location-1",
    name: "Astoria Seafood",
    location_type: "restaurant",
    cuisine: "Seafood",
    primary_category: "restaurant",
    tags: ["oysters", "raw bar"],
    ...overrides,
  }) as any;

describe("qualified named-location anchor normalization", () => {
  it.each([
    [
      "Seafood restaurant near Gaming City in Astoria",
      "restaurant near Gaming City in Astoria",
      "Seafood",
      "restaurant",
    ],
    [
      "Italian dinner close to Museum of the Moving Image",
      "dinner close to Museum of the Moving Image",
      "Italian",
      "restaurant",
    ],
    [
      "Teen activities near Queens Museum",
      "activities near Queens Museum",
      "Teen",
      "activity",
    ],
    [
      "Restaurant near Gaming City in Astoria",
      "Restaurant near Gaming City in Astoria",
      null,
      "restaurant",
    ],
  ])("normalizes %s", (query, canonicalQuery, qualifier, requestedDomain) => {
    expect(normalizeAnchoredQuery(query)).toEqual({
      canonicalQuery,
      qualifier,
      requestedDomain,
    });
  });

  it("does not convert non-anchor searches", () => {
    expect(normalizeAnchoredQuery("Seafood restaurant in Astoria")).toBeNull();
    expect(normalizeAnchoredQuery("Dinner and bowling near Astoria")).toBeNull();
  });

  it("keeps seafood matches and rejects unrelated restaurants", () => {
    expect(matchesAnchoredQualifier(location(), "Seafood")).toBe(true);
    expect(
      matchesAnchoredQualifier(
        location({
          name: "Sami's Kabab House",
          cuisine: "Afghan",
          tags: ["kebab", "halal"],
          search_document: "Afghan kebab restaurant",
        }),
        "Seafood",
      ),
    ).toBe(false);
  });

  it("supports common cuisine synonyms", () => {
    expect(
      matchesAnchoredQualifier(
        location({ cuisine: "Japanese", tags: ["omakase", "sashimi"] }),
        "Sushi",
      ),
    ).toBe(true);
    expect(
      matchesAnchoredQualifier(
        location({ cuisine: "Italian", tags: ["pasta", "trattoria"] }),
        "Italian",
      ),
    ).toBe(true);
  });
});
