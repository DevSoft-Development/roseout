import type {
  RetrievalCandidate,
  RetrievalLaneResult,
  SearchIntentGraph,
  SearchRetrievalProvider,
  SearchV3Request,
} from "@/lib/search-framework";

export interface StructuredRetrievalSupabaseClient {
  from(table: string): { select(columns?: string): any };
}

export interface StructuredRetrievalOptions {
  candidateLimit?: number;
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
  market: string | null;
  city: string | null;
  neighborhood: string | null;
  borough: string | null;
  confidence: number | null;
  needs_review: boolean | null;
};

const PROFILE_COLUMNS = "location_id,primary_domain,supported_domains,cuisines,foods,meal_periods,features,activity_categories,nightlife_categories,market,city,neighborhood,borough,confidence,needs_review";

export class SupabaseStructuredRetrievalProvider implements SearchRetrievalProvider {
  readonly providerId = "theouthaven.supabase-structured.v1";

  constructor(
    private readonly client: StructuredRetrievalSupabaseClient,
    private readonly options: StructuredRetrievalOptions = {},
  ) {}

  async retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();
    const limit = Math.max(200, Math.min(this.options.candidateLimit ?? 500, 500));
    let query = this.client
      .from("location_search_profiles")
      .select(PROFILE_COLUMNS)
      .order("confidence", { ascending: false })
      .limit(limit);

    if (args.intent.domains.length === 1) {
      query = query.contains("supported_domains", [args.intent.domains[0]]);
    }

    const borough = constraintValue(args.intent, "borough");
    const market = constraintValue(args.intent, "market");
    const city = constraintValue(args.intent, "city");
    const neighborhood = constraintValue(args.intent, "neighborhood");
    if (borough) query = query.ilike("borough", borough);
    if (market) query = query.ilike("market", market);
    if (city) query = query.ilike("city", city);
    if (neighborhood) query = query.ilike("neighborhood", neighborhood);

    const resolvedGeo = resolvedGeoConstraint(args.intent);
    if (resolvedGeo && !constraintValue(args.intent, resolvedGeo.key)) {
      query = query.ilike(resolvedGeo.key, resolvedGeo.value);
    }

    if (shouldApplyDomainFacetSqlFilters(args.intent)) {
      const cuisine = constraintValue(args.intent, "cuisine");
      const food = constraintValue(args.intent, "food");
      const meal = constraintValue(args.intent, "meal_period");
      const feature = constraintValue(args.intent, "feature");
      const activity = constraintValue(args.intent, "activity_type");

      if (cuisine) query = query.overlaps("cuisines", [cuisine]);
      if (food) query = query.overlaps("foods", [food]);
      if (meal) query = query.overlaps("meal_periods", [meal]);
      if (feature) query = query.overlaps("features", [feature]);
      if (activity) query = query.overlaps("activity_categories", [activity]);
    }

    if (
      args.intent.anchor?.latitude != null &&
      args.intent.anchor?.longitude != null &&
      !resolvedGeo
    ) {
      const radiusMiles = anchorRadiusMiles(args.intent);
      const latDelta = radiusMiles / 69;
      const cosLat = Math.max(0.2, Math.cos(args.intent.anchor.latitude * Math.PI / 180));
      const lonDelta = radiusMiles / (69 * cosLat);
      query = query
        .gte("latitude", args.intent.anchor.latitude - latDelta)
        .lte("latitude", args.intent.anchor.latitude + latDelta)
        .gte("longitude", args.intent.anchor.longitude - lonDelta)
        .lte("longitude", args.intent.anchor.longitude + lonDelta);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ProfileRow[];
    const ranked = rows
      .map((row) => ({
        row,
        score: structuredScore(row, args.intent),
        evidence: structuredEvidence(row, args.intent),
      }))
      .sort((a, b) =>
        b.score - a.score ||
        Number(b.row.confidence ?? 0) - Number(a.row.confidence ?? 0) ||
        a.row.location_id.localeCompare(b.row.location_id)
      );

    const candidates: RetrievalCandidate[] = ranked.map((item, index) => ({
      locationId: item.row.location_id,
      lane: "structured",
      rank: index + 1,
      score: item.score,
      evidence: item.evidence,
      metadata: {
        profileConfidence: item.row.confidence ?? null,
        needsReview: item.row.needs_review ?? false,
      },
    }));

    return {
      lane: "structured",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: rows.length >= limit,
    };
  }
}

function structuredScore(row: ProfileRow, intent: SearchIntentGraph): number {
  let score = Number(row.confidence ?? 0) * 0.1;

  for (const constraint of intent.constraints) {
    const value = String(constraint.value).toLowerCase();
    if (matchesConstraint(row, constraint.key, value)) {
      score += constraint.strength === "hard" ? 2 : constraint.strength === "strong" ? 1 : 0.5;
    }
  }

  const supported = new Set(
    [row.primary_domain, ...(row.supported_domains ?? [])]
      .filter((value): value is string => Boolean(value)),
  );
  if (intent.domains.some((domain) => supported.has(domain))) {
    score += 2;
  }

  return score;
}

function structuredEvidence(row: ProfileRow, intent: SearchIntentGraph): string[] {
  const evidence: string[] = [];
  for (const constraint of intent.constraints) {
    const value = String(constraint.value).toLowerCase();
    if (matchesConstraint(row, constraint.key, value)) {
      evidence.push(constraint.key + ":" + value);
    }
  }
  return evidence;
}

function matchesConstraint(row: ProfileRow, key: string, value: string): boolean {
  switch (key) {
    case "cuisine": return includesNormalized(row.cuisines, value);
    case "food": return includesNormalized(row.foods, value);
    case "meal_period": return includesNormalized(row.meal_periods, value);
    case "feature": return includesNormalized(row.features, value);
    case "activity_type":
      return includesNormalized(row.activity_categories, value) ||
        includesNormalized(row.nightlife_categories, value);
    case "market": return normalizedEqual(row.market, value);
    case "city": return normalizedEqual(row.city, value);
    case "neighborhood": return normalizedEqual(row.neighborhood, value);
    case "borough": return normalizedEqual(row.borough, value);
    default: return false;
  }
}

function constraintValue(intent: SearchIntentGraph, key: string): string | null {
  const found = intent.constraints.find((constraint) =>
    constraint.key === key && constraint.strength === "hard"
  );
  return found == null ? null : String(found.value);
}

function includesNormalized(values: readonly string[] | null, expected: string): boolean {
  return (values ?? []).some((value) => normalizedEqual(value, expected));
}

function normalizedEqual(left: string | null, right: string): boolean {
  return String(left ?? "").trim().toLowerCase() === right.trim().toLowerCase();
}


function resolvedGeoConstraint(
  intent: SearchIntentGraph,
): { key: "market" | "city" | "neighborhood" | "borough"; value: string } | null {
  const entityType = intent.anchor?.entityType;
  const resolution = intent.metadata?.entityResolution;
  if (!resolution || typeof resolution !== "object") return null;

  const canonicalName = (resolution as Record<string, unknown>).canonicalName;
  if (typeof canonicalName !== "string" || !canonicalName.trim()) return null;

  if (
    entityType === "market" ||
    entityType === "city" ||
    entityType === "neighborhood" ||
    entityType === "borough"
  ) {
    return { key: entityType, value: canonicalName.trim() };
  }
  return null;
}

function anchorRadiusMiles(intent: SearchIntentGraph): number {
  if (intent.maxTravelMinutes != null) {
    if (intent.travelMode === "walking") {
      return Math.max(0.25, Math.min(3, intent.maxTravelMinutes / 20));
    }
    return Math.max(1, Math.min(15, intent.maxTravelMinutes / 4));
  }
  return intent.travelMode === "walking" ? 1.5 : 3;
}


export function shouldApplyDomainFacetSqlFilters(
  intent: SearchIntentGraph,
): boolean {
  return intent.domains.length <= 1;
}
