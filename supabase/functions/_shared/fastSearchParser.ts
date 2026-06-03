import { normalizeSearchQuery } from "./normalizeQuery.ts";

const STEAK_TERMS = ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "churrasco", "brazilian steakhouse"];
const BOWLING_TERMS = ["bowling", "bowling alley", "bowling lounge", "bowling lanes", "lanes"];
const MEAL_TERMS = ["dinner", "brunch", "lunch", "breakfast", "restaurant", "food", "eat"];
const ACTIVITY_TERMS = ["bowling", "hookah", "hookah lounge", "lounge", "cocktails", "drinks", "bar", "rooftop", "arcade", "karaoke", "spa", "massage", "museum", "comedy", "jazz", "live music", "paint and sip", "escape room"];

const GEO: Record<string, any> = {
  astoria: { raw: "Astoria", neighborhood: "Astoria", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7644, longitude: -73.9235, radiusMiles: 3, geoStrictness: "strict", aliases: ["Astoria", "astoria", "Queens", "New York", "Queens County", "NY"] },
  "long island city": { raw: "Long Island City", neighborhood: "Long Island City", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7447, longitude: -73.9485, radiusMiles: 3, geoStrictness: "strict", aliases: ["Long Island City", "LIC", "Queens", "New York", "NY"] },
  flushing: { raw: "Flushing", neighborhood: "Flushing", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7675, longitude: -73.8331, radiusMiles: 3, geoStrictness: "strict", aliases: ["Flushing", "Queens", "New York", "NY"] },
  brooklyn: { raw: "Brooklyn", city: "New York", borough: "Brooklyn", county: "Kings County", state: "NY", latitude: 40.6782, longitude: -73.9442, radiusMiles: 5, geoStrictness: "moderate", aliases: ["Brooklyn", "Kings County", "New York", "NY"] },
  queens: { raw: "Queens", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7282, longitude: -73.7949, radiusMiles: 6, geoStrictness: "moderate", aliases: ["Queens", "Queens County", "New York", "NY"] },
  manhattan: { raw: "Manhattan", city: "New York", borough: "Manhattan", county: "New York County", state: "NY", latitude: 40.7831, longitude: -73.9712, radiusMiles: 5, geoStrictness: "moderate", aliases: ["Manhattan", "New York", "NY"] },
};

function includesAny(query: string, terms: string[]) {
  return terms.filter((term) => query.includes(term));
}

function detectGeo(query: string) {
  const keys = Object.keys(GEO).sort((a, b) => b.length - a.length);
  const key = keys.find((entry) => query.includes(entry));
  return key ? GEO[key] : null;
}

export function fastParseSearchIntent(rawQuery: string, options: Record<string, unknown> = {}) {
  const query = normalizeSearchQuery(rawQuery);
  const mealTerms = includesAny(query, MEAL_TERMS).filter((t) => t !== "restaurant" && t !== "food" && t !== "eat");
  const foundSteak = includesAny(query, ["steak", "steakhouse", "steak house"]);
  const foundActivities = includesAny(query, ACTIVITY_TERMS);
  const hasBowling = query.includes("bowling");
  const geo = detectGeo(query);
  const wantsPairing = /\b(with|and|after|before|then|near|nearby|walking distance|close by|around)\b/.test(query);
  const requiresWalking = /walking distance|walkable|close by/.test(query);

  const needsRestaurant = Boolean(mealTerms.length || foundSteak.length || query.includes("restaurant"));
  const needsActivity = Boolean(foundActivities.length);
  const searchType = needsRestaurant && needsActivity ? "mixed_outing" : needsRestaurant ? "restaurant" : needsActivity ? "activity" : "unknown";

  let confidence = 0.35;
  if (needsRestaurant) confidence += 0.2;
  if (needsActivity) confidence += 0.2;
  if (geo) confidence += 0.15;
  if (foundSteak.length || hasBowling) confidence += 0.12;
  if (searchType === "mixed_outing" && wantsPairing) confidence += 0.08;
  confidence = Math.min(confidence, 0.96);

  const restaurantFoodTerms = foundSteak.length ? STEAK_TERMS : [];
  const activityTerms = hasBowling ? BOWLING_TERMS : foundActivities;

  return {
    rawQuery,
    searchType,
    primaryDomain: searchType === "mixed_outing" ? "mixed" : searchType,
    needsRestaurant,
    needsActivity,
    wantsPairing: searchType === "mixed_outing" || wantsPairing,
    restaurantIntent: {
      mealTerms: mealTerms.length ? mealTerms : needsRestaurant ? ["dinner"].filter((v) => query.includes(v)) : [],
      foodTerms: restaurantFoodTerms,
      cuisineTerms: foundSteak.length ? ["steak"] : [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms,
      categoryTerms: hasBowling ? ["bowling"] : activityTerms,
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    geo,
    pairingPreference: {
      requiresPairing: searchType === "mixed_outing" || wantsPairing,
      distanceMode: requiresWalking ? "walking" : "any",
      maxPairDistanceMiles: requiresWalking ? 1 : null,
      maxPairWalkingMinutes: requiresWalking ? 20 : null,
      requireWalkablePair: requiresWalking,
    },
    partySize: null,
    vibe: [],
    strictness: confidence >= 0.75 ? "high" : "medium",
    parser_source: "fast_parser",
    confidence,
    options,
  };
}

export function parserConfidence(intent: any) {
  return Number(intent?.confidence ?? 0);
}

export function normalizeIntent(intent: any) {
  return intent;
}
