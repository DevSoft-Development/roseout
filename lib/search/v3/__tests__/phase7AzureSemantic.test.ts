import { describe, expect, it } from "vitest";
import type {
  SearchQueryEmbeddingProvider,
  SearchIntentGraph,
} from "@/lib/search-framework";
import {
  SupabaseFoodSemanticRetrievalProvider,
  SupabaseMenuSemanticRetrievalProvider,
  SupabaseSemanticRetrievalProvider,
  buildSemanticQueryText,
  reciprocalRankFusion,
} from "@/lib/search/v3";

const intent: SearchIntentGraph = {
  contractVersion: "search-intent-v3-alpha.1",
  rawQuery: "romantic Italian dinner in Queens",
  domains: ["restaurant"],
  primaryDomain: "restaurant",
  constraints: [
    {
      key: "cuisine",
      value: "italian",
      strength: "hard",
      source: "explicit",
      confidence: 1,
    },
    {
      key: "meal_period",
      value: "dinner",
      strength: "hard",
      source: "explicit",
      confidence: 1,
    },
    {
      key: "borough",
      value: "Queens",
      strength: "hard",
      source: "explicit",
      confidence: 1,
    },
  ],
  anchor: null,
  travelMode: "unspecified",
  maxTravelMinutes: null,
  occasion: "date night",
  partySize: null,
  sequencing: "single",
  ambiguity: { requiresClarification: false, unresolved: [] },
  metadata: {},
};

