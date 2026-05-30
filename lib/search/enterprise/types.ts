export type SearchDomain = "restaurant" | "activity" | "mixed" | "any";
export type SearchType = "restaurant" | "activity" | "mixed_outing" | "any";
export type GeoStrictness = "none" | "soft" | "medium" | "strict";
export type PairDistanceMode = "walking" | "nearby" | "same_area" | "any";

export type PairingPreference = {
  requiresPairing: boolean;
  distanceMode: PairDistanceMode;
  maxPairDistanceMiles: number | null;
  maxPairWalkingMinutes: number | null;
  requireWalkablePair: boolean;
};

export type RestaurantIntent = {
  mealTerms: string[];
  foodTerms: string[];
  cuisineTerms: string[];
  categoryTerms: string[];
  vibeTerms: string[];
  featureTerms: string[];
  negativeTerms: string[];
};

export type ActivityIntent = {
  activityTerms: string[];
  categoryTerms: string[];
  vibeTerms: string[];
  featureTerms: string[];
  negativeTerms: string[];
};

export type GeoIntent = {
  raw?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  borough?: string | null;
  county?: string | null;
  region?: string | null;
  state?: string | null;
  aliases: string[];
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
  geoStrictness: GeoStrictness;
};

export type SearchIntent = {
  rawQuery: string;
  searchType: SearchType;
  primaryDomain: SearchDomain;
  needsRestaurant: boolean;
  needsActivity: boolean;
  wantsPairing: boolean;
  pairingPreference?: PairingPreference;
  restaurantIntent: RestaurantIntent;
  activityIntent: ActivityIntent;
  geo: GeoIntent;
  occasion?: string | null;
  partySize?: number | null;
  timeContext?: string | null;
  budget?: string | null;
  vibe: string[];
  strictness: "low" | "medium" | "high";
};

export type EnterpriseLocation = {
  id: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  description?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_category?: string | null;
  tags?: string[] | string | null;
  vibe_tags?: string[] | string | null;
  best_for_tags?: string[] | string | null;
  date_style_tags?: string[] | string | null;
  search_keywords?: string[] | string | null;
  google_types?: string[] | string | null;
  semantic_tags?: string[] | string | null;
  intent_tags?: string[] | string | null;
  search_document?: string | null;
  semantic_search_text?: string | null;
  rating?: number | null;
  review_count?: number | null;
  review_score?: number | null;
  quality_score?: number | null;
  popularity_score?: number | null;
  roseout_score?: number | null;
  theouthaven_score?: number | null;
  search_score?: number | null;
  recommendation_score?: number | null;
  analytics_score?: number | null;
  reservation_url?: string | null;
  reservation_link?: string | null;
  booking_url?: string | null;
  external_reservation_url?: string | null;
  website?: string | null;
  phone?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  images?: string[] | string | null;
  gallery_images?: string[] | string | null;
  is_searchable?: boolean | null;
  is_hidden?: boolean | null;
  active?: boolean | null;
  status?: string | null;
  data_status?: string | null;
  deleted_at?: string | null;
  match_score?: number | null;
  term_score?: number | null;
  geo_score?: number | null;
  distance_score?: number | null;
  distance_miles?: number | null;
  domain_score?: number | null;
  quality_rank_score?: number | null;
  [key: string]: unknown;
};

export type EnterprisePair = {
  restaurant: EnterpriseLocation;
  activity: EnterpriseLocation;
  title: string;
  explanation: string;
  pairExplanation?: string;
  score: number;
  pairScore: number;
  distance_miles: number | null;
  pairDistanceMiles: number | null;
  pairWalkingMinutes: number | null;
  pairDistanceLabel: string;
  pairWarnings: string[];
  isWalkable: boolean;
};

export type EnterpriseSearchResult = {
  success: boolean;
  restaurants: EnterpriseLocation[];
  activities: EnterpriseLocation[];
  pairs: EnterprisePair[];
  matched_locations: EnterpriseLocation[];
  matchedLocations?: EnterpriseLocation[];
  render_mode: "restaurant_cards" | "activity_cards" | "mixed_pairs" | "empty" | "partial_mixed" | "cards" | "text";
  renderMode?: string;
  reply: string;
  card_counts: { restaurants: number; activities: number; matched_locations: number; pairs: number };
  cardCounts?: { restaurants: number; activities: number; matched_locations: number; pairs: number };
  debug?: Record<string, unknown>;
};
