import type { LocationSearchProfile } from "@/lib/search/profile/profileTypes";
import type { LocationSearchProfileLoader } from "./locationIntelligenceAdapter";

export interface SupabaseLocationSearchProfileLoaderClient {
  from(table: string): { select(columns?: string): any };
}

const PROFILE_COLUMNS = [
  "location_id",
  "primary_domain",
  "supported_domains",
  "restaurant_categories",
  "cuisines",
  "foods",
  "activity_categories",
  "nightlife_categories",
  "meal_periods",
  "features",
  "audiences",
  "occasions",
  "vibes",
  "canonical_terms",
  "exclusions",
  "search_text",
  "latitude",
  "longitude",
  "market",
  "city",
  "neighborhood",
  "borough",
  "county",
  "state",
  "classification_sources",
  "evidence",
  "manual_overrides",
  "confidence",
  "needs_review",
  "review_reasons",
  "profile_version",
  "profile_hash",
  "generated_at",
].join(",");

const PROFILE_ID_BATCH_SIZE = 100;

export class SupabaseLocationSearchProfileLoader
implements LocationSearchProfileLoader {
  constructor(private readonly client: SupabaseLocationSearchProfileLoaderClient) {}

  async getById(locationId: string): Promise<LocationSearchProfile | null> {
    return withTransientRetry(async () => {
      const { data, error } = await this.client
        .from("location_search_profiles")
        .select(PROFILE_COLUMNS)
        .eq("location_id", locationId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? mapProfile(data) : null;
    });
  }

  async getByIds(locationIds: readonly string[]): Promise<readonly LocationSearchProfile[]> {
    const ids = [...new Set(locationIds.filter(Boolean))];
    if (ids.length === 0) return [];

    const profiles: LocationSearchProfile[] = [];

    for (let offset = 0; offset < ids.length; offset += PROFILE_ID_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + PROFILE_ID_BATCH_SIZE);
      const batchProfiles = await withTransientRetry(async () => {
        const { data, error } = await this.client
          .from("location_search_profiles")
          .select(PROFILE_COLUMNS)
          .in("location_id", batch);

        if (error) {
          const details = [
            error.message,
            error.code,
            error.details,
            error.hint,
          ].filter(Boolean).join(" | ");
          throw new Error(
            `Supabase location intelligence read failed for batch ${Math.floor(offset / PROFILE_ID_BATCH_SIZE) + 1}: ${details || "unknown error"}`,
          );
        }

        return (data ?? []).map(mapProfile);
      });

      profiles.push(...batchProfiles);
    }

    return profiles;
  }
}

function mapProfile(row: any): LocationSearchProfile {
  return {
    locationId: row.location_id,
    primaryDomain: row.primary_domain,
    supportedDomains: row.supported_domains ?? [],
    restaurantCategories: row.restaurant_categories ?? [],
    cuisines: row.cuisines ?? [],
    foods: row.foods ?? [],
    activityCategories: row.activity_categories ?? [],
    nightlifeCategories: row.nightlife_categories ?? [],
    mealPeriods: row.meal_periods ?? [],
    features: row.features ?? [],
    audiences: row.audiences ?? [],
    occasions: row.occasions ?? [],
    vibes: row.vibes ?? [],
    canonicalTerms: row.canonical_terms ?? [],
    exclusions: row.exclusions ?? [],
    searchText: row.search_text ?? "",
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    market: row.market ?? null,
    city: row.city ?? null,
    neighborhood: row.neighborhood ?? null,
    borough: row.borough ?? null,
    county: row.county ?? null,
    state: row.state ?? null,
    classificationSources: row.classification_sources ?? {},
    evidence: row.evidence ?? [],
    manualOverrides: row.manual_overrides ?? {},
    confidence: Number(row.confidence ?? 0),
    needsReview: Boolean(row.needs_review),
    reviewReasons: row.review_reasons ?? [],
    profileVersion: Number(row.profile_version ?? 0),
    profileHash: String(row.profile_hash ?? ""),
    generatedAt: String(row.generated_at ?? ""),
  };
}

function nullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}


async function withTransientRetry<T>(work: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

function isTransientFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|socket|timeout|temporar|ECONNRESET|ETIMEDOUT/i.test(message);
}
