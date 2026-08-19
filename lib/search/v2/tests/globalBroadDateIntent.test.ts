import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";

const broadDateQueries = [
  "I want to go on a date in Brooklyn",
  "plan a date in Queens",
  "take my girlfriend on a date in Long Island",
  "looking for a date near Jersey City",
  "we want to go on a date in Westchester",
  "book a date in Stamford",
] as const;

describe("Search Core V2 broad date intent", () => {
  it.each(broadDateQueries)(
    "retrieves restaurant and activity lanes globally when selectedLane is omitted: %s",
    async (query) => {
      const plan = await buildSearchPlan({
        input: { query },
      });

      expect(plan.mode).toBe("paired_outing");
      expect(plan.restaurant.required).toBe(true);
      expect(plan.activity.required).toBe(true);
      expect(plan.pairing.required).toBe(false);
      expect(plan.fallback.allowPartial).toBe(true);
      expect(plan.occasion).toBe("date_night");
    },
  );

  it("treats explicit auto lane the same as an omitted lane", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "I want to go on a date in Brooklyn",
        selectedLane: "auto",
      },
    });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(false);
  });

  it("keeps an explicit date restaurant request restaurant-only", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "romantic restaurant for a date in Brooklyn",
        selectedLane: "auto",
      },
    });

    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    expect(plan.pairing.required).toBe(false);
  });

  it("keeps explicit date activity wording activity-only", async () => {
    const plan = await buildSearchPlan({
      input: { query: "date activities in Queens", selectedLane: "auto" },
    });

    expect(plan.restaurant.required).toBe(false);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(false);
  });
});
