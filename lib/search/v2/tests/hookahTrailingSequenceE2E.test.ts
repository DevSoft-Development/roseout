import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCreateSearchRequest } from "@/lib/search/normalizeCreateSearchRequest";
import { buildSearchPlan } from "@/lib/search/v2/planner/buildSearchPlan";

const QUERY = "steak dinner and hookah lounge after";

describe("public/QA V2 trailing sequence regression", () => {
  it("removes a synthetic activity suffix and preserves the exact user query", () => {
    const normalized = normalizeCreateSearchRequest({
      rawQuery: `${QUERY} activity`,
      body: {
        rawQueryBeforeNearMeStrip: QUERY,
        selectedSearchLane: "auto",
      },
      source: "public_create",
    });

    expect(normalized.rawQuery).toBe(QUERY);
    expect(normalized.cleanedQuery).toBe(QUERY);
    expect(normalized.searchBody.query).toBe(QUERY);
    expect(normalized.debugParity.queryMutationPrevented).toBe(true);
  });

  it("routes the exact query as a canonical V2 mixed plan with hookah activity evidence", async () => {
    const plan = await buildSearchPlan({ input: { query: QUERY } });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.foods).toContain("steak");
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.categories).toContain("hookah");
    expect(plan.pairing.required).toBe(true);
    expect(plan.pairing.sequence).toBe("restaurant_first");
  });

  it("keeps Search Health QA on the exact public controller and /api/generate path", () => {
    const qaRoute = readFileSync(
      "app/api/admin/search-health/batch-run/route.ts",
      "utf8",
    );
    const publicController = readFileSync(
      "lib/search/public-api/controller.ts",
      "utf8",
    );
    const runSearch = readFileSync("lib/search/runSearch.ts", "utf8");

    expect(qaRoute).toContain("createPublicSearchController");
    expect(qaRoute).toContain('new Request("http://internal/api/generate"');
    expect(qaRoute).not.toContain("searchV2({");
    expect(publicController).toContain("normalizeCreateSearchRequest");
    expect(runSearch).toContain("if (coreAssignment.engine === \"v2\")");
    expect(runSearch).toContain("await runV2()");
  });

  it("requires truthful mixed-search outcomes and result-id logging", () => {
    const adapter = readFileSync(
      "lib/search/v2/response/compatibilityAdapter.ts",
      "utf8",
    );
    const logger = readFileSync(
      "lib/search/enterprise/searchEventLogger.ts",
      "utf8",
    );

    expect(adapter).toContain("no_pairs_reason");
    expect(adapter).toContain("activityCandidateRejections");
    expect(adapter).toContain('intentParserSource: "v2_planner"');
    expect(adapter).toContain("rawValidPairCountBeforeRender");
    expect(adapter).toContain("renderEligiblePairCount");
    expect(logger).toContain("filterResultIdsForServedCounts");
    expect(logger).toContain('mixedWithoutPair ? "no_compatible_pair"');
    expect(logger).toContain("success: mixedWithoutPair ? false");
  });
});
