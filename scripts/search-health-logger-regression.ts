import * as assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

async function main() {
  const { shouldLogSearchHealthEvent } = await import("../lib/search/enterprise/searchHealthLogger");

  const cleanPublicSearch = {
    source: "public_create_search",
    result: {
      success: true,
      restaurants: [{ id: "r1" }],
      activities: [{ id: "a1" }],
      pairs: [{ id: "p1" }],
      render_mode: "mixed_pairs",
    },
    debug: {
      normalizedIntent: { needsRestaurant: true, needsActivity: true, wantsPairing: true },
      performance: { total_ms: 600, speed_status: "fast" },
      pair_count: 1,
      extremeWalkingRoutesRejected: 0,
      invalidWalkingRoutesHiddenFromDisplay: 0,
      suppressedLowQualityPairCount: 0,
    },
    debugMode: false,
  };

  assert.equal(shouldLogSearchHealthEvent(cleanPublicSearch), false, "clean public search should not log");

  assert.equal(
    shouldLogSearchHealthEvent({
      ...cleanPublicSearch,
      result: { ...cleanPublicSearch.result, pairs: [], render_mode: "mixed_pairs" },
      debug: { ...cleanPublicSearch.debug, pair_count: 0 },
    }),
    true,
    "public pair_count 0 should log",
  );

  assert.equal(
    shouldLogSearchHealthEvent({
      ...cleanPublicSearch,
      debug: { ...cleanPublicSearch.debug, noPairsReason: "no_pairs_within_walking_distance" },
    }),
    true,
    "public no_pairs_reason should log",
  );

  assert.equal(
    shouldLogSearchHealthEvent({
      ...cleanPublicSearch,
      debug: { ...cleanPublicSearch.debug, performance: { total_ms: 3501, speed_status: "slow" } },
    }),
    true,
    "public slow search should log",
  );

  assert.equal(
    shouldLogSearchHealthEvent({
      ...cleanPublicSearch,
      source: "admin_search_lab",
      debugMode: true,
    }),
    true,
    "admin search lab debug run should log even if successful",
  );

  assert.equal(
    shouldLogSearchHealthEvent({
      ...cleanPublicSearch,
      source: "beta_tester_search",
      betaTesterId: "tester-1",
      betaAssignmentId: "assignment-1",
      betaFeedbackSubmitted: true,
    }),
    true,
    "beta tester search with feedback should log",
  );
}

main()
  .then(() => console.log("search health logger regression checks passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
