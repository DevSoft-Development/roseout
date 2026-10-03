import { describe, expect, it } from "vitest";
import type {
  SearchPairingProvider,
  SearchQueryEmbeddingProvider,
  SearchRetrievalProvider,
} from "@/lib/search-framework";
import {
  createDefaultRetrievalProviders,
  createTheOutHavenSearchV3,
} from "@/lib/search/v3";

const client = {
  from() {
    throw new Error("database should not be touched during composition tests");
  },
  async rpc() {
    throw new Error("rpc should not be touched during composition tests");
  },
};

describe("Search V3 TheOutHaven composition", () => {
  it("assembles the five default swappable retrieval lanes", () => {
    const embeddings: SearchQueryEmbeddingProvider = {
      providerId: "test.embedding",
      async embed() {
        return {
          vector: [0.1, 0.2, 0.3],
          model: "text-embedding-3-small",
          version: "test:v1",
        };
      },
    };

    const providers = createDefaultRetrievalProviders(client, {
      semantic: { embeddings },
    });

    expect(providers.map((provider) => provider.providerId)).toEqual([
      "theouthaven.supabase-structured.v1",
      "theouthaven.supabase-bm25.v1",
      "theouthaven.supabase-semantic-dense.v1",
      "theouthaven.supabase-semantic-food.azure.v1",
      "theouthaven.supabase-semantic-menu.azure.v1",
    ]);
  });

  it("allows the entire retrieval lane set to be replaced without changing orchestration", () => {
    const replacement: SearchRetrievalProvider = {
      providerId: "experiment.alternate-lane.v1",
      async retrieve() {
        return {
          lane: "alternate",
          candidates: [],
          elapsedMs: 0,
        };
      },
    };

    const composition = createTheOutHavenSearchV3(client, {
      retrievalProviders: [replacement],
      entityResolution: null,
      eligibility: null,
      fusion: null,
      locationIntelligence: {
        providerId: "test.location-intelligence",
        async getLocation() {
          return null;
        },
        async getLocations() {
          return [];
        },
      },
    });

    expect(composition.retrievalProviders).toEqual([replacement]);
    expect(composition.retrievalProviders[0].providerId).toBe(
      "experiment.alternate-lane.v1",
    );
    expect(composition.pairingProvider?.providerId).toBe(
      "search-v3.deterministic-outing-pairer.v1",
    );
  });

  it("allows the outing pairing provider to be replaced or disabled", () => {
    const replacement: SearchPairingProvider = {
      providerId: "experiment.outing-pairer.v1",
      async pair() {
        return [];
      },
    };

    const withReplacement = createTheOutHavenSearchV3(client, {
      pairing: replacement,
      retrievalProviders: [{
        providerId: "test.empty-retrieval",
        async retrieve() {
          return { lane: "test", candidates: [], elapsedMs: 0 };
        },
      }],
      entityResolution: null,
      eligibility: null,
      fusion: null,
      ranking: null,
      locationIntelligence: {
        providerId: "test.location-intelligence",
        async getLocation() { return null; },
        async getLocations() { return []; },
      },
    });

    expect(withReplacement.pairingProvider).toBe(replacement);

    const disabled = createTheOutHavenSearchV3(client, {
      pairing: null,
      retrievalProviders: [{
        providerId: "test.empty-retrieval",
        async retrieve() {
          return { lane: "test", candidates: [], elapsedMs: 0 };
        },
      }],
      entityResolution: null,
      eligibility: null,
      fusion: null,
      ranking: null,
      locationIntelligence: {
        providerId: "test.location-intelligence",
        async getLocation() { return null; },
        async getLocations() { return []; },
      },
    });

    expect(disabled.pairingProvider).toBeNull();
  });
});
