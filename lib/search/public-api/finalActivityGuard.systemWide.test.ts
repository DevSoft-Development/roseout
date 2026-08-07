import { describe, expect, it } from "vitest";
import {
  applyFinalPublicActivityGuard,
  resolveFinalPublicActivityTerms,
} from "./finalActivityGuard";
import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";

const canonicalActivities = canonicalTaxonomy.filter(
  (entry) => entry.domain === "activity",
);

describe("final public activity guard system-wide", () => {
  it("reads top-level V2 activity terms and search-plan categories", () => {
    const result = {
      normalizedIntent: {
        activityTerms: ["live music"],
      },
      searchV2: {
        searchPlan: {
          activity: {
            categories: ["live_music"],
          },
        },
      },
    };

    expect(resolveFinalPublicActivityTerms(result, "dinner and live music after")).toEqual(
      expect.arrayContaining(["live music"]),
    );
  });

  it.each(
    canonicalActivities.map((entry) => [entry.id, entry.aliases[0]] as const),
  )(
    "derives canonical activity %s from query text when normalized intent is sparse",
    (activityId, alias) => {
      const terms = resolveFinalPublicActivityTerms(
        { normalizedIntent: { activityTerms: [] } },
        `steak dinner and ${alias} after in queens`,
      );

      expect(terms.length).toBeGreaterThan(0);
      expect(terms).toEqual(
        expect.arrayContaining([activityId.replaceAll("_", " ")]),
      );
    },
  );

  it("does not collapse multiple qualifying hookah locations to one", () => {
    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [],
        activities: [
          {
            id: "jasmin",
            name: "Jasmin Lounge",
            location_type: "activity",
            activity_type: "hookah",
            tags: ["hookah lounge"],
          },
          {
            id: "al-nar",
            name: "Al Nar Hookah Lounge",
            location_type: "activity",
            activity_type: "hookah",
            tags: ["hookah", "lounge"],
          },
          {
            id: "sands",
            name: "Sands of Persia Lounge & Restaurant",
            location_type: "activity",
            activity_type: "hookah",
            description: "Hookah and shisha lounge",
          },
          {
            id: "arcade",
            name: "Unrelated Arcade",
            location_type: "activity",
            activity_type: "arcade",
          },
        ],
        pairs: [],
        cards: [],
        normalizedIntent: {
          activityTerms: [],
          wantsPairing: true,
        },
        debug: {},
      },
      "steak dinner and hookah after in queens",
    );

    expect(result.activities.map((row: any) => row.id)).toEqual([
      "jasmin",
      "al-nar",
      "sands",
    ]);
    expect(result.debug.finalPublicActivityGuard.baseActivityCount).toBe(4);
    expect(result.debug.finalPublicActivityGuard.qualifiedActivityCount).toBe(3);
    expect(result.debug.finalPublicActivityGuard.source).toBe(
      "canonical_taxonomy_query_fallback",
    );
  });
});
