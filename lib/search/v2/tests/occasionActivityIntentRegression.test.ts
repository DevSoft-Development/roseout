import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";

describe("occasion and drinks activity intent", () => {
  it.each([
    "girls night with drinks in Brooklyn",
    "quiet cocktails and something relaxing in Queens",
    "family outing in Astoria",
  ])("routes %s to a coherent activity lane", async (query) => {
    const plan = await buildSearchPlan({ input: { query } });

    expect(plan.activity.required).toBe(true);
    expect(plan.mode).toBe("activity_only");
    expect(plan.pairing.required).toBe(false);
  });

  it("marks family outing as family-friendly intent", async () => {
    const plan = await buildSearchPlan({ input: { query: "family outing in Forest Hills" } });
    expect(plan.audience.familyFriendly).toBe(true);
    expect(plan.occasion).toBe("family_outing");
  });
});
