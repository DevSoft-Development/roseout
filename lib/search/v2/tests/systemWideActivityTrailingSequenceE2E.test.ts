import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCreateSearchRequest } from "@/lib/search/normalizeCreateSearchRequest";
import { buildSearchPlan } from "@/lib/search/v2/planner/buildSearchPlan";
import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";

const CONNECTORS = ["after", "then", "followed by", "before"] as const;
const canonicalActivities = canonicalTaxonomy.filter((entry) => entry.domain === "activity");
const nightlifeActivityCases = [
  { phrase: "cocktail lounge", expected: "lounge" },
  { phrase: "nightclub", expected: "nightlife" },
  { phrase: "dance club", expected: "nightlife" },
  { phrase: "rooftop lounge", expected: "lounge" },
] as const;

describe("system-wide public/QA V2 trailing sequence activity regression", () => {
  it.each(CONNECTORS)("preserves the authoritative query when a synthetic activity suffix follows trailing %s", (connector) => {
    const query = `steak dinner and bowling ${connector}`;
    const normalized = normalizeCreateSearchRequest({
      rawQuery: `${query} activity`,
      body: { rawQueryBeforeNearMeStrip: query, selectedSearchLane: "auto" },
      source: "public_create",
    });

    expect(normalized.rawQuery).toBe(query);
    expect(normalized.cleanedQuery).toBe(query);
    expect(normalized.searchBody.query).toBe(query);
    expect(normalized.debugParity.queryMutationPrevented).toBe(true);
  });

  it.each(canonicalActivities.map((entry) => [entry.id, entry.aliases[0]] as const))(
    "keeps canonical activity %s as an activity-domain requirement before a trailing connector",
    async (activityId, alias) => {
      const query = `steak dinner and ${alias} after`;
      const plan = await buildSearchPlan({ input: { query } });

      expect(plan.mode).toBe("paired_outing");
      expect(plan.restaurant.required).toBe(true);
      expect(plan.restaurant.foods).toContain("steak");
      expect(plan.activity.required).toBe(true);
      expect(plan.activity.categories).toContain(activityId);
      expect(plan.pairing.required).toBe(true);
      expect(plan.pairing.sequence).toBe("restaurant_first");
    },
  );

  it.each(nightlifeActivityCases)(
    "keeps nightlife activity phrase $phrase on the activity lane before a trailing connector",
    async ({ phrase, expected }) => {
      const plan = await buildSearchPlan({ input: { query: `steak dinner and ${phrase} after` } });

      expect(plan.mode).toBe("paired_outing");
      expect(plan.activity.required).toBe(true);
      expect(plan.activity.categories).toContain(expected);
      expect(plan.pairing.required).toBe(true);
      expect(plan.pairing.sequence).toBe("restaurant_first");
    },
  );

  it("keeps Search Health QA on the exact public controller and /api/generate path", () => {
    const qaRoute = readFileSync("app/api/admin/search-health/batch-run/route.ts", "utf8");
    const publicController = readFileSync("lib/search/public-api/controller.ts", "utf8");
    const runSearch = readFileSync("lib/search/runSearch.ts", "utf8");

    expect(qaRoute).toContain("createPublicSearchController");
    expect(qaRoute).toContain('new Request("http://internal/api/generate"');
    expect(qaRoute).not.toContain("searchV2({");
    expect(publicController).toContain("normalizeCreateSearchRequest");
    expect(runSearch).toContain('if (coreAssignment.engine === "v2")');
    expect(runSearch).toContain("await runV2()");
  });

  it("requires truthful mixed-search outcomes, rejection traces, and result-id logging system-wide", () => {
    const adapter = readFileSync("lib/search/v2/response/compatibilityAdapter.ts", "utf8");
    const logger = readFileSync("lib/search/enterprise/searchEventLogger.ts", "utf8");

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