describe("Search V3 Phase 7 Azure semantic retrieval", () => {
  it("builds grounded semantic query text", () => {
    const text = buildSemanticQueryText(intent);
    expect(text).toContain("romantic Italian dinner in Queens");
    expect(text).toContain("cuisine: italian");
    expect(text).toContain("meal period: dinner");
    expect(text).toContain("occasion: date night");
  });

  it("retrieves dense candidates from the non-HF semantic RPC", async () => {
    const embeddings: SearchQueryEmbeddingProvider = {
      providerId: "test.azure-embedding",
      async embed() {
        return {
          vector: [0.1, 0.2, 0.3],
          model: "text-embedding-3-small",
          version: "search-embedding:v1",
        };
      },
    };

    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        return {
          data: [
            { location_id: "b", similarity: 0.76 },
            { location_id: "a", similarity: 0.91 },
          ],
          error: null,
        };
      },
    };

    const provider = new SupabaseSemanticRetrievalProvider(
      client,
      embeddings,
      { candidateLimit: 200, minSimilarity: 0.55 },
    );

    const result = await provider.retrieve({
      request: { requestId: "phase7", query: intent.rawQuery },
      intent,
    });

    expect(calls[0].fn).toBe("match_location_search_embeddings");
    expect(calls[0].args.p_embedding_version).toBe("search-embedding:v1");
    expect(result.lane).toBe("semantic_dense");
    expect(result.candidates.map((candidate) => candidate.locationId)).toEqual(["a", "b"]);
  });

  it("retrieves Azure-space food candidates for restaurant food intent", async () => {
    const foodIntent: SearchIntentGraph = {
      ...intent,
      rawQuery: "wings for dinner in Queens",
      constraints: [
        ...intent.constraints,
        {
          key: "food",
          value: "wings",
          strength: "hard",
          source: "explicit",
          confidence: 1,
        },
      ],
    };
    const embeddings: SearchQueryEmbeddingProvider = {
      providerId: "test.azure-food-embedding",
      async embed() {
        return {
          vector: [0.1, 0.2, 0.3],
          model: "text-embedding-3-small",
          version: "search-embedding:v1",
        };
      },
    };
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const provider = new SupabaseFoodSemanticRetrievalProvider(
      {
        async rpc(fn, args) {
          calls.push({ fn, args: args ?? {} });
          return {
            data: [{ location_id: "food-a", similarity: 0.88 }],
            error: null,
          };
        },
      },
      embeddings,
      { embeddingVersion: "azure-text-embedding-3-small:v1" },
    );

    const result = await provider.retrieve({
      request: { requestId: "phase7-food", query: foodIntent.rawQuery },
      intent: foodIntent,
    });

    expect(calls[0].fn).toBe("match_location_food_embeddings");
    expect(calls[0].args.p_embedding_version).toBe(
      "azure-text-embedding-3-small:v1",
    );
    expect(result.lane).toBe("semantic_food");
    expect(result.candidates[0].locationId).toBe("food-a");
  });

  it("aggregates Azure-space menu matches by location", async () => {
    const menuIntent: SearchIntentGraph = {
      ...intent,
      rawQuery: "lobster mac and cheese in Queens",
      constraints: [
        ...intent.constraints,
        {
          key: "food",
          value: "lobster mac and cheese",
          strength: "hard",
          source: "explicit",
          confidence: 1,
        },
      ],
    };
    const embeddings: SearchQueryEmbeddingProvider = {
      providerId: "test.azure-menu-embedding",
      async embed() {
        return {
          vector: [0.1, 0.2, 0.3],
          model: "text-embedding-3-small",
          version: "search-embedding:v1",
        };
      },
    };
    const provider = new SupabaseMenuSemanticRetrievalProvider(
      {
        async rpc(fn) {
          expect(fn).toBe("match_location_menu_items");
          return {
            data: [
              {
                location_id: "menu-a",
                item_name: "Lobster Mac & Cheese",
                source: "menu",
                similarity: 0.93,
              },
              {
                location_id: "menu-a",
                item_name: "Lobster Roll",
                source: "menu",
                similarity: 0.85,
              },
              {
                location_id: "menu-b",
                item_name: "Mac & Cheese",
                source: "menu",
                similarity: 0.82,
              },
            ],
            error: null,
          };
        },
      },
      embeddings,
    );

    const result = await provider.retrieve({
      request: { requestId: "phase7-menu", query: menuIntent.rawQuery },
      intent: menuIntent,
    });

    expect(result.lane).toBe("semantic_menu");
    expect(result.candidates.map((candidate) => candidate.locationId)).toEqual([
      "menu-a",
      "menu-b",
    ]);
    expect(result.candidates[0].evidence).toContain(
      "menu:Lobster Mac & Cheese",
    );
  });

  it("keeps the menu lane dormant without an explicit food constraint", async () => {
    let embedded = false;
    const provider = new SupabaseMenuSemanticRetrievalProvider(
      { async rpc() { throw new Error("should not run"); } },
      {
        providerId: "test.no-menu-embedding",
        async embed() {
          embedded = true;
          return {
            vector: [0.1],
            model: "text-embedding-3-small",
            version: "search-embedding:v1",
          };
        },
      },
    );

    const result = await provider.retrieve({
      request: { requestId: "phase7-no-menu", query: intent.rawQuery },
      intent,
    });

    expect(result.candidates).toEqual([]);
    expect(embedded).toBe(false);
  });

  it("fails closed when query and index embedding models differ", async () => {
    const embeddings: SearchQueryEmbeddingProvider = {
      providerId: "test.bad-embedding",
      async embed() {
        return {
          vector: [1, 2, 3],
          model: "different-vector-space",
          version: "different:v1",
        };
      },
    };

    const provider = new SupabaseSemanticRetrievalProvider(
      { async rpc() { return { data: [], error: null }; } },
      embeddings,
    );

    await expect(provider.retrieve({
      request: { requestId: "phase7-mismatch", query: intent.rawQuery },
      intent,
    })).rejects.toThrow("Semantic vector-space mismatch");
  });

  it("lets RRF fuse structured, BM25, dense, food, and menu lanes generically", () => {
    const fused = reciprocalRankFusion([
      {
        lane: "structured",
        elapsedMs: 1,
        candidates: [{ locationId: "shared", lane: "structured", rank: 4 }],
      },
      {
        lane: "bm25",
        elapsedMs: 1,
        candidates: [{ locationId: "shared", lane: "bm25", rank: 3 }],
      },
      {
        lane: "semantic_dense",
        elapsedMs: 1,
        candidates: [
          { locationId: "semantic-only", lane: "semantic_dense", rank: 1 },
          { locationId: "shared", lane: "semantic_dense", rank: 2 },
        ],
      },
      {
        lane: "semantic_food",
        elapsedMs: 1,
        candidates: [{ locationId: "shared", lane: "semantic_food", rank: 2 }],
      },
      {
        lane: "semantic_menu",
        elapsedMs: 1,
        candidates: [{ locationId: "shared", lane: "semantic_menu", rank: 1 }],
      },
    ]);

    expect(fused[0].locationId).toBe("shared");
  });
});
