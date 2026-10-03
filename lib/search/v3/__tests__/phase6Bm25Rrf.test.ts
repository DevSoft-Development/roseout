import { describe, expect, it } from "vitest";
import type { RetrievalLaneResult } from "@/lib/search-framework";
import {
  bm25Score,
  reciprocalRankFusion,
} from "@/lib/search/v3";

describe("Search V3 Phase 6 BM25 and RRF", () => {
  it("gives higher BM25 weight to a rarer exact lexical term", () => {
    const commonDf = new Map<string, number>([["dinner", 90]]);
    const rareDf = new Map<string, number>([["omakase", 5]]);

    const common = bm25Score({
      documentTokens: ["dinner", "restaurant", "dinner"],
      queryTokens: ["dinner"],
      documentCount: 100,
      documentFrequency: commonDf,
      averageDocumentLength: 3,
    });

    const rare = bm25Score({
      documentTokens: ["omakase", "restaurant"],
      queryTokens: ["omakase"],
      documentCount: 100,
      documentFrequency: rareDf,
      averageDocumentLength: 3,
    });

    expect(rare).toBeGreaterThan(common);
  });

  it("rewards candidates supported by both structured and lexical lanes", () => {
    const structured: RetrievalLaneResult = {
      lane: "structured",
      elapsedMs: 1,
      candidates: [
        { locationId: "shared", lane: "structured", rank: 3 },
        { locationId: "structured-only", lane: "structured", rank: 1 },
      ],
    };

    const lexical: RetrievalLaneResult = {
      lane: "bm25",
      elapsedMs: 1,
      candidates: [
        { locationId: "shared", lane: "bm25", rank: 2 },
        { locationId: "lexical-only", lane: "bm25", rank: 1 },
      ],
    };

    const fused = reciprocalRankFusion([structured, lexical]);
    expect(fused[0].locationId).toBe("shared");
    expect(fused[0].lane).toBe("rrf");
    expect(fused[0].evidence).toEqual(expect.arrayContaining([
      "structured:rank=3",
      "bm25:rank=2",
    ]));
  });

  it("keeps fusion deterministic on tied scores", () => {
    const lanes: RetrievalLaneResult[] = [{
      lane: "structured",
      elapsedMs: 1,
      candidates: [
        { locationId: "b", lane: "structured", rank: 1 },
        { locationId: "a", lane: "structured", rank: 1 },
      ],
    }];

    const fused = reciprocalRankFusion(lanes);
    expect(fused.map((candidate) => candidate.locationId)).toEqual(["a", "b"]);
  });
});
