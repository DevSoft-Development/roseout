import type {
  LocationIntelligenceProfile,
  SearchCandidate,
  SearchIntentGraph,
  SearchRankingProvider,
  SearchV3Request,
} from "@/lib/search-framework";

export interface DeterministicDecisionRankingOptions {
  retrievalWeight?: number;
  intentWeight?: number;
  geoWeight?: number;
  qualityWeight?: number;
  consensusWeight?: number;
}

export class DeterministicDecisionRankingProvider
implements SearchRankingProvider {
  readonly providerId = "search-v3.deterministic-decision-ranker.v2";

  constructor(
    private readonly options: DeterministicDecisionRankingOptions = {},
  ) {}

  async rank(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    candidates: readonly SearchCandidate[];
  }): Promise<readonly SearchCandidate[]> {
    const weights = normalizeWeights({
      retrieval: this.options.retrievalWeight ?? 0.35,
      intent: this.options.intentWeight ?? 0.3,
      geo: this.options.geoWeight ?? 0.15,
      quality: this.options.qualityWeight ?? 0.1,
      consensus: this.options.consensusWeight ?? 0.1,
    });

    return args.candidates
      .map((candidate) => {
        const components = {
          retrieval: retrievalScore(candidate),
          intent: intentScore(candidate.intelligence, args.intent),
          geo: geoScore(candidate.intelligence, args.request, args.intent),
          quality: qualityScore(candidate.intelligence),
          consensus: retrievalConsensusScore(candidate),
        };

        const total =
          components.retrieval * weights.retrieval +
          components.intent * weights.intent +
          components.geo * weights.geo +
          components.quality * weights.quality +
          components.consensus * weights.consensus;

        return {
          ...candidate,
          frameworkScore: total,
          metadata: {
            ...candidate.metadata,
            ranking: {
              provider: this.providerId,
              score: total,
              components,
              weights,
            },
          },
        };
      })
      .sort((a, b) =>
        Number(b.frameworkScore ?? 0) - Number(a.frameworkScore ?? 0) ||
        bestRetrievalRank(a) - bestRetrievalRank(b) ||
        a.locationId.localeCompare(b.locationId)
      );
  }
}

function retrievalConsensusScore(candidate: SearchCandidate): number {
  const coreLanes = new Set([
    "structured",
    "bm25",
    "semantic_dense",
    "semantic_food",
    "semantic_menu",
  ]);
  const observed = new Set(
    candidate.retrieval
      .map((item) => item.lane)
      .filter((lane) => coreLanes.has(lane)),
  );
  return clamp01(observed.size / coreLanes.size);
}

function normalizeWeights(weights: {
  retrieval: number;
  intent: number;
  geo: number;
  quality: number;
  consensus: number;
}) {
  const safe = Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [
      key,
      Number.isFinite(value) && value >= 0 ? value : 0,
    ]),
  ) as typeof weights;
  const total = Object.values(safe).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { retrieval: 0.35, intent: 0.3, geo: 0.15, quality: 0.1, consensus: 0.1 };
  }
  return {
    retrieval: safe.retrieval / total,
    intent: safe.intent / total,
    geo: safe.geo / total,
    quality: safe.quality / total,
    consensus: safe.consensus / total,
  };
}

function retrievalScore(candidate: SearchCandidate): number {
  if (candidate.retrieval.length === 0) return 0;

  const rrf = candidate.retrieval.find((item) => item.lane === "rrf");
  if (rrf?.score != null && Number.isFinite(Number(rrf.score))) {
    return clamp01(Number(rrf.score) * 20);
  }

  const reciprocal = candidate.retrieval.reduce(
    (sum, item) => sum + 1 / Math.max(1, item.rank),
    0,
  );
  return clamp01(reciprocal / Math.max(1, candidate.retrieval.length));
}

