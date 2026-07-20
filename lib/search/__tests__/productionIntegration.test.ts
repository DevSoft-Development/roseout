import { describe, expect, it } from "vitest";
import { applyPhase13ProductionIntegration } from "../productionIntegration";

function location(id: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, name: id, location_type: type, is_searchable: true, is_hidden: false, active: true, ...extra } as any;
}

describe("Phase 1-3 production integration", () => {
  it("uses canonical eligibility for final restaurant, activity, and pair lanes", async () => {
    process.env.SEARCH_PHASE13_INTEGRATION_ENABLED = "true";
    process.env.SEARCH_BEHAVIORAL_RERANK_ENABLED = "false";
    process.env.SEARCH_SEMANTIC_ENABLED = "false";
    process.env.SEARCH_HYBRID_RANKING_APPLY = "false";

    const restaurant = location("restaurant", "restaurant", { cuisine: "Italian" });
    const activity = location("activity", "activity", { activity_type: "arcade" });
    const closedRestaurant = location("closed", "restaurant", { cuisine: "Seafood", status: "permanently_closed" });

    const result = await applyPhase13ProductionIntegration({
      success: true,
      restaurants: [restaurant, activity, closedRestaurant],
      activities: [activity, restaurant],
      pairs: [
        { restaurant, activity },
        { restaurant: activity, activity: restaurant },
      ],
      card_counts: { restaurants: 3, activities: 2, pairs: 2 },
      debug: {},
    } as any, "Italian dinner and arcade after");

    expect(result.restaurants.map((row: any) => row.id)).toEqual(["restaurant"]);
    expect(result.activities.map((row: any) => row.id)).toEqual(["activity"]);
    expect(result.pairs).toHaveLength(1);
    expect((result.pairs[0] as any).pair_key).toBe("restaurant:activity");
  });

  it("keeps production ordering unchanged while hybrid ranking is shadow-only", async () => {
    process.env.SEARCH_PHASE13_INTEGRATION_ENABLED = "true";
    process.env.SEARCH_BEHAVIORAL_RERANK_ENABLED = "false";
    process.env.SEARCH_SEMANTIC_ENABLED = "false";
    process.env.SEARCH_HYBRID_RANKING_APPLY = "false";

    const first = location("first", "restaurant", { cuisine: "Thai", search_score: 1 });
    const second = location("second", "restaurant", { cuisine: "Thai", search_score: 100 });
    const result = await applyPhase13ProductionIntegration({ success: true, restaurants: [first, second], activities: [], pairs: [], card_counts: {}, debug: {} } as any, "Thai restaurant");

    expect(result.restaurants.map((row: any) => row.id)).toEqual(["first", "second"]);
    expect((result.debug as any).phase13ProductionIntegration.hybridApply).toBe(false);
    expect((result.debug as any).phase13ProductionIntegration.restaurantShadowOrder).toHaveLength(2);
  });

  it("falls back to the existing result set when optional systems are unavailable", async () => {
    process.env.SEARCH_PHASE13_INTEGRATION_ENABLED = "true";
    process.env.SEARCH_BEHAVIORAL_RERANK_ENABLED = "true";
    process.env.SEARCH_SEMANTIC_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;

    const restaurant = location("restaurant", "restaurant", { cuisine: "Italian" });
    const result = await applyPhase13ProductionIntegration({ success: true, restaurants: [restaurant], activities: [], pairs: [], card_counts: {}, debug: {} } as any, "Italian restaurant");

    expect(result.restaurants).toHaveLength(1);
    expect((result.debug as any).phase13ProductionIntegration.fallbackUsed).toBe(true);
  });
});
