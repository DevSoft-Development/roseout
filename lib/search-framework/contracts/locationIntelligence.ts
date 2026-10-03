import type { FactEvidence } from "./evidence";

export type LocationDomain = "restaurant" | "activity" | "nightlife" | "venue";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocationIdentityIntelligence {
  id: string;
  name: string;
  aliases: readonly string[];
  primaryDomain: LocationDomain;
  supportedDomains: readonly LocationDomain[];
  categories: readonly string[];
  description: string | null;
}

export interface LocationGeoIntelligence {
  point: GeoPoint | null;
  address: string | null;
  zipCode: string | null;
  neighborhood: string | null;
  borough: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  market: string | null;
}

export interface LocationTaxonomyIntelligence {
  restaurantCategories: readonly string[];
  activityCategories: readonly string[];
  nightlifeCategories: readonly string[];
  cuisines: readonly string[];
  foods: readonly string[];
  dishes: readonly string[];
  mealPeriods: readonly string[];
  features: readonly string[];
  offerings: readonly string[];
  vibes: readonly string[];
  occasions: readonly string[];
  audiences: readonly string[];
}

export interface LocationReviewIntelligence {
  rating: number | null;
  reviewCount: number | null;
  summary: string | null;
  attributes: Readonly<Record<string, number>>;
}

export interface LocationVisualIntelligence {
  qualityScore: number | null;
  attributes: Readonly<Record<string, number>>;
  representativePhotoIds: readonly string[];
}

export interface LocationAvailabilityIntelligence {
  operational: boolean | null;
  reservable: boolean | null;
  bookable: boolean | null;
  seasonal: boolean | null;
  hoursFreshness: string | null;
}

export interface LocationQualityIntelligence {
  destinationWorthiness: number | null;
  overallQuality: number | null;
  confidence: number;
  needsReview: boolean;
  reviewReasons: readonly string[];
}

export interface LocationBehaviorIntelligence {
  popularityScore: number | null;
  conversionScore: number | null;
  saveScore: number | null;
  completedOutingScore: number | null;
}

export interface LocationEmbeddingRef {
  kind: string;
  provider: string;
  model: string;
  reference: string;
  dimensions?: number | null;
}

export interface LocationIntelligenceProfile {
  contractVersion: "location-intelligence-v1";
  locationId: string;
  identity: LocationIdentityIntelligence;
  geo: LocationGeoIntelligence;
  taxonomy: LocationTaxonomyIntelligence;
  reviews: LocationReviewIntelligence;
  visual: LocationVisualIntelligence;
  availability: LocationAvailabilityIntelligence;
  quality: LocationQualityIntelligence;
  behavior: LocationBehaviorIntelligence;
  embeddings: readonly LocationEmbeddingRef[];
  provenance: Readonly<Record<string, FactEvidence>>;
  freshness: {
    generatedAt: string;
    sourceUpdatedAt: string | null;
  };
  sourceVersions: Readonly<Record<string, string | number>>;
}

export function createEmptyLocationIntelligenceProfile(args: {
  locationId: string;
  name: string;
  primaryDomain: LocationDomain;
  generatedAt?: string;
}): LocationIntelligenceProfile {
  const generatedAt = args.generatedAt ?? new Date().toISOString();

  return {
    contractVersion: "location-intelligence-v1",
    locationId: args.locationId,
    identity: {
      id: args.locationId,
      name: args.name,
      aliases: [],
      primaryDomain: args.primaryDomain,
      supportedDomains: [args.primaryDomain],
      categories: [],
      description: null,
    },
    geo: {
      point: null,
      address: null,
      zipCode: null,
      neighborhood: null,
      borough: null,
      city: null,
      county: null,
      state: null,
      market: null,
    },
    taxonomy: {
      restaurantCategories: [],
      activityCategories: [],
      nightlifeCategories: [],
      cuisines: [],
      foods: [],
      dishes: [],
      mealPeriods: [],
      features: [],
      offerings: [],
      vibes: [],
      occasions: [],
      audiences: [],
    },
    reviews: {
      rating: null,
      reviewCount: null,
      summary: null,
      attributes: {},
    },
    visual: {
      qualityScore: null,
      attributes: {},
      representativePhotoIds: [],
    },
    availability: {
      operational: null,
      reservable: null,
      bookable: null,
      seasonal: null,
      hoursFreshness: null,
    },
    quality: {
      destinationWorthiness: null,
      overallQuality: null,
      confidence: 0,
      needsReview: false,
      reviewReasons: [],
    },
    behavior: {
      popularityScore: null,
      conversionScore: null,
      saveScore: null,
      completedOutingScore: null,
    },
    embeddings: [],
    provenance: {},
    freshness: {
      generatedAt,
      sourceUpdatedAt: null,
    },
    sourceVersions: {},
  };
}
