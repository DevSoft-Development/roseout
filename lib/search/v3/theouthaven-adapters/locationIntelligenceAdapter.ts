import type {
  LocationIntelligenceProfile,
  LocationIntelligenceProvider,
  LocationDomain,
} from "@/lib/search-framework";
import { factEvidence } from "@/lib/search-framework";
import type { LocationSearchProfile } from "@/lib/search/profile/profileTypes";

export interface LocationSearchProfileLoader {
  getById(locationId: string): Promise<LocationSearchProfile | null>;
  getByIds(locationIds: readonly string[]): Promise<readonly LocationSearchProfile[]>;
}

export class SearchProfileLocationIntelligenceProvider
  implements LocationIntelligenceProvider
{
  readonly providerId = "theouthaven.search-profile-adapter.v1";

  constructor(private readonly loader: LocationSearchProfileLoader) {}

  async getLocation(locationId: string): Promise<LocationIntelligenceProfile | null> {
    const profile = await this.loader.getById(locationId);
    return profile ? toLocationIntelligenceProfile(profile) : null;
  }

  async getLocations(
    locationIds: readonly string[],
  ): Promise<readonly LocationIntelligenceProfile[]> {
    if (locationIds.length === 0) return [];
    const profiles = await this.loader.getByIds(locationIds);
    const byId = new Map(
      profiles.map((profile) => [
        profile.locationId,
        toLocationIntelligenceProfile(profile),
      ]),
    );

    return locationIds
      .map((locationId) => byId.get(locationId))
      .filter((profile): profile is LocationIntelligenceProfile => Boolean(profile));
  }
}

export function toLocationIntelligenceProfile(
  profile: LocationSearchProfile,
): LocationIntelligenceProfile {
  const primaryDomain = normalizeDomain(profile.primaryDomain);
  const generatedAt = profile.generatedAt;
  const provenance = Object.fromEntries(
    profile.evidence.map((item, index) => [
      `search_profile.${item.field}.${index}`,
      factEvidence(item.value, "search_profile", {
        confidence: evidenceStrengthConfidence(item.strength),
        freshness: generatedAt,
        verifiedAt: null,
        metadata: {
          field: item.field,
          originalSource: item.source,
          strength: item.strength,
        },
      }),
    ]),
  );

  return {
    contractVersion: "location-intelligence-v1",
    locationId: profile.locationId,
    identity: {
      id: profile.locationId,
      name: profile.locationId,
      aliases: [],
      primaryDomain,
      supportedDomains: profile.supportedDomains.map(normalizeDomain),
      categories: [
        ...profile.restaurantCategories,
        ...profile.activityCategories,
        ...profile.nightlifeCategories,
      ],
      description: null,
    },
    geo: {
      point:
        profile.latitude != null && profile.longitude != null
          ? {
              latitude: profile.latitude,
              longitude: profile.longitude,
            }
          : null,
      address: null,
      zipCode: null,
      neighborhood: profile.neighborhood,
      borough: profile.borough,
      city: profile.city,
      county: profile.county,
      state: profile.state,
      market: profile.market,
    },
    taxonomy: {
      restaurantCategories: profile.restaurantCategories,
      activityCategories: profile.activityCategories,
      nightlifeCategories: profile.nightlifeCategories,
      cuisines: profile.cuisines,
      foods: profile.foods,
      dishes: [],
      mealPeriods: profile.mealPeriods,
      features: profile.features,
      offerings: [],
      vibes: profile.vibes,
      occasions: profile.occasions,
      audiences: profile.audiences,
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
      confidence: profile.confidence,
      needsReview: profile.needsReview,
      reviewReasons: profile.reviewReasons,
    },
    behavior: {
      popularityScore: null,
      conversionScore: null,
      saveScore: null,
      completedOutingScore: null,
    },
    embeddings: [],
    provenance,
    freshness: {
      generatedAt,
      sourceUpdatedAt: generatedAt,
    },
    sourceVersions: {
      locationSearchProfile: profile.profileVersion,
      profileHash: profile.profileHash,
    },
  };
}

function normalizeDomain(domain: string): LocationDomain {
  if (domain === "restaurant" || domain === "activity" || domain === "nightlife") {
    return domain;
  }
  return "venue";
}

function evidenceStrengthConfidence(
  strength: "authoritative" | "strong" | "supporting",
): number {
  if (strength === "authoritative") return 1;
  if (strength === "strong") return 0.8;
  return 0.55;
}
