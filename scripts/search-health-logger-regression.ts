import * as assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

async function main() {
  const { shouldLogSearchHealthEvent, classifySearchHealthEvent, buildSearchHealthEventPayload } = await import("../lib/search/enterprise/searchHealthLogger");

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


  assert.deepEqual(
    classifySearchHealthEvent({ source: "admin_test_event", forceLog: true }),
    { eventType: "test_event", severity: "info", eventLabel: "Admin test event" },
    "admin test events should classify as informational test events",
  );

  assert.equal(
    classifySearchHealthEvent({ ...cleanPublicSearch, errors: ["boom"] }).eventType,
    "search_error",
    "errors should classify as search_error",
  );

  const walkingNoPairPayload = buildSearchHealthEventPayload({
    source: "public_create_search",
    rawQuery: "steak dinner and rooftop drinks 1 minute walk apart in Queens",
    result: { restaurants: Array.from({ length: 6 }, (_, id) => ({ id })), activities: Array.from({ length: 12 }, (_, id) => ({ id })), pairs: [], render_mode: "mixed_pairs" },
    debug: { normalizedIntent: { needsRestaurant: true, needsActivity: true, wantsPairing: true, pairingPreference: { distanceMode: "walking", maxPairWalkingMinutes: 1 } }, distanceMode: "walking", maxPairWalkingMinutes: 1, pairCandidatesEvaluated: 72, validPairCountBeforeRender: 0 },
  });
  assert.equal(walkingNoPairPayload.event_type, "no_valid_pairs");
  assert.equal(walkingNoPairPayload.severity, "warning");
  assert.equal(walkingNoPairPayload.event_label, "No valid pairs within walking distance");
  assert.equal(walkingNoPairPayload.no_pairs_reason, "no_pairs_within_walking_distance");

  assert.equal(
    classifySearchHealthEvent({ result: { restaurants: [{}], activities: [], pairs: [] }, debug: { normalizedIntent: { needsRestaurant: true, needsActivity: true } } }).eventType,
    "no_activity_results",
    "no activity searches should classify correctly when restaurants exist",
  );

  assert.equal(
    classifySearchHealthEvent({ result: { restaurants: [], activities: [{}], pairs: [] }, debug: { normalizedIntent: { needsRestaurant: true, needsActivity: true } } }).eventType,
    "no_restaurant_results",
    "no restaurant searches should classify correctly",
  );

  assert.deepEqual(
    classifySearchHealthEvent({ result: { restaurants: [{}], activities: [{}], pairs: [{}] }, debug: { normalizedIntent: { needsRestaurant: true, needsActivity: true, wantsPairing: true }, distanceMode: "walking", maxPairWalkingMinutes: 2 } }),
    { eventType: "low_pair_count", severity: "info", eventLabel: "Strict walking search with limited pairs" },
    "strict walking low pair searches should classify as info",
  );

  assert.equal(
    classifySearchHealthEvent({ result: { restaurants: [{}], activities: [{}], pairs: [{}] }, debug: { performance: { total_ms: 3501, speed_status: "slow" } } }).eventType,
    "slow_search",
    "slow searches should classify correctly",
  );
}

main()
  .then(() => console.log("search health logger regression checks passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
