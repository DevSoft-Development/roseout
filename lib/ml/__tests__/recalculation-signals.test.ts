import { describe, expect, it } from "vitest";
import { createPairDiagnostics, mlPairs } from "../recalculationSignals";
import { calculatePairScore } from "../intentScoring";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";

describe("mlPairs", () => {
  it("extracts the production ml_pair_ids shape", () => {
    const diagnostics = createPairDiagnostics();
    const pairs = mlPairs({ ml_pair_ids: [{ restaurant_location_id: restaurantId, activity_location_id: activityId, restaurant_name: "Cafe", activity_name: "Museum", rank: 1, pair_distance_miles: 0.6, market: "NYC" }] }, diagnostics);
    expect(pairs).toEqual([{ restaurant_location_id: restaurantId, activity_location_id: activityId, restaurant_name: "Cafe", activity_name: "Museum", rank: 1, pair_distance_miles: 0.6, market: "NYC" }]);
    expect(diagnostics.validMlPairsExtracted).toBe(1);
    expect(diagnostics.samplePairKeys).toHaveLength(1);
  });

  it("supports nested restaurant/activity shapes and skipped reason diagnostics", () => {
    const diagnostics = createPairDiagnostics();
    const pairs = mlPairs({ ml_pair_ids: [{ restaurant: { id: restaurantId, name: "Cafe" }, activity: { locationId: activityId, name: "Museum" }, distanceMiles: 1.2, requestedMarket: "Brooklyn" }, { restaurant_id: restaurantId }, { restaurant_id: "bad", activity_id: activityId }] }, diagnostics);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].restaurant_location_id).toBe(restaurantId);
    expect(pairs[0].activity_location_id).toBe(activityId);
    expect(diagnostics.skippedPairReasons.skipped_pair_missing_restaurant_or_activity_id).toBe(1);
    expect(diagnostics.skippedPairReasons.skipped_pair_invalid_location_id).toBe(1);
  });

  it("pair impressions alone can produce a low nonzero pair score", () => {
    expect(calculatePairScore({ impressions_30d: 1, clicks_30d: 0, pair_distance_miles: 1 })).toBeGreaterThan(0);
  });
});
