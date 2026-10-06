import { describe, expect, it } from "vitest";
import type { SearchIntentGraph } from "@/lib/search-framework";
import {
  SupabaseReviewIntelligenceRetrievalProvider,
  createDefaultRetrievalProviders,
  reviewConceptsForIntent,
} from "@/lib/search/v3";

const intent: SearchIntentGraph = {
  contractVersion: "search-intent-v3-alpha.1",
  rawQuery: "romantic rooftop drinks for date night",
  domains: ["restaurant"],
  primaryDomain: "restaurant",
  constraints: [],
  anchor: null,
  travelMode: "unspecified",
  maxTravelMinutes: null,
  occasion: "date night",
  partySize: null,
  sequencing: "single",
  ambiguity: { requiresClarification: false, unresolved: [] },
  metadata: {},
};

function queryResult(rows: unknown[]) {
  const chain: any = {
    select() { return chain; },
    in() { return chain; },
    order() { return chain; },
    limit() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return chain;
}

describe("Search V3 review intelligence lane", () => {
  it("maps user language into review concepts", () => {
    expect(reviewConceptsForIntent(intent)).toEqual(
      expect.arrayContaining(["romantic", "rooftop", "cocktails"]),
    );
  });

  it("ranks matching locations from review evidence", async () => {
    const provider = new SupabaseReviewIntelligenceRetrievalProvider({
      from(table: string) {
        expect(table).toBe("location_review_intelligence");
        return queryResult([
          {
            location_id: "strong",
            concept: "romantic",
            lifetime_count: 18,
            trailing_12m_count: 15,
            trailing_90d_count: 8,
            positive_ratio: 0.92,
            negative_ratio: 0.08,
            confidence: 0.9,
            trend: "recently_prominent",
          },
          {
            location_id: "strong",
            concept: "rooftop",
            lifetime_count: 12,
            trailing_12m_count: 10,
            trailing_90d_count: 5,
            positive_ratio: 0.88,
            negative_ratio: 0.12,
            confidence: 0.82,
            trend: "recently_prominent",
          },
          {
            location_id: "weak",
            concept: "romantic",
            lifetime_count: 3,
            trailing_12m_count: 0,
            trailing_90d_count: 0,
            positive_ratio: 0.7,
            negative_ratio: 0.3,
            confidence: 0.35,
            trend: "historical",
          },
        ]);
      },
    });

    const result = await provider.retrieve({
      request: { requestId: "review-lane", query: intent.rawQuery },
      intent,
    });

    expect(result.lane).toBe("review_intelligence");
    expect(result.candidates.map((candidate) => candidate.locationId)).toEqual([
      "strong",
      "weak",
    ]);
    expect(result.candidates[0].evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("review:romantic"),
        expect.stringContaining("review:rooftop"),
      ]),
    );
  });

  it("stays dormant when the query has no review concept", async () => {
    let queried = false;
    const provider = new SupabaseReviewIntelligenceRetrievalProvider({
      from() {
        queried = true;
        return queryResult([]);
      },
    });
    const neutral = {
      ...intent,
      rawQuery: "Italian dinner in Queens",
      occasion: null,
    };
    const result = await provider.retrieve({
      request: { requestId: "review-neutral", query: neutral.rawQuery },
      intent: neutral,
    });
    expect(result.candidates).toEqual([]);
    expect(queried).toBe(false);
  });

  it("keeps the production default at five lanes", () => {
    const client: any = {
      from() { return queryResult([]); },
      rpc() { return Promise.resolve({ data: [], error: null }); },
    };
    const providers = createDefaultRetrievalProviders(client, {
      semantic: {
        embeddings: {
          providerId: "test",
          async embed() {
            return {
              vector: [0.1],
              model: "text-embedding-3-small",
              version: "search-embedding:v1",
            };
          },
        },
      },
    });
    expect(providers).toHaveLength(5);
    expect(providers.some((provider) =>
      provider.providerId.includes("review-intelligence")
    )).toBe(false);
  });

  it("adds the sixth lane only when explicitly enabled", () => {
    const client: any = {
      from() { return queryResult([]); },
      rpc() { return Promise.resolve({ data: [], error: null }); },
    };
    const providers = createDefaultRetrievalProviders(client, {
      reviewIntelligence: { enabled: true },
      semantic: {
        embeddings: {
          providerId: "test",
          async embed() {
            return {
              vector: [0.1],
              model: "text-embedding-3-small",
              version: "search-embedding:v1",
            };
          },
        },
      },
    });
    expect(providers).toHaveLength(6);
    expect(providers[5].providerId).toBe(
      "theouthaven.supabase-review-intelligence.v1",
    );
  });
});
