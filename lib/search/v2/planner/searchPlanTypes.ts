export type SearchMode = "restaurant_only" | "activity_only" | "same_venue" | "paired_outing" | "anchored_nearby";
export type TravelMode = "walking" | "driving" | "unspecified";
export type DistanceConstraintType = "hard" | "soft" | "none";

export type SearchPlan = Readonly<{
  version: "search-plan-v1";
  requestId: string;
  rawQuery: string;
  mode: SearchMode;
  restaurant: Readonly<{ required: boolean; cuisines: readonly string[]; foods: readonly string[]; mealPeriods: readonly string[]; features: readonly string[]; exclusions: readonly string[] }>;
  activity: Readonly<{ required: boolean; categories: readonly string[]; features: readonly string[]; exclusions: readonly string[] }>;
  geo: Readonly<{ source: "explicit" | "current_location" | "anchor" | "default_market"; market: string | null; city: string | null; borough: string | null; neighborhood: string | null; county: string | null; state: string | null; latitude: number | null; longitude: number | null; radiusMiles: number; strictness: "strict" | "preferred" | "broad" }>;
  anchor: Readonly<{ requested: boolean; rawName: string | null; locationId: string | null; name: string | null; latitude: number | null; longitude: number | null }>;
  travel: Readonly<{ mode: TravelMode; constraint: DistanceConstraintType; explicit: boolean; maxWalkingMinutes: number | null; maxDrivingMinutes: number | null }>;
  pairing: Readonly<{ required: boolean; sameVenuePreferred: boolean; sameVenueRequired: boolean; sequence: "restaurant_first" | "activity_first" | "any"; maxDistanceMiles: number | null; maxWalkingMinutes: number | null; maxDrivingMinutes: number | null; requireWalkable: boolean }>;
  audience: Readonly<{ familyFriendly: boolean; minorsPresent: boolean; adultOnlyRequested: boolean }>;
  occasion: string | null;
  partySize: number | null;
  plannedFor: string | null;
  fallback: Readonly<{ allowNearbyPair: boolean; allowPartial: boolean; allowBroaderGeo: boolean; maximumRadiusMiles: number | null }>;
  confidence: Readonly<{ overall: number; mode: number; restaurant: number; activity: number; geo: number }>;
  parser: Readonly<{ source: "deterministic" | "llm" | "hybrid"; reasons: readonly string[] }>;
}>;

export type SearchPlannerInput = { query: string; requestId?: string; userLocation?: { latitude: number; longitude: number; radiusMiles?: number } | null; market?: string | null; selectedLane?: "restaurant" | "activity" | "mixed" | "auto"; plannedFor?: string | null };
