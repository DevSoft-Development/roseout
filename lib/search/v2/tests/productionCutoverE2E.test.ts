import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";
import { assignSearchCoreVersion, type SearchCoreConfig } from "../../searchCoreConfig";

const v2Config: SearchCoreConfig = {
  enabled: true,
  mode: "v2",
  rolloutPercentage: 100,
  shadowEnabled: false,
  killSwitch: false,
  internalOnly: false,
  source: "environment",
  updatedAt: null,
  updatedBy: null,
};

function responseFixture() {
  const restaurant = { id: "r1", name: "Italian Restaurant" } as any;
  const activity = { id: "a1", name: "Jazz Club" } as any;
  return {
    version: "public-search-v2",
    success: true,
    requestFulfilled: true,
    partialResults: false,
    requestId: "req-v2",
    requestedMode: "paired_outing",
    resolvedMode: "paired_outing",
    primaryDomain: "mixed",
    primary_domain: "mixed",
    displayMode: "pairs",
    searchPlan: {},
    restaurants: [restaurant],
    activities: [activity],
    sameVenueResults: [],
    pairs: [{ restaurant, activity, distanceMiles: 0.3, walkingMinutes: 6, score: 95, geoTier: "exact_locality", isFallbackPair: false, matchReasons: [], whyMatched: "", why_it_matched: "" }],
    builder: { enabled: true, restaurants: [restaurant], activities: [activity], selectedRestaurantId: null, selectedActivityId: null },
    anchor: { requested: false, resolved: false, rawName: null, relationship: null, location: null },
    anchorResolution: { status: "not_requested", requested: false, rawName: null, resolvedLocationId: null, requiresClarification: false, candidateCount: 0, candidates: [], diagnostics: null },
    outcome: undefined,
    geoResolution: null,
    counts: { restaurantCandidates: 1, activityCandidates: 1, dualRoleCandidates: 0, restaurantCards: 1, activityCards: 1, builderRestaurantCards: 1, builderActivityCards: 1, uniquePairRestaurants: 1, uniquePairActivities: 1, sameVenueCards: 0, pairs: 1, displayedResults: 1 },
    fallback: { used: false, reason: null },
    retrieval: { profileCandidateCount: 2, legacyCandidateCount: 0, servedSource: "profile", fallbackDomains: [], legacyFallbackUsed: false },
    message: "We found options matching your outing.",
    timing: {},
    ml: { enabled: false, modelVersion: null, rankingVariant: "control", configuredVariant: null, appliedVariant: "control", applied: false, shadowOnly: false, rolloutBucket: null, reason: "ML ranking was disabled." },
    debug: {},
  } as any;
}

describe("V2 production cutover", () => {
  it("assigns every normal public request to v2", () => {
    const assignment = assignSearchCoreVersion({ config: v2Config, requestId: "public-request" });
    expect(assignment.engine).toBe("v2");
    expect(assignment.percentage).toBe(100);
    expect(assignment.reason).toBe("v2_primary");
  });

  it("retains legacy only as an explicit emergency rollback", () => {
    const assignment = assignSearchCoreVersion({
      config: { ...v2Config, mode: "legacy", killSwitch: true },
      requestId: "rollback-request",
    });
    expect(assignment.engine).toBe("legacy");
    expect(assignment.reason).toBe("emergency_rollback");
  });

  it("keeps restaurant plus activity searches paired while preferring same venue", async () => {
    const plan = await buildSearchPlan({
      input: { query: "Romantic Italian dinner with live jazz in Manhattan tonight", requestId: "intent-test" },
    });
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(true);
    expect(plan.pairing.sameVenuePreferred).toBe(true);
    expect(plan.pairing.sameVenueRequired).toBe(false);
    expect(plan.fallback.allowNearbyPair).toBe(true);
  });

  it("keeps pairs, restaurants, and activities in the adapted public response", () => {
    const result = adaptV2ResponseToCurrentPublicContract(responseFixture());
    expect(result.assignedEngine).toBe("v2");
    expect(result.renderMode).toBe("mixed_results");
    expect(result.pairs).toHaveLength(1);
    expect(result.restaurants).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.cards).toHaveLength(3);
    expect(result.result_count).toBe(3);
  });

  it("routes batch QA through the public controller and records v2 assignment", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/search-health/batch-run/route.ts"),
      "utf8",
    );
    expect(source).toContain("createPublicSearchController");
    expect(source).toContain('new Request("http://internal/api/generate"');
    expect(source).not.toContain("searchCoreOverride");
    expect(source).not.toContain("runOutingSearch");
    expect(source).toContain("assignedEngine");
    expect(source).toContain('executionPath: "/api/generate"');
  });
});
