import { describe, expect, it } from "vitest";

import {
  candidateMatchesExplicitActivityConstraint,
  resolveExplicitActivityConstraint,
} from "@/lib/search/enterprise/explicitActivityConstraint";
import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";
import { applyFinalPublicActivityGuard } from "../finalActivityGuard";

const explicitActivityEntries = canonicalTaxonomy.filter(
  (entry) => entry.domain === "activity" || entry.domain === "nightlife",
);

describe("search-wide explicit activity constraints", () => {
  it("uses the longest compound activity phrase instead of broad overlapping aliases", () => {
    const constraint = resolveExplicitActivityConstraint(
      "hookah lounge and restaurant in Forest Hills",
    );

    expect(constraint.applied).toBe(true);
    expect(constraint.requestedIds).toEqual(["hookah"]);
    expect(constraint.matchedAliases).toEqual(["hookah lounge"]);
  });

  it.each(
    explicitActivityEntries.map((entry) => [entry.id, entry.aliases[0]] as const),
  )("hard-constrains explicit canonical activity %s", (activityId, alias) => {
    const constraint = resolveExplicitActivityConstraint(
      `restaurant and ${alias} in Queens`,
    );

    expect(constraint.applied).toBe(true);
    expect(constraint.requestedIds).toContain(activityId);
    expect(
      candidateMatchesExplicitActivityConstraint(
        {
          id: `${activityId}-candidate`,
          location_type: "activity",
          activity_type: activityId,
          primary_category: activityId,
        } as any,
        constraint,
      ),
    ).toBe(true);
  });

  it("does not let broad nightlife or entertainment tags substitute bowling for hookah", () => {
    const constraint = resolveExplicitActivityConstraint(
      "hookah and restaurant in Forest Hills",
    );

    expect(
      candidateMatchesExplicitActivityConstraint(
        {
          id: "bowling",
          name: "Forest Hills Bowling Center",
          location_type: "activity",
          activity_type: "bowling",
          primary_category: "bowling alley",
          semantic_tags: ["nightlife", "entertainment", "games"],
          search_document: "bowling lanes nightlife entertainment games",
        } as any,
        constraint,
      ),
    ).toBe(false);
  });

  it("filters a wrong paired activity even when normalized intent became broad", () => {
    const hookah = {
      id: "hookah",
      name: "Forest Hills Hookah Lounge",
      location_type: "activity",
      activity_type: "hookah",
      primary_category: "hookah lounge",
      latitude: 40.719,
      longitude: -73.845,
    };
    const bowling = {
      id: "bowling",
      name: "Forest Hills Bowling Center",
      location_type: "activity",
      activity_type: "bowling",
      primary_category: "bowling alley",
      semantic_tags: ["nightlife", "entertainment", "games"],
      latitude: 40.72,
      longitude: -73.846,
    };
    const restaurant = {
      id: "restaurant",
      name: "Forest Hills Restaurant",
      location_type: "restaurant",
      latitude: 40.7195,
      longitude: -73.8455,
    };

    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [restaurant],
        activities: [bowling, hookah],
        pairs: [
          { restaurant, activity: bowling, pairScore: 99 },
          { restaurant, activity: hookah, pairScore: 90 },
        ],
        cards: [bowling, hookah],
        normalizedIntent: {
          activityIntent: {
            activityTerms: ["nightlife", "games", "entertainment"],
            categoryTerms: ["nightlife"],
          },
        },
        debug: {
          wantsPairing: true,
          normalizedIntent: {
            wantsPairing: true,
            activityIntent: {
              activityTerms: ["nightlife", "games", "entertainment"],
              categoryTerms: ["nightlife"],
            },
          },
        },
      },
      "hookah and restaurant in Forest Hills",
    );

    expect(result.activities.map((row: any) => row.id)).toEqual(["hookah"]);
    expect(result.pairs.map((pair: any) => pair.activity.id)).toEqual(["hookah"]);
    expect(result.cards.map((row: any) => row.id)).toEqual(["hookah"]);
    expect(result.debug.finalPublicActivityGuard).toMatchObject({
      source: "raw_query_explicit_activity_constraint",
      explicitConstraintApplied: true,
      explicitRequestedActivityIds: ["hookah"],
      removedActivities: 1,
      removedPairs: 1,
    });
  });

  it("applies the same no-substitution rule to other named activities", () => {
    const bowling = {
      id: "bowling",
      name: "Bowling Center",
      location_type: "activity",
      activity_type: "bowling",
      primary_category: "bowling alley",
    };
    const miniGolf = {
      id: "mini-golf",
      name: "Mini Golf Club",
      location_type: "activity",
      activity_type: "mini_golf",
      primary_category: "mini golf",
    };

    const result = applyFinalPublicActivityGuard(
      {
        restaurants: [],
        activities: [bowling, miniGolf],
        pairs: [],
        cards: [bowling, miniGolf],
        debug: {},
      },
      "mini golf in Nassau County",
    );

    expect(result.activities.map((row: any) => row.id)).toEqual(["mini-golf"]);
    expect(result.cards.map((row: any) => row.id)).toEqual(["mini-golf"]);
  });
});
