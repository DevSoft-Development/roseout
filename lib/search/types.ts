export type ParsedSearchIntent = {
  city: string | null;
  borough: string | null;
  restaurantType: string | null;
  activityType: string | null;
  vibe: string | null;
  wantsWalkingDistance: boolean;
  keywords: string[];
};

export type SearchLocation = {
  id: string | number;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  borough?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_type?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  category?: string | null;
  subcategory?: string | null;
  rating?: number | null;
  popularity_score?: number | null;
  theouthaven_score?: number | null;
  search_score?: number | null;
  is_pro?: boolean | null;
  reservation_link?: string | null;
  reservation_url?: string | null;
  [key: string]: unknown;
};

export type ScoredPair = {
  restaurant: SearchLocation;
  activity: SearchLocation;
  distanceMiles: number;
  walkingMinutes: number;
  score: number;
};
