export type RenderMode = "cards" | "empty" | "text";

export type CanonicalSearchIntent = {
  rawQuery: string;
  normalizedQuery: string;
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
  vibes: string[];
  strictFoodMode: boolean;
  strictActivityMode: boolean;
  isOffTopic: boolean;
  offTopicReason?: string;
  restaurantSearchInput: string;
  activitySearchInput: string;
  cacheBypassReasons: string[];
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
