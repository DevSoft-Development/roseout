import { describe, expect, it } from "vitest";
import type {
  SearchQueryEmbeddingProvider,
  SearchIntentGraph,
} from "@/lib/search-framework";
import {
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

  it("lets RRF fuse semantic with structured and BM25 without special casing", () => {
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
    ]);

    expect(fused[0].locationId).toBe("shared");
  });
});
