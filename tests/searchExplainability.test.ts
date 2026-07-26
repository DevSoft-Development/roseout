import { describe, expect, it } from "vitest";
import {
  buildSearchExplanationsFromQualityRanking,
  serializeSearchExplanation,
  serializeSearchExplanations,
} from "@/lib/search/enterprise/searchExplainability";

describe("search explainability", () => {
  it("normalizes and bounds explanation payloads", () => {
    const explanation = serializeSearchExplanation({
      id: "restaurant-1",
      resultType: "restaurant",
      finalScore: 12.5,
      baseScore: 10,
      qualityAdjustment: 2.5,
      mlAdjustment: 0,
      geoAdjustment: 0,
      penalties: ["closed_at_requested_time"],
      oldRank: 4,
      newRank: 1,
    });

    expect(explanation).toMatchObject({
      id: "restaurant-1",
      resultType: "restaurant",
      qualityAdjustment: 2.5,
      oldRank: 4,
      newRank: 1,
    });
  });

  it("derives explanations from live quality ranking evidence", () => {
    const explanations = buildSearchExplanationsFromQualityRanking({
      restaurants: [
        {
          id: "r1",
          oldRank: 3,
          newRank: 1,
          scoreDelta: 4.25,
          breakdown: {
            cuisineMatch: 8,
            activityMatch: 0,
            occasionMatch: 2,
            personalizationAdjustment: 1.5,
          },
        },
      ],
      activities: [
        {
          id: "a1",
          oldRank: 1,
          newRank: 2,
          scoreDelta: -1,
          breakdown: { penalties: -3 },
        },
      ],
      pairs: [
        {
          id: "r1:a1",
          oldRank: 2,
          newRank: 1,
          scoreDelta: 3,
          breakdown: {
            routeConfidence: "verified",
            routeSource: "walking_route",
            temporalFeasibility: "feasible",
          },
        },
      ],
    });

    expect(explanations).toHaveLength(3);
    expect(explanations[0]).toMatchObject({
      id: "r1",
      resultType: "restaurant",
      intentMatch: "cuisine, occasion",
      personalizationAdjustment: 1.5,
    });
    expect(explanations[1].penalties).toEqual(["quality_penalty:-3"]);
    expect(explanations[2]).toMatchObject({
      id: "r1:a1",
      resultType: "pair",
      routeConfidence: "verified",
      temporalFeasibility: "feasible",
    });
  });

  it("caps explanation list size", () => {
    const values = Array.from({ length: 120 }, (_, index) => ({
      id: String(index),
      finalScore: index,
      baseScore: 0,
      qualityAdjustment: 0,
      mlAdjustment: 0,
      geoAdjustment: 0,
      penalties: [],
    }));

    expect(serializeSearchExplanations(values, 500)).toHaveLength(100);
  });
});
