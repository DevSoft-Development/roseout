import { describe, expect, it } from "vitest";
import type { EnterpriseLocation, SearchIntent } from "../types";
import {
  buildLocationSemanticDocument,
  buildSearchQueryEmbeddingInput,
  calculateSemanticRelevance,
  extractNegativeConstraints,
  fuseSearchCandidates,
  queryEmbeddingCacheKey,
  searchSemanticCandidates,
} from "../semantic";

const baseLocation: EnterpriseLocation = {
  id: "loc-1",
  name: "Example Venue",
  location_type: "restaurant",
  primary_category: "Caribbean restaurant",
  cuisine: "Caribbean, Jamaican",
  neighborhood: "Astoria",
  borough: "Queens",
  city: "New York",
  state: "NY",
  vibe_tags: ["casual", "lively", "group-friendly"],
  best_for_tags: ["birthday dinner", "girls night"],
  tags: ["cocktails", "outdoor seating"],
  description: "<p>A lively Caribbean restaurant.</p>",
  search_keywords: ["jerk chicken", "rum cocktails"],
  is_searchable: true,
  is_hidden: false,
  active: true,
  duplicate_status: "primary",
};

const intent: SearchIntent = {
  rawQuery: "somewhere chill to eat with my teenage son and an arcade after, no clubs",
  searchType: "mixed_outing",
  primaryDomain: "mixed",
  needsRestaurant: true,
  needsActivity: true,
  wantsPairing: true,
  normalizedIntent: "paired_outing",
  restaurantIntent: { mealTerms: ["eat"], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: ["chill"], featureTerms: [], negativeTerms: [] },
  activityIntent: { activityTerms: ["arcade", "interactive games"], categoryTerms: [], vibeTerms: ["casual"], featureTerms: [], negativeTerms: ["club"] },
  geo: { aliases: [], geoStrictness: "none" },
  vibe: ["chill", "casual"],
  budget: "moderate",
  strictness: "medium",
};

describe("semantic document builder", () => {
  it("creates deterministic, cleaned documents from approved public fields", () => {
    const first = buildLocationSemanticDocument(baseLocation, new Date("2026-01-01T00:00:00Z"));
    const second = buildLocationSemanticDocument(baseLocation, new Date("2026-02-01T00:00:00Z"));
    expect(first.semanticDocument).toContain("Name: Example Venue");
    expect(first.semanticDocument).toContain("Description: A lively Caribbean restaurant.");
    expect(first.semanticDocument).not.toContain("<p>");
    expect(first.semanticDocumentHash).toEqual(second.semanticDocumentHash);
    expect(first.eligibleForPublicEmbedding).toBe(true);
  });

  it("changes the document hash when relevant fields change", () => {
    const first = buildLocationSemanticDocument(baseLocation);
    const changed = buildLocationSemanticDocument({ ...baseLocation, vibe_tags: ["quiet", "intimate"] });
    expect(first.semanticDocumentHash).not.toEqual(changed.semanticDocumentHash);
  });

  it("marks hidden, unsupported, and duplicate records as not eligible for public embedding", () => {
    const hidden = buildLocationSemanticDocument({ ...baseLocation, is_hidden: true });
    const closed = buildLocationSemanticDocument({ ...baseLocation, status: "permanently_closed" });
    const duplicate = buildLocationSemanticDocument({ ...baseLocation, duplicate_status: "duplicate" });
    expect(hidden.eligibleForPublicEmbedding).toBe(false);
    expect(closed.rejectionReasons).toContain("unsupported_status");
    expect(duplicate.rejectionReasons).toContain("duplicate");
  });
});

describe("query embeddings and negatives", () => {
  it("builds normalized intent input without delegating geography", () => {
    const input = buildSearchQueryEmbeddingInput(intent);
    expect(input).toContain("Requested activity: arcade, interactive games.");
    expect(input).toContain("Avoid: club");
    expect(input).not.toContain("resolvedMarket");
  });

  it("includes model and version in cache key", () => {
    expect(queryEmbeddingCacheKey(intent, "model-a", "v1")).not.toEqual(queryEmbeddingCacheKey(intent, "model-a", "v2"));
  });

  it("extracts no-club and family-friendly exclusions", () => {
    const negative = extractNegativeConstraints("family-friendly, nothing adult, relaxed but no clubs");
    expect(negative.categories).toContain("club");
    expect(negative.categories).toContain("adult-only");
  });
});

describe("vector retrieval and fusion", () => {
  it("keeps semantic retrieval lane-filtered and eligibility-filtered", () => {
    const results = searchSemanticCandidates({
      expectedDomain: "restaurant",
      resolvedMarket: "NYC",
      records: [
        { ...baseLocation, id: "restaurant", market: "NYC", search_score: 0.9 },
        { ...baseLocation, id: "activity", location_type: "activity", primary_category: "Arcade", cuisine: null, market: "NYC", search_score: 0.99 },
        { ...baseLocation, id: "hidden", market: "NYC", is_hidden: true, search_score: 1 },
        { ...baseLocation, id: "outside", market: "LA", search_score: 1 },
      ],
    });
    expect(results.map((result) => result.locationId)).toEqual(["restaurant"]);
  });

  it("collapses duplicates and rewards candidates appearing in multiple lanes", () => {
    const fused = fuseSearchCandidates({
      structuredCandidates: [{ locationId: "a", score: 10 }],
      lexicalCandidates: [{ locationId: "exact", score: 100 }, { locationId: "a", score: 80 }],
      semanticCandidates: [{ locationId: "a", similarity: 0.9 }, { locationId: "semantic-only", similarity: 0.95 }],
    });
    expect(fused.filter((candidate) => candidate.locationId === "a")).toHaveLength(1);
    expect(fused[0].locationId).toBe("a");
    expect(fused.find((candidate) => candidate.locationId === "a")?.retrievalSources).toEqual(["structured", "lexical", "semantic"]);
  });
});

describe("semantic relevance", () => {
  it("caps weak semantic-only boosts and blocks negative violations", () => {
    expect(calculateSemanticRelevance({ semanticSimilarity: 0.95, structuredEvidence: 0, lexicalEvidence: 0 }).boost).toBeLessThanOrEqual(6);
    expect(calculateSemanticRelevance({ semanticSimilarity: 0.95, negativeViolation: true }).boost).toBe(0);
  });
});
