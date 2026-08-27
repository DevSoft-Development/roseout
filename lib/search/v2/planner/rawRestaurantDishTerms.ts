import { extractRawRestaurantDishTerms } from "../../enterprise/rawDishTerms";
import type { SearchIntent } from "../../enterprise/types";

export type V2RawRestaurantDishContext = {
  required: boolean;
  mealPeriods: readonly string[];
  foodTerms: readonly string[];
  cuisineTerms: readonly string[];
  restaurantFeatures: readonly string[];
  activityCategories: readonly string[];
  activityFeatures: readonly string[];
  occasion: string | null;
  geo: {
    raw?: string | null;
    neighborhood?: string | null;
    borough?: string | null;
    city?: string | null;
    county?: string | null;
    region?: string | null;
    state?: string | null;
    requestedMarket?: string | null;
    resolvedMarket?: string | null;
  };
};

function stripV2PublicRestaurantWrapper(query: string) {
  return String(query ?? "").replace(
    /^\s*plan\s+(?:a|an)\s+restaurant\s+only\s*[.:\-]?\s*/i,
    "",
  );
}

/**
 * Reuse the enterprise raw-dish extractor at the Search V2 planner boundary.
 * Search V2 deliberately keeps its own immutable SearchPlan contract, so this
 * adapter only supplies the contextual terms the shared extractor needs to
 * distinguish a user-authored dish from geo, occasion, meal, feature, and
 * activity language.
 */
export function extractV2RawRestaurantDishTerms(
  query: string,
  context: V2RawRestaurantDishContext,
) {
  if (!context.required) return [];

  const intent: SearchIntent = {
    rawQuery: query,
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: context.activityCategories.length > 0,
    wantsPairing: false,
    restaurantIntent: {
      mealTerms: [...context.mealPeriods],
      foodTerms: [...context.foodTerms],
      cuisineTerms: [...context.cuisineTerms],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [...context.restaurantFeatures],
      negativeTerms: [],
    },
    activityIntent: {
      activityTerms: [...context.activityCategories],
      categoryTerms: [...context.activityCategories],
      vibeTerms: [],
      featureTerms: [...context.activityFeatures],
      negativeTerms: [],
    },
    geo: {
      raw: context.geo.raw ?? null,
      neighborhood: context.geo.neighborhood ?? null,
      borough: context.geo.borough ?? null,
      city: context.geo.city ?? null,
      county: context.geo.county ?? null,
      region: context.geo.region ?? null,
      state: context.geo.state ?? null,
      requestedMarket: context.geo.requestedMarket ?? null,
      resolvedMarket: context.geo.resolvedMarket ?? null,
      aliases: [],
      geoStrictness: "none",
    },
    occasion: context.occasion,
    vibe: [],
    strictness: "medium",
  };

  return extractRawRestaurantDishTerms(
    stripV2PublicRestaurantWrapper(query),
    intent,
  );
}
