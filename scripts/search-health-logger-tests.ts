import { readFileSync } from "node:fs";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

async function main() {
  const { shouldLogSearchHealthEvent, buildSearchHealthEventPayload } = await import("../lib/search/enterprise/searchHealthLogger");

  function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
  }

  const baseDebug = {
    normalizedIntent: {
      rawQuery: "dinner and bowling",
      needsActivity: true,
      wantsPairing: true,
      pairingPreference: { distanceMode: "walking" },
    },
    performance: { total_ms: 900, speed_status: "fast" },
  };

  assert(
    shouldLogSearchHealthEvent({
      source: "public_create_search",
      result: { restaurants: [{}], activities: [{}], pairs: [], render_mode: "partial_mixed" },
      debug: baseDebug,
    }),
    "no valid pair searches should be logged",
  );

  assert(
    shouldLogSearchHealthEvent({
      source: "public_create_search",
      result: { restaurants: [{}], activities: [{}], pairs: [{}] },
      debug: { ...baseDebug, performance: { total_ms: 5501, speed_status: "slow" } },
    }),
    "very slow searches should be logged",
  );

  assert(
    shouldLogSearchHealthEvent({
      source: "public_create_search",
      result: { restaurants: [{}], activities: [{}], pairs: [{}] },
      errors: ["boom"],
      debug: baseDebug,
    }),
    "searches with errors should be logged",
  );

  assert(
    !shouldLogSearchHealthEvent({
      source: "public_create_search",
      result: { restaurants: [{}], activities: [{}], pairs: [{}], render_mode: "mixed_pairs" },
      debug: baseDebug,
    }),
    "clean successful public searches should not be logged",
  );

  assert(
    !shouldLogSearchHealthEvent({
      source: "public_create_search",
      result: { restaurants: [{}], activities: [], pairs: [], render_mode: "restaurant_only" },
      debug: {
        ...baseDebug,
        normalizedIntent: { rawQuery: "date night in queens", needsRestaurant: true, needsActivity: false, wantsPairing: false },
        performance: { total_ms: 4000, speed_status: "slow" },
      },
    }),
    "healthy public searches around 4000ms should not be logged to search health",
  );

  const payload = buildSearchHealthEventPayload({
    source: "admin_search_lab",
    result: { restaurants: [{}], activities: [{}], pairs: [{}] },
    debug: {
      ...baseDebug,
      rejectedPairs: Array.from({ length: 30 }, (_, index) => ({ index })),
      restaurantQualityScorePreview: Array.from({ length: 20 }, (_, index) => ({ index })),
      activityQualityScorePreview: Array.from({ length: 20 }, (_, index) => ({ index })),
      pairQualityScorePreview: Array.from({ length: 20 }, (_, index) => ({ index })),
    },
  });

  assert(Array.isArray((payload.debug as any).rejectedPairs) && (payload.debug as any).rejectedPairs.length === 25, "rejected pair previews should be capped at 25");
  assert((payload.debug as any).restaurantQualityScorePreview.length === 12, "restaurant previews should be capped at 12");
  assert((payload.debug as any).activityQualityScorePreview.length === 12, "activity previews should be capped at 12");
  assert((payload.debug as any).pairQualityScorePreview.length === 12, "pair previews should be capped at 12");

  const adminRoute = readFileSync("app/api/admin/search-health/route.ts", "utf8");
  assert(adminRoute.includes("requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth)"), "admin search health API should require admin access");

  console.log("search health logger tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
