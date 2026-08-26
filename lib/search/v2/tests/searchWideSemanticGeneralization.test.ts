import { describe, expect, it } from "vitest";
import { activities, foods, matchTaxonomy } from "../taxonomy";
import { rewriteSpecificTaxonomyPhrases } from "../planner/taxonomySpecificity";
import { detectVenueRelationship, extractNegativeConstraints } from "../planner/languageUnderstanding";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";
import { resolveFallback } from "../fallback/resolveFallback";

function scored(id: string, score = 50) {
  return {
    candidate: {
      candidate: {
        location: { id, name: id },
        geoMatch: { tier: "exact_locality", scopeLevel: "borough" },
      },
    },
    selectedRole: "general_activity",
    scores: { total: score },
    reasons: [],
  } as any;
}

describe("search-wide semantic generalization", () => {
  it("prefers a specific activity phrase over a contained generic activity", () => {
    const rewritten = rewriteSpecificTaxonomyPhrases("Family dinner and mini golf in Brooklyn");
    const matches = matchTaxonomy(rewritten, activities);

    expect(matches).toContain("mini_golf");
    expect(matches).not.toContain("golf");
  });

  it("still recognizes the generic activity when it is explicitly requested", () => {
    const rewritten = rewriteSpecificTaxonomyPhrases("indoor golf simulator near me");
    expect(matchTaxonomy(rewritten, activities)).toContain("golf");
  });

  it("uses phrase specificity for food terms too", () => {
    const rewritten = rewriteSpecificTaxonomyPhrases("a place with chicken wings");
    const matches = matchTaxonomy(rewritten, foods);

    expect(matches).toContain("wings");
    expect(matches).not.toContain("chicken");
  });

  it("extracts plural and multi-option activity exclusions from the taxonomy", () => {
    const negatives = extractNegativeConstraints("Dinner and something fun, but no museums or arcades");

    expect(negatives.activity).toEqual(expect.arrayContaining(["museum", "arcade"]));
  });

  it("extracts restaurant exclusions without a hard-coded food list", () => {
    const negatives = extractNegativeConstraints("Find dinner but no seafood or sushi");

    expect(negatives.restaurant).toEqual(expect.arrayContaining(["seafood", "sushi"]));
  });

  it("generalizes same-venue language while preserving sequential requests", () => {
    expect(detectVenueRelationship("Find a restaurant in Queens with food and live music").type).toBe("same_venue_required");
    expect(detectVenueRelationship("A place to eat and do karaoke").type).toBe("same_venue_required");
    expect(detectVenueRelationship("A place to eat after karaoke").type).toBe("sequential");
    expect(detectVenueRelationship("Dinner and live music in Queens").type).toBe("any");
  });

  it("searches the whole activity domain for open-ended activity requests", () => {
    const requests = buildRetrievalRequests({
      occasion: null,
      restaurant: { required: false, cuisines: [], foods: [], features: [], mealPeriods: [], exclusions: [] },
      activity: { required: true, categories: [], features: [], exclusions: [] },
      geo: { market: "NYC", state: "NY", county: null, borough: "Queens", city: null, neighborhood: null, latitude: null, longitude: null, radiusMiles: 8 },
    } as any);
    const request = requests.find((item) => item.desiredRole === "general_activity");

    expect(request).toBeTruthy();
    expect(request?.categories).toEqual([]);
    expect(request?.retrievalTerms).toEqual([]);
  });

  it("finds same-venue candidates outside the public top-20 lane caps", async () => {
    const restaurants = Array.from({ length: 24 }, (_, index) => scored(`restaurant-${index}`, 100 - index));
    const activities = Array.from({ length: 24 }, (_, index) => scored(`activity-${index}`, 100 - index));
    restaurants.push(scored("dual-role-target", 10));
    activities.push(scored("dual-role-target", 11));

    const result = await resolveFallback({
      plan: {
        rawQuery: "a restaurant where we can eat and listen to live music",
        mode: "same_venue",
        occasion: null,
        restaurant: { required: true, cuisines: [], foods: [], features: [], mealPeriods: [] },
        activity: { required: true, categories: ["live_music"], features: [] },
        pairing: { required: true, sameVenuePreferred: true, sameVenueRequired: true },
        fallback: { allowNearbyPair: false, allowPartial: true },
      } as any,
      scored: { restaurants, activities },
      pairs: [],
      retrievedCount: restaurants.length + activities.length,
      trace: { decisions: [], fallback: { used: false, reason: null } } as any,
    });

    expect(result.requestFulfilled).toBe(true);
    expect(result.sameVenueResults.map((item) => item.candidate.candidate.location.id)).toContain("dual-role-target");
  });
});
