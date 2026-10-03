import type {
  SearchEligibilityProvider,
  SearchEligibilityResult,
  SearchIntentGraph,
  SearchV3Request,
} from "@/lib/search-framework";

export interface EligibilitySupabaseClient {
  from(table: string): { select(columns?: string): any };
}

type ProfileRow = {
  location_id: string;
  primary_domain: string | null;
  supported_domains: string[] | null;
  cuisines: string[] | null;
  foods: string[] | null;
  meal_periods: string[] | null;
  features: string[] | null;
  activity_categories: string[] | null;
  nightlife_categories: string[] | null;
  exclusions: string[] | null;
  market: string | null;
  city: string | null;
  neighborhood: string | null;
  borough: string | null;
};

export class SupabaseHardEligibilityProvider implements SearchEligibilityProvider {
  readonly providerId = "theouthaven.supabase-hard-eligibility.v1";

  constructor(private readonly client: EligibilitySupabaseClient) {}

  async filter(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    locationIds: readonly string[];
  }): Promise<SearchEligibilityResult> {
    if (args.locationIds.length === 0) {
      return { eligibleLocationIds: [], rejected: [] };
    }

    const { data, error } = await this.client
      .from("location_search_profiles")
      .select("location_id,primary_domain,supported_domains,cuisines,foods,meal_periods,features,activity_categories,nightlife_categories,exclusions,market,city,neighborhood,borough")
      .in("location_id", [...args.locationIds]);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ProfileRow[];
    const byId = new Map(rows.map((row) => [row.location_id, row]));
    const eligibleLocationIds: string[] = [];
    const rejected: Array<{ locationId: string; reasons: string[] }> = [];

    for (const locationId of args.locationIds) {
      const row = byId.get(locationId);
      if (!row) {
        rejected.push({ locationId, reasons: ["missing_profile"] });
        continue;
      }

      const reasons = rejectionReasons(row, args.intent);
      if (reasons.length === 0) eligibleLocationIds.push(locationId);
      else rejected.push({ locationId, reasons });
    }

    return { eligibleLocationIds, rejected };
  }
}

function rejectionReasons(row: ProfileRow, intent: SearchIntentGraph): string[] {
  const reasons: string[] = [];

  if (intent.domains.length > 0) {
    const supported = new Set([
      row.primary_domain,
      ...(row.supported_domains ?? []),
    ].filter(Boolean));
    if (!intent.domains.some((domain) => supported.has(domain))) {
      reasons.push("domain_mismatch");
    }
  }

  for (const constraint of intent.constraints) {
    if (constraint.strength !== "hard") continue;
    const value = String(constraint.value).trim().toLowerCase();

    switch (constraint.key) {
      case "cuisine":
        if (!includesNormalized(row.cuisines, value)) reasons.push("cuisine_mismatch");
        break;
      case "food":
        if (!includesNormalized(row.foods, value)) reasons.push("food_mismatch");
        break;
      case "meal_period":
        if (!includesNormalized(row.meal_periods, value)) reasons.push("meal_period_mismatch");
        break;
      case "feature":
        if (!includesNormalized(row.features, value)) reasons.push("feature_mismatch");
        break;
      case "activity_type":
        if (
          !includesNormalized(row.activity_categories, value) &&
          !includesNormalized(row.nightlife_categories, value)
        ) reasons.push("activity_type_mismatch");
        break;
      case "market":
        if (!normalizedEqual(row.market, value)) reasons.push("market_mismatch");
        break;
      case "city":
        if (!normalizedEqual(row.city, value)) reasons.push("city_mismatch");
        break;
      case "neighborhood":
        if (!normalizedEqual(row.neighborhood, value)) reasons.push("neighborhood_mismatch");
        break;
      case "borough":
        if (!normalizedEqual(row.borough, value)) reasons.push("borough_mismatch");
        break;
    }
  }

  const query = intent.rawQuery.toLowerCase();
  if (/\bdinner|dining\b/.test(query) && !/\bbakery|dessert|coffee|cafe\b/.test(query)) {
    if ((row.meal_periods ?? []).length > 0 && !includesNormalized(row.meal_periods, "dinner")) {
      reasons.push("dinner_service_required");
    }
  }

  const exclusions = (row.exclusions ?? []).map((value) => value.toLowerCase());
  if (exclusions.some((term) => term && query.includes(term))) {
    reasons.push("profile_exclusion");
  }

  return [...new Set(reasons)];
}

function includesNormalized(values: readonly string[] | null, expected: string): boolean {
  return (values ?? []).some((value) => normalizedEqual(value, expected));
}

function normalizedEqual(left: string | null, right: string): boolean {
  return String(left ?? "").trim().toLowerCase() === right.trim().toLowerCase();
}
