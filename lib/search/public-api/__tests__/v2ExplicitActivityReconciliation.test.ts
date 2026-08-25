import { describe, expect, it } from "vitest";

import { applyFinalPublicActivityGuard } from "../finalActivityGuard";

function hookahActivity(id: string, name: string, neighborhood: string) {
  return {
    id,
    name,
    activity_name: name,
    location_type: "activity",
    activity_type: "hookah",
    primary_category: "hookah lounge",
    google_types: ["hookah_bar", "bar"],
    neighborhood,
  };
}

describe("V2 explicit activity public-contract reconciliation", () => {
  it("keeps exact locality results first and restores eligible nearby-radius activities", () => {
    const exactOne = hookahActivity("exact-1", "Forest Hills Hookah One", "Forest Hills");
    const exactTwo = hookahActivity("exact-2", "Forest Hills Hookah Two", "Forest Hills");
    const nearbyOne = hookahActivity("nearby-1", "Nearby Hookah One", "Richmond Hill");
    const nearbyTwo = hookahActivity("nearby-2", "Nearby Hookah Two", "Maspeth");
    const nearbyThree = hookahActivity("nearby-3", "Nearby Hookah Three", "Ozone Park");

    const result = applyFinalPublicActivityGuard(
      {
        searchCoreVersion: "v2",
        assignedEngine: "v2",
        restaurants: [],
        // Reproduces the production regression: the outer compatibility payload
        // was narrowed to the two exact-locality cards while Search Core V2 had
        // already approved five activity cards inside the 3-mile geo policy.
        activities: [exactOne, exactTwo],
        cards: [exactOne, exactTwo],
        pairs: [],
        searchV2: {
          activities: [exactOne, exactTwo, nearbyOne, nearbyTwo, nearbyThree],
          searchPlan: {
            activity: { categories: ["hookah"] },
          },
        },
        debug: {
          normalizedIntent: {
            primaryDomain: "activity",
            activityTerms: ["hookah"],
            wantsPairing: false,
          },
        },
      },
      "hookah in Forest Hills",
    );

    expect(result.activities.map((row: any) => row.id)).toEqual([
      "exact-1",
      "exact-2",
      "nearby-1",
      "nearby-2",
      "nearby-3",
    ]);
    expect(result.cards.map((row: any) => row.id)).toEqual([
      "exact-1",
      "exact-2",
      "nearby-1",
      "nearby-2",
      "nearby-3",
    ]);
    expect(result.debug.finalPublicActivityGuard).toMatchObject({
      explicitConstraintApplied: true,
      topLevelActivityCountBeforeV2Reconciliation: 2,
      v2ActivityCandidateCount: 5,
      v2ActivityReconciliationUsed: true,
      baseActivityCount: 5,
      qualifiedActivityCount: 5,
      removedActivities: 0,
    });
  });

  it("does not restore the V2 superset for a non-explicit activity query", () => {
    const exactOne = hookahActivity("exact-1", "Forest Hills Hookah One", "Forest Hills");
    const nearbyOne = hookahActivity("nearby-1", "Nearby Hookah One", "Richmond Hill");

    const result = applyFinalPublicActivityGuard(
      {
        searchCoreVersion: "v2",
        assignedEngine: "v2",
        restaurants: [],
        activities: [exactOne],
        cards: [exactOne],
        pairs: [],
        searchV2: {
          activities: [exactOne, nearbyOne],
          searchPlan: { activity: { categories: [] } },
        },
        debug: {},
      },
      "something fun in Forest Hills",
    );

    expect(result.activities.map((row: any) => row.id)).toEqual(["exact-1"]);
    expect(result.debug.finalPublicActivityGuard.v2ActivityReconciliationUsed).toBe(false);
  });
});