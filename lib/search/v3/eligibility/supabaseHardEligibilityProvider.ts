import type {
  SearchEligibilityProvider,
  SearchEligibilityResult,
  SearchIntentGraph,
  SearchV3Request,
} from "@/lib/search-framework";

export interface EligibilitySupabaseClient {
  from(table: string): { select(columns?: string): any };
}

type LocationRow = {
  id: string;
  location_type: string | null;
  primary_category: string | null;
  category: string | null;
  type: string | null;
  name: string | null;
  active: boolean | null;
  is_searchable: boolean | null;
  is_hidden: boolean | null;
  deleted_at: string | null;
};

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

const ELIGIBILITY_ID_BATCH_SIZE = 100;

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

    const rows = await readInBatches<ProfileRow>({
      client: this.client,
      table: "location_search_profiles",
      columns: "location_id,primary_domain,supported_domains,cuisines,foods,meal_periods,features,activity_categories,nightlife_categories,exclusions,market,city,neighborhood,borough",
      idColumn: "location_id",
      locationIds: args.locationIds,
    });

    const locationRows = await readInBatches<LocationRow>({
      client: this.client,
      table: "locations",
      columns: "id,location_type,primary_category,category,type,name,active,is_searchable,is_hidden,deleted_at",
      idColumn: "id",
      locationIds: args.locationIds,
    });

    const byId = new Map(rows.map((row) => [row.location_id, row]));
    const locationById = new Map(
      locationRows.map((row) => [row.id, row]),
    );
    const eligibleLocationIds: string[] = [];
    const rejected: Array<{ locationId: string; reasons: string[] }> = [];

    for (const locationId of args.locationIds) {
      const row = byId.get(locationId);
      if (!row) {
        rejected.push({ locationId, reasons: ["missing_profile"] });
        continue;
      }

      const reasons = rejectionReasons(
        row,
        locationById.get(locationId) ?? null,
        args.intent,
      );
      if (reasons.length === 0) eligibleLocationIds.push(locationId);
      else rejected.push({ locationId, reasons });
    }

    return { eligibleLocationIds, rejected };
  }
}

function rejectionReasons(
  row: ProfileRow,
  location: LocationRow | null,
  intent: SearchIntentGraph,
): string[] {
  const reasons: string[] = [];

  if (!location) {
    reasons.push("missing_location");
  } else if (
    location.is_searchable === false ||
    location.is_hidden === true ||
    location.active === false ||
    location.deleted_at != null
  ) {
    reasons.push("location_not_searchable");
  }

  if (!candidateDomainMatchesIntent(
    row.primary_domain,
    row.supported_domains,
    intent.domains,
  )) {
    reasons.push("domain_mismatch");
  }

  const supportedDomains = new Set<string>(
    [
      row.primary_domain,
      ...(row.supported_domains ?? []),
    ].filter((value): value is string => Boolean(value)),
  );

  for (const constraint of intent.constraints) {
    if (constraint.strength !== "hard") continue;
    if (!constraintAppliesToSupportedDomains(
      constraint.key,
      supportedDomains,
      intent,
      constraint.value,
    )) continue;
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
  if (
    supportedDomains.has("restaurant") &&
    /\bdinner|dining\b/.test(query) &&
    !/\bbakery|dessert|coffee|cafe|pastry\b/.test(query)
  ) {
    if (location && isDinnerIneligibleClassification(location)) {
      reasons.push("dinner_location_type_mismatch");
    }
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
  return normalizeTaxonomyValue(left) === normalizeTaxonomyValue(right);
}

function normalizeTaxonomyValue(value: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}


function isDinnerIneligibleClassification(location: LocationRow): boolean {
  const classification = [
    location.location_type,
    location.primary_category,
    location.category,
    location.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(bakery|pastry|dessert|coffee shop|cafe|grocery|supermarket|market|store|shop|deli counter|convenience)\b/.test(
    classification,
  );
}


export function candidateDomainMatchesIntent(
  primaryDomain: string | null,
  supportedDomains: readonly string[] | null,
  intentDomains: readonly string[],
): boolean {
  if (intentDomains.length === 0) return true;

  const normalizeDomain = (domain: string | null) =>
    domain === "nightlife" ? "activity" : domain;

  if (intentDomains.length === 1) {
    return normalizeDomain(primaryDomain) === normalizeDomain(intentDomains[0] ?? null);
  }

  const supported = new Set(
    [primaryDomain, ...(supportedDomains ?? [])]
      .map(normalizeDomain)
      .filter((value): value is string => Boolean(value)),
  );
  return intentDomains.some((domain) => supported.has(normalizeDomain(domain) ?? domain));
}

export function constraintAppliesToSupportedDomains(
  key: string,
  supportedDomains: ReadonlySet<string>,
  intent: SearchIntentGraph,
  value?: unknown,
): boolean {
  if (intent.domains.length <= 1) return true;

  if (key === "cuisine" || key === "food" || key === "meal_period") {
    return supportedDomains.has("restaurant");
  }

  if (key === "activity_type") {
    return supportedDomains.has("activity") || supportedDomains.has("nightlife");
  }

  if (key === "feature") {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["rooftop", "live music", "hookah"].includes(normalized)) {
      return supportedDomains.has("activity") || supportedDomains.has("nightlife");
    }
    if (["romantic", "outdoor seating", "waterfront", "private room"].includes(normalized)) {
      return supportedDomains.has("restaurant");
    }
  }

  return true;
}


async function readInBatches<T>(args: {
  client: EligibilitySupabaseClient;
  table: string;
  columns: string;
  idColumn: string;
  locationIds: readonly string[];
}): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; offset < args.locationIds.length; offset += ELIGIBILITY_ID_BATCH_SIZE) {
    const batch = args.locationIds.slice(offset, offset + ELIGIBILITY_ID_BATCH_SIZE);
    const { data, error } = await args.client
      .from(args.table)
      .select(args.columns)
      .in(args.idColumn, [...batch]);

    if (error) {
      const details = [
        error.message,
        error.code,
        error.details,
        error.hint,
      ].filter(Boolean).join(" | ");
      throw new Error(
        `Supabase eligibility read failed for ${args.table} batch ${Math.floor(offset / ELIGIBILITY_ID_BATCH_SIZE) + 1}: ${details || "unknown error"}`,
      );
    }

    rows.push(...((data ?? []) as T[]));
  }

  return rows;
}
