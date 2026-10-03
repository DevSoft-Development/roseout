import { describe, expect, it } from "vitest";
import type {
  KnowledgeEntity,
  KnowledgeGraphProvider,
} from "@/lib/search-framework";
import {
  entityTextSimilarity,
  normalizeEntityText,
} from "@/lib/search-framework/entity-resolution/normalizeEntityText";
import { GraphEntityResolver } from "@/lib/search/v3/entity-resolution/graphEntityResolver";

const msgEntity: KnowledgeEntity = {
  id: "msg-entity",
  entityType: "arena",
  canonicalKey: "search_anchor:msg",
  canonicalName: "Madison Square Garden",
  locationId: null,
  attributes: {
    latitude: 40.7505045,
    longitude: -73.9934387,
  },
  confidence: 1,
  source: "search_anchors",
  sourceUpdatedAt: null,
};

function graphStub(overrides: Partial<KnowledgeGraphProvider> = {}): KnowledgeGraphProvider {
  return {
    providerId: "test.graph",
    async resolveEntity() { return null; },
    async resolveAlias(alias) {
      return alias === "madison square garden" ? msgEntity : null;
    },
    async getEntity() { return null; },
    async getRelationships() { return []; },
    async getFeatures() { return {}; },
    async getEvidence() { return []; },
    async findRelated() { return []; },
    async resolveHierarchy() { return []; },
    async getEntityContext() { return null; },
    async searchEntities() { return []; },
    ...overrides,
  };
}

describe("Search V3 entity normalization", () => {
  it("expands common landmark shorthand", () => {
    expect(normalizeEntityText("MSG")).toBe("madison square garden");
    expect(normalizeEntityText("MoMA")).toBe("museum of modern art");
    expect(normalizeEntityText("JFK")).toBe("john f kennedy international airport");
    expect(normalizeEntityText("CitiField")).toBe("citi field");
  });

  it("normalizes punctuation and business suffixes", () => {
    expect(normalizeEntityText("The Joe's Pizza, LLC")).toBe("joes pizza");
  });

  it("scores containment and token overlap deterministically", () => {
    expect(entityTextSimilarity("madison square garden", "madison square garden")).toBe(1);
    expect(entityTextSimilarity("madison square garden", "square garden")).toBe(0.86);
  });

  it("resolves MSG through the graph alias layer", async () => {
    const resolver = new GraphEntityResolver(graphStub());
    const result = await resolver.resolve("MSG");

    expect(result.status).toBe("resolved");
    expect(result.entity?.canonicalName).toBe("Madison Square Garden");
    expect(result.entity?.entityType).toBe("arena");
    expect(result.confidence).toBe(1);
  });
});