function intentScore(
  intelligence: LocationIntelligenceProfile,
  intent: SearchIntentGraph,
): number {
  let earned = 0;
  let possible = 0;

  if (intent.primaryDomain) {
    possible += 2;
    if (
      intelligence.identity.primaryDomain === intent.primaryDomain ||
      intelligence.identity.supportedDomains.includes(intent.primaryDomain)
    ) {
      earned += 2;
    }
  }

  for (const constraint of intent.constraints) {
    const weight =
      constraint.strength === "hard" ? 2 :
      constraint.strength === "strong" ? 1.25 : 0.75;
    const supported = supportsConstraint(intelligence, constraint.key);
    if (!supported) continue;

    possible += weight;
    if (matchesConstraint(intelligence, constraint.key, String(constraint.value))) {
      earned += weight;
    }
  }

  if (intent.occasion) {
    possible += 1;
    if (includesNormalized(intelligence.taxonomy.occasions, intent.occasion)) {
      earned += 1;
    }
  }

  return possible === 0 ? 0.5 : clamp01(earned / possible);
}

function geoScore(
  intelligence: LocationIntelligenceProfile,
  request: SearchV3Request,
  intent: SearchIntentGraph,
): number {
  const origin =
    request.userLocation ??
    (
      intent.anchor?.latitude != null && intent.anchor?.longitude != null
        ? {
            latitude: intent.anchor.latitude,
            longitude: intent.anchor.longitude,
          }
        : null
    );
  const point = intelligence.geo.point;
  if (!origin || !point) return 0.5;

  const miles = haversineMiles(
    origin.latitude,
    origin.longitude,
    point.latitude,
    point.longitude,
  );

  const idealRadius =
    intent.travelMode === "walking"
      ? Math.max(0.5, Math.min(3, (intent.maxTravelMinutes ?? 30) / 20))
      : Math.max(2, Math.min(15, (intent.maxTravelMinutes ?? 30) / 4));

  if (miles <= idealRadius) return 1;
  return clamp01(1 - (miles - idealRadius) / Math.max(idealRadius * 2, 1));
}

function qualityScore(intelligence: LocationIntelligenceProfile): number {
  const values = [
    normalizeNullable(intelligence.quality.overallQuality),
    normalizeNullable(intelligence.quality.destinationWorthiness),
    normalizeNullable(intelligence.visual.qualityScore),
    clamp01(intelligence.quality.confidence),
    normalizeRating(intelligence.reviews.rating),
  ].filter((value): value is number => value != null);

  if (values.length === 0) return 0.5;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function supportsConstraint(
  intelligence: LocationIntelligenceProfile,
  key: string,
): boolean {
  return [
    "cuisine",
    "food",
    "meal_period",
    "feature",
    "activity_type",
    "market",
    "city",
    "neighborhood",
    "borough",
  ].includes(key);
}

function matchesConstraint(
  intelligence: LocationIntelligenceProfile,
  key: string,
  value: string,
): boolean {
  switch (key) {
    case "cuisine":
      return includesNormalized(intelligence.taxonomy.cuisines, value);
    case "food":
      return (
        includesNormalized(intelligence.taxonomy.foods, value) ||
        includesNormalized(intelligence.taxonomy.dishes, value)
      );
    case "meal_period":
      return includesNormalized(intelligence.taxonomy.mealPeriods, value);
    case "feature":
      return (
        includesNormalized(intelligence.taxonomy.features, value) ||
        includesNormalized(intelligence.taxonomy.offerings, value)
      );
    case "activity_type":
      return (
        includesNormalized(intelligence.taxonomy.activityCategories, value) ||
        includesNormalized(intelligence.taxonomy.nightlifeCategories, value)
      );
    case "market":
      return normalizedEqual(intelligence.geo.market, value);
    case "city":
      return normalizedEqual(intelligence.geo.city, value);
    case "neighborhood":
      return normalizedEqual(intelligence.geo.neighborhood, value);
    case "borough":
      return normalizedEqual(intelligence.geo.borough, value);
    default:
      return false;
  }
}

function bestRetrievalRank(candidate: SearchCandidate): number {
  return Math.min(
    ...candidate.retrieval.map((item) => item.rank),
    Number.MAX_SAFE_INTEGER,
  );
}

function includesNormalized(
  values: readonly string[],
  expected: string,
): boolean {
  return values.some((value) => normalizedEqual(value, expected));
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

function normalizeNullable(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp01(value > 1 ? value / 100 : value);
}

function normalizeRating(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp01(value / 5);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}
