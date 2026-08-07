import { describe, expect, it } from "vitest";
import { normalizeCreateSearchRequest } from "@/lib/search/normalizeCreateSearchRequest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { canonicalTaxonomy } from "../taxonomy";

const canonicalActivities = canonicalTaxonomy.filter(
  (entry) => entry.domain === "activity",
);

const MODIFIER_TAILS = [
  "in queens",
  "in manhattan",
  "tonight in queens",
  "near me",
] as const;

describe("system-wide activity evidence before sequence modifiers", () => {
  it("removes a synthetic activity suffix even when geo follows the sequence connector", () => {
    const original = "steak dinner and hookah after in queens";
    const normalized = normalizeCreateSearchRequest({
      rawQuery: `${original} activity`,
      body: {
        rawQueryBeforeNearMeStrip: original,
        selectedSearchLane: "auto",
      },
      source: "public_create",
    });

    expect(normalized.rawQuery).toBe(original);
    expect(normalized.cleanedQuery).toBe(original);
    expect(normalized.searchBody.query).toBe(original);
    expect(normalized.debugParity.queryMutationPrevented).toBe(true);
  });

  it.each(
    canonicalActivities.map((entry) => [entry.id, entry.aliases[0]] as const),
  )(
    "keeps canonical activity %s when it appears before `after in Queens`",
    async (activityId, alias) => {
      const plan = await buildSearchPlan({
        input: { query: `steak dinner and ${alias} after in queens` },
      });

      expect(plan.mode).toBe("paired_outing");
      expect(plan.restaurant.required).toBe(true);
      expect(plan.activity.required).toBe(true);
      expect(plan.activity.categories).toContain(activityId);
      expect(plan.pairing.required).toBe(true);
      expect(plan.pairing.sequence).toBe("restaurant_first");
      expect(plan.geo.borough).toBe("Queens");
    },
  );

  it.each(MODIFIER_TAILS)(
    "keeps activity evidence when the post-sequence tail is only a modifier: %s",
    async (tail) => {
      const plan = await buildSearchPlan({
        input: { query: `steak dinner and bowling after ${tail}` },
      });

      expect(plan.mode).toBe("paired_outing");
      expect(plan.activity.categories).toContain("bowling");
      expect(plan.activity.required).toBe(true);
      expect(plan.pairing.sequence).toBe("restaurant_first");
    },
  );

  it("still treats a real second-stop activity after the connector as the activity clause", async () => {
    const plan = await buildSearchPlan({
      input: { query: "steak dinner then karaoke in queens" },
    });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.activity.categories).toContain("karaoke");
    expect(plan.pairing.sequence).toBe("restaurant_first");
    expect(plan.geo.borough).toBe("Queens");
  });
});
