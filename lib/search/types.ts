export type RenderMode = "cards" | "empty" | "text";


export type NormalizedLaneSearchIntent = {
  primaryDomain: "restaurant" | "activity" | "mixed";
  wantsPairing: boolean;
  needsRestaurant: boolean;
  needsActivity: boolean;
  sameVenuePreferred?: boolean;
  sequenceDetected?: boolean;
  proximityDetected?: boolean;
  coLocationTermsMatched?: string[];
  sequenceTermsMatched?: string[];
  proximityTermsMatched?: string[];
  attributeTerms?: string[];
  sameVenueReason?: string | null;
  restaurantTerms: string[];
  cuisineTerms: string[];
  mealTerms: string[];
  activityTerms: string[];
  vibeTerms: string[];
  geo: {
    raw: string | null;
    neighborhood: string | null;
    borough: string | null;
    city: string | null;
    region: string | null;
  };
};

export type CanonicalSearchIntent = {
  rawQuery: string;
  normalizedQuery: string;
  foodIntent: string[];
  activityIntent: string[];
  locationIntent: string[];
  borough: string | null;
  city: string | null;
  neighborhood: string | null;
  needsRestaurant: boolean;
  needsActivity: boolean;
  wantsPairing: boolean;
  addOnIntent: string[];
  wantsFood: boolean;
  wantsRestaurant: boolean;
  wantsActivity: boolean;
  wantsFullOuting: boolean;
  foodIntents: string[];
  mealFoodIntents: string[];
  specificMealFoodIntents: string[];
  addOnFoodIntents: string[];
  activityIntents: string[];
  cuisines: string[];
  locations: string[];
  neighborhoods: string[];
  boroughs: string[];
  cities?: string[];
  vibes: string[];
  occasionIntents?: string[];
  strictFoodMode: boolean;
  strictActivityMode: boolean;
  isOffTopic: boolean;
  offTopicReason?: string;
  restaurantSearchInput: string;
  activitySearchInput: string;
  cacheBypassReasons: string[];
  restaurantIntent?: boolean;
  restaurantType?: string | null;
  requiredRestaurantCategory?: string | null;
  geoIntent?: import("./geo-matching").GeoIntent | null;
  hookahMode?: "restaurant_add_on" | "activity" | "activity_add_on" | null;
  mealFirst?: boolean;
  primaryDomain?: "restaurant" | "activity" | "mixed";
  sameVenuePreferred?: boolean;
  sequenceDetected?: boolean;
  proximityDetected?: boolean;
  coLocationTermsMatched?: string[];
  sequenceTermsMatched?: string[];
  proximityTermsMatched?: string[];
  sameVenueReason?: string | null;
  normalizedIntent?: NormalizedLaneSearchIntent;
};

export type SearchPipelineResult = {
  success: boolean;
  reply: string;
  intent: CanonicalSearchIntent;
  restaurants: any[];
  activities: any[];
  matched_locations: any[];
  pairs: any[];
  render_mode: RenderMode;
  card_counts: {
    restaurants: number;
    activities: number;
    matched_locations: number;
    pairs: number;
  };
  debug?: any;
};


export type ParsedSearchIntent = {
  city?: string | null;
  borough?: string | null;
  restaurantType?: string | null;
  activityType?: string | null;
};

export type SearchLocation = {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  borough?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  category?: string | null;
  subcategory?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
};
