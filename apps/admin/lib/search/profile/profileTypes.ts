export const SEARCH_PROFILE_VERSION = 4;

export type SearchDomain = "restaurant" | "activity" | "nightlife";
export type EvidenceStrength = "authoritative" | "strong" | "supporting";

export interface ProfileEvidence {
  field: string;
  source: string;
  value: string;
  strength: EvidenceStrength;
}

export interface ManualProfileOverrides {
  primaryDomain?: SearchDomain;
  add?: Partial<Record<ProfileFacet, readonly string[]>>;
  remove?: Partial<Record<ProfileFacet, readonly string[]>>;
  exclusions?: readonly string[];
}

export type ProfileFacet =
  | "supportedDomains" | "restaurantCategories" | "cuisines" | "foods"
  | "activityCategories" | "nightlifeCategories" | "mealPeriods" | "features"
  | "audiences" | "occasions" | "vibes" | "canonicalTerms";

export interface LocationProfileSource {
  id: string;
  name: string;
  restaurantName?: string | null;
  activityName?: string | null;
  locationType?: string | null;
  activityType?: string | null;
  primaryCategory?: string | null;
  categories?: readonly string[] | null;
  cuisines?: readonly string[] | null;
  foodTerms?: readonly string[] | null;
  features?: readonly string[] | null;
  description?: string | null;
  address?: string | null;
  market?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  county?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  active?: boolean | null;
  searchable?: boolean | null;
  hidden?: boolean | null;
  isLowLevel?: boolean | null;
}

export interface LocationSearchProfile {
  locationId: string;
  primaryDomain: SearchDomain;
  supportedDomains: SearchDomain[];
  restaurantCategories: string[];
  cuisines: string[];
  foods: string[];
  activityCategories: string[];
  nightlifeCategories: string[];
  mealPeriods: string[];
  features: string[];
  audiences: string[];
  occasions: string[];
  vibes: string[];
  canonicalTerms: string[];
  exclusions: string[];
  searchText: string;
  latitude: number | null;
  longitude: number | null;
  market: string | null;
  city: string | null;
  neighborhood: string | null;
  borough: string | null;
  county: string | null;
  state: string | null;
  classificationSources: Record<string, string[]>;
  evidence: ProfileEvidence[];
  manualOverrides: ManualProfileOverrides;
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
  profileVersion: number;
  profileHash: string;
  generatedAt: string;
}

export interface ProfileValidationResult {
  valid: boolean;
  reasons: string[];
  confidence: number;
}
