import { describe, expect, it } from "vitest";
import { applyFinalPublicActivityGuard } from "../finalActivityGuard";

const restaurant = (id: string, extra: Record<string, any> = {}) => ({
  id,
  location_type: "restaurant",
  name: `Restaurant ${id}`,
  restaurant_name: `Restaurant ${id}`,
  latitude: 40.75,
  longitude: -73.92,
  ...extra,
});

const activity = (id: string, extra: Record<string, any> = {}) => ({
  id,
  location_type: "activity",
  name: `Activity ${id}`,
  activity_name: `Activity ${id}`,
  latitude: 40.751,
  longitude: -73.921,
  ...extra,
});

describe("final public activity recovery guard", () => {
  it("preserves strongly qualified recovered karaoke activities", () => {
    const recovered = activity("karaoke", {
      activity_type: "karaoke",
      search_document: "private karaoke lounge sing along",
      recovery_generated: true,
    });
    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [restaurant("sushi")],
        activities: [recovered],
        pairs: [],
        cards: [restaurant("sushi"), recovered],
        debug: {
          normalizedIntent: {
            activityIntent: { activityTerms: ["karaoke", "karaoke lounge"] },
            wantsPairing: true,
          },
          wantsPairing: true,
        },
      },
      "Sushi in Flushing with karaoke after",
    );

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe("karaoke");
    expect(result.debug.finalPublicActivityGuard.preservedRecoveryActivities).toBe(1);
  });

  it("promotes restaurant-typed sports bars into the activity lane", () => {
    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [
          restaurant("sports", {
            search_document: "sports bar pub with TVs live sports watch party",
          }),
          restaurant("plain", { search_document: "italian restaurant" }),
        ],
        activities: [],
        pairs: [],
        cards: [],
        debug: {
          normalizedIntent: {
            activityIntent: { activityTerms: ["sports bar"] },
            wantsPairing: false,
          },
          wantsPairing: false,
        },
      },
      "Best bar to watch the Knicks game in Harlem",
    );

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      id: "sports",
      location_type: "restaurant",
      activity_type: "sports_bar",
      cross_domain_activity: true,
      result_role: "activity",
      public_activity_role: "sports_watch",
      source_location_type: "restaurant",
    });
    expect(result.restaurants.map((row: any) => row.id)).toEqual(["plain"]);
  });

  it("generates pairs around every scarce activity candidate", () => {
    const farRestaurant = restaurant("far", { latitude: 40.9, longitude: -74.1 });
    const nearRestaurant = restaurant("near", { latitude: 40.752, longitude: -73.922 });
    const hookah = activity("hookah", {
      activity_type: "hookah",
      search_document: "hookah lounge shisha",
      recovery_generated: true,
      latitude: 40.751,
      longitude: -73.921,
    });
    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [farRestaurant, nearRestaurant],
        activities: [hookah],
        pairs: [],
        cards: [],
        no_pairs_reason: "pair_count_below_recovery_threshold",
        debug: {
          normalizedIntent: {
            activityIntent: { activityTerms: ["hookah"] },
            wantsPairing: true,
          },
          wantsPairing: true,
        },
      },
      "Restaurant with hookah lounge after in Queens",
    );

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].restaurant.id).toBe("near");
    expect(result.pairs[0].activity.id).toBe("hookah");
    expect(result.no_pairs_reason).toBeNull();
  });
});
