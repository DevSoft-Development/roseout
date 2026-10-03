import type {
  LocationIntelligenceProfile,
  SearchCandidate,
  SearchIntentGraph,
  SearchOuting,
  SearchOutingSequence,
  SearchPairingProvider,
  SearchV3Request,
  TravelMode,
} from "@/lib/search-framework";

export interface DeterministicOutingPairingOptions {
  relevanceWeight?: number;
  proximityWeight?: number;
  intentWeight?: number;
  qualityWeight?: number;
  diversityWeight?: number;
  maxDistanceMiles?: number;
  maxPairs?: number;
}

type PairRole = "restaurant" | "activity";

export class DeterministicOutingPairingProvider implements SearchPairingProvider {
  readonly providerId = "search-v3.deterministic-outing-pairer.v1";

  constructor(
    private readonly options: DeterministicOutingPairingOptions = {},
  ) {}

  async pair(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    candidates: readonly SearchCandidate[];
  }): Promise<readonly SearchOuting[]> {
    if (!requiresOutingPair(args.intent)) return [];

    const weights = normalizeWeights({
      relevance: this.options.relevanceWeight ?? 0.4,
      proximity: this.options.proximityWeight ?? 0.25,
      intent: this.options.intentWeight ?? 0.2,
      quality: this.options.qualityWeight ?? 0.1,
      diversity: this.options.diversityWeight ?? 0.05,
    });

    const maxPairs = Math.max(
      1,
      Math.min(100, Math.floor(this.options.maxPairs ?? args.request.limit ?? 20)),
    );

    const travelMode = effectiveTravelMode(args.intent);
    const travelLimit = resolveTravelLimit(args.intent, this.options.maxDistanceMiles);

    const restaurants = args.candidates.filter((candidate) =>
      supportsRole(candidate, "restaurant")
    );
    const activities = args.candidates.filter((candidate) =>
      supportsRole(candidate, "activity")
    );

    const rawPairs: Array<{ restaurant: SearchCandidate; activity: SearchCandidate }> = [];

    if (args.intent.sequencing === "same_venue") {
      for (const candidate of args.candidates) {
        if (
          supportsRole(candidate, "restaurant") &&
          supportsRole(candidate, "activity")
        ) {
          rawPairs.push({ restaurant: candidate, activity: candidate });
        }
      }
    } else {
      for (const restaurant of restaurants) {
        for (const activity of activities) {
          if (restaurant.locationId === activity.locationId) continue;
          rawPairs.push({ restaurant, activity });
        }
      }
    }

    return rawPairs
      .flatMap(({ restaurant, activity }): SearchOuting[] => {
        const distanceMiles = pairDistanceMiles(restaurant, activity);
        const travelMinutes = distanceMiles == null
          ? null
          : estimateTravelMinutes(distanceMiles, travelMode);

        const withinTravelLimit = travelLimit == null || distanceMiles == null
          ? null
          : distanceMiles <= travelLimit.maxDistanceMiles + 1e-9;

        if (withinTravelLimit === false) return [];

        const components = {
          relevance: pairRelevance(restaurant, activity),
          proximity: pairProximity(distanceMiles, travelLimit?.maxDistanceMiles ?? null),
          intent: pairIntentScore(restaurant, activity, args.intent),
          quality: (
            candidateQualityScore(restaurant) +
            candidateQualityScore(activity)
          ) / 2,
          diversity: restaurant.locationId === activity.locationId ? 0.5 : 1,
        };

        const score =
          components.relevance * weights.relevance +
          components.proximity * weights.proximity +
          components.intent * weights.intent +
          components.quality * weights.quality +
          components.diversity * weights.diversity;

        const sequence = resolveSequence(args.intent, restaurant, activity);

        return [{
          outingId: outingId(restaurant.locationId, activity.locationId, sequence),
          restaurant,
          activity,
          score,
          distanceMiles,
          travelMinutes,
          travelMode,
          sequence,
          reasons: buildReasons({
            restaurant,
            activity,
            distanceMiles,
            travelMinutes,
            travelMode,
            intent: args.intent,
          }),
          metadata: {
            pairingProvider: this.providerId,
            scoreComponents: components,
            scoreWeights: weights,
            withinTravelLimit,
            maxDistanceMiles: travelLimit?.maxDistanceMiles ?? null,
            maxTravelMinutes: travelLimit?.maxTravelMinutes ?? null,
          },
        }];
      })
      .sort((a, b) =>
        b.score - a.score ||
        nullableAscending(a.distanceMiles, b.distanceMiles) ||
        a.restaurant.locationId.localeCompare(b.restaurant.locationId) ||
        a.activity.locationId.localeCompare(b.activity.locationId)
      )
      .slice(0, maxPairs);
  }
}

export function requiresOutingPair(intent: SearchIntentGraph): boolean {
  const hasRestaurant = intent.domains.includes("restaurant");
  const hasActivity =
    intent.domains.includes("activity") ||
    intent.domains.includes("nightlife");
  return hasRestaurant && hasActivity;
}

export function pairDistanceMiles(
  restaurant: SearchCandidate,
  activity: SearchCandidate,
): number | null {
  const left = restaurant.intelligence.geo.point;
  const right = activity.intelligence.geo.point;
  if (!left || !right) return null;

  return haversineMiles(
    left.latitude,
    left.longitude,
    right.latitude,
    right.longitude,
  );
}

export function estimateTravelMinutes(
  miles: number,
  mode: TravelMode,
): number {
  const minutesPerMile =
    mode === "walking" ? 20 :
    mode === "transit" ? 8 :
    mode === "driving" ? 4 :
    5;

  return Math.max(1, Math.round(miles * minutesPerMile));
}

function effectiveTravelMode(intent: SearchIntentGraph): TravelMode {
  return intent.travelMode === "unspecified" ? "driving" : intent.travelMode;
}

function resolveTravelLimit(
  intent: SearchIntentGraph,
  configuredMaxDistanceMiles: number | undefined,
): { maxDistanceMiles: number; maxTravelMinutes: number | null } | null {
  const configured = Number(configuredMaxDistanceMiles);
  const configuredLimit = Number.isFinite(configured) && configured > 0
    ? configured
    : 15;

  if (intent.maxTravelMinutes != null) {
    const minutes = Math.max(1, Math.min(60, intent.maxTravelMinutes));
    const mode = effectiveTravelMode(intent);
    const minutesPerMile =
      mode === "walking" ? 20 :
      mode === "transit" ? 8 :
      mode === "driving" ? 4 :
      5;

    return {
      maxDistanceMiles: Math.min(configuredLimit, minutes / minutesPerMile),
      maxTravelMinutes: minutes,
    };
  }

  if (intent.travelMode === "walking") {
    return {
      maxDistanceMiles: Math.min(configuredLimit, 3),
      maxTravelMinutes: 60,
    };
  }

  return {
    maxDistanceMiles: configuredLimit,
    maxTravelMinutes: null,
  };
}

function supportsRole(candidate: SearchCandidate, role: PairRole): boolean {
  const domains = new Set([
    candidate.intelligence.identity.primaryDomain,
    ...candidate.intelligence.identity.supportedDomains,
  ]);

  if (role === "restaurant") return domains.has("restaurant");
  return domains.has("activity") || domains.has("nightlife");
}

function pairRelevance(
  restaurant: SearchCandidate,
  activity: SearchCandidate,
): number {
  return clamp01(
    (
      normalizeCandidateScore(restaurant.frameworkScore) +
      normalizeCandidateScore(activity.frameworkScore)
    ) / 2,
  );
}

function pairProximity(
  distanceMiles: number | null,
  maxDistanceMiles: number | null,
): number {
  if (distanceMiles == null) return 0.5;
  if (distanceMiles <= 0.05) return 1;

  const radius = Math.max(0.5, maxDistanceMiles ?? 5);
  return clamp01(1 - distanceMiles / radius);
}

function pairIntentScore(
  restaurant: SearchCandidate,
  activity: SearchCandidate,
  intent: SearchIntentGraph,
): number {
  let earned = 2;
  let possible = 2;

  for (const constraint of intent.constraints) {
    const role = constraintRole(constraint.key, constraint.value);
    const weight =
      constraint.strength === "hard" ? 2 :
      constraint.strength === "strong" ? 1.25 : 0.75;

    possible += weight;

    if (role === "restaurant") {
      if (matchesConstraint(restaurant.intelligence, constraint.key, String(constraint.value))) {
        earned += weight;
      }
      continue;
    }

    if (role === "activity") {
      if (matchesConstraint(activity.intelligence, constraint.key, String(constraint.value))) {
        earned += weight;
      }
      continue;
    }

    if (
      matchesConstraint(restaurant.intelligence, constraint.key, String(constraint.value)) &&
      matchesConstraint(activity.intelligence, constraint.key, String(constraint.value))
    ) {
      earned += weight;
    }
  }

  if (intent.occasion) {
    possible += 1;
    if (
      includesNormalized(restaurant.intelligence.taxonomy.occasions, intent.occasion) ||
      includesNormalized(activity.intelligence.taxonomy.occasions, intent.occasion)
    ) {
      earned += 1;
    }
  }

  return clamp01(earned / Math.max(1, possible));
}

function constraintRole(key: string, value?: unknown): PairRole | "shared" {
  if (["cuisine", "food", "meal_period"].includes(key)) return "restaurant";
  if (key === "activity_type") return "activity";
  if (key === "feature") {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["rooftop", "live music", "hookah"].includes(normalized)) return "activity";
    if (["romantic", "outdoor seating", "waterfront", "private room"].includes(normalized)) return "restaurant";
  }
  return "shared";
}

function matchesConstraint(
  intelligence: LocationIntelligenceProfile,
  key: string,
  expected: string,
): boolean {
  switch (key) {
    case "cuisine":
      return includesNormalized(intelligence.taxonomy.cuisines, expected);
    case "food":
      return (
        includesNormalized(intelligence.taxonomy.foods, expected) ||
        includesNormalized(intelligence.taxonomy.dishes, expected)
      );
    case "meal_period":
      return includesNormalized(intelligence.taxonomy.mealPeriods, expected);
    case "activity_type":
      return (
        includesNormalized(intelligence.taxonomy.activityCategories, expected) ||
        includesNormalized(intelligence.taxonomy.nightlifeCategories, expected)
      );
    case "feature":
      return (
        includesNormalized(intelligence.taxonomy.features, expected) ||
        includesNormalized(intelligence.taxonomy.offerings, expected) ||
        includesNormalized(intelligence.taxonomy.activityCategories, expected) ||
        includesNormalized(intelligence.taxonomy.nightlifeCategories, expected)
      );
    case "market":
      return normalizedEqual(intelligence.geo.market, expected);
    case "city":
      return normalizedEqual(intelligence.geo.city, expected);
    case "neighborhood":
      return normalizedEqual(intelligence.geo.neighborhood, expected);
    case "borough":
      return normalizedEqual(intelligence.geo.borough, expected);
    case "zip_code":
      return normalizedEqual(intelligence.geo.zipCode, expected);
    default:
      return true;
  }
}

function candidateQualityScore(candidate: SearchCandidate): number {
  const intelligence = candidate.intelligence;
  const values = [
    normalizeQuality(intelligence.quality.overallQuality),
    normalizeQuality(intelligence.quality.destinationWorthiness),
    normalizeQuality(intelligence.visual.qualityScore),
    normalizeQuality(intelligence.quality.confidence),
    intelligence.reviews.rating == null
      ? null
      : clamp01(intelligence.reviews.rating / 5),
  ].filter((value): value is number => value != null);

  if (!values.length) return 0.5;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveSequence(
  intent: SearchIntentGraph,
  restaurant: SearchCandidate,
  activity: SearchCandidate,
): SearchOutingSequence {
  if (
    intent.sequencing === "same_venue" &&
    restaurant.locationId === activity.locationId
  ) {
    return "same_venue";
  }

  const q = normalizeText(intent.rawQuery);
  const before = q.indexOf(" before ");
  if (before >= 0) {
    const left = q.slice(0, before);
    const right = q.slice(before + 8);
    if (activitySignals(left, activity) && restaurantSignals(right, restaurant)) {
      return "activity_then_restaurant";
    }
    if (restaurantSignals(left, restaurant) && activitySignals(right, activity)) {
      return "restaurant_then_activity";
    }
  }

  const after = q.indexOf(" after ");
  if (after >= 0) {
    const left = q.slice(0, after);
    const right = q.slice(after + 7);
    if (activitySignals(left, activity) && restaurantSignals(right, restaurant)) {
      return "restaurant_then_activity";
    }
    if (restaurantSignals(left, restaurant) && activitySignals(right, activity)) {
      return "activity_then_restaurant";
    }
  }

  return "restaurant_then_activity";
}

function restaurantSignals(text: string, candidate: SearchCandidate): boolean {
  const values = [
    "restaurant",
    "dinner",
    "brunch",
    "lunch",
    "breakfast",
    ...candidate.intelligence.taxonomy.cuisines,
    ...candidate.intelligence.taxonomy.foods,
    ...candidate.intelligence.taxonomy.mealPeriods,
  ];
  return values.some((value) => text.includes(normalizeText(value)));
}

function activitySignals(text: string, candidate: SearchCandidate): boolean {
  const values = [
    "activity",
    "movie",
    "drinks",
    "cocktails",
    ...candidate.intelligence.taxonomy.activityCategories,
    ...candidate.intelligence.taxonomy.nightlifeCategories,
    ...candidate.intelligence.taxonomy.features,
  ];
  return values.some((value) => text.includes(normalizeText(value)));
}

function buildReasons(args: {
  restaurant: SearchCandidate;
  activity: SearchCandidate;
  distanceMiles: number | null;
  travelMinutes: number | null;
  travelMode: TravelMode;
  intent: SearchIntentGraph;
}): string[] {
  const reasons = ["Restaurant and activity both satisfy the requested outing domains."];

  if (args.distanceMiles != null) {
    reasons.push(
      `${args.distanceMiles.toFixed(1)} miles apart` +
      (args.travelMinutes != null
        ? ` (~${args.travelMinutes} min ${args.travelMode}).`
        : "."),
    );
  }

  const matched = args.intent.constraints
    .filter((constraint) => {
      const role = constraintRole(constraint.key);
      if (role === "restaurant") {
        return matchesConstraint(
          args.restaurant.intelligence,
          constraint.key,
          String(constraint.value),
        );
      }
      if (role === "activity") {
        return matchesConstraint(
          args.activity.intelligence,
          constraint.key,
          String(constraint.value),
        );
      }
      return (
        matchesConstraint(
          args.restaurant.intelligence,
          constraint.key,
          String(constraint.value),
        ) &&
        matchesConstraint(
          args.activity.intelligence,
          constraint.key,
          String(constraint.value),
        )
      );
    })
    .map((constraint) => `${constraint.key}=${String(constraint.value)}`);

  if (matched.length) {
    reasons.push(`Matched requested constraints: ${matched.join(", ")}.`);
  }

  return reasons;
}

function outingId(
  restaurantId: string,
  activityId: string,
  sequence: SearchOutingSequence,
): string {
  return `${restaurantId}::${activityId}::${sequence}`;
}

function normalizeWeights(weights: {
  relevance: number;
  proximity: number;
  intent: number;
  quality: number;
  diversity: number;
}) {
  const safe = Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [
      key,
      Number.isFinite(value) && value >= 0 ? value : 0,
    ]),
  ) as typeof weights;

  const total = Object.values(safe).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {
      relevance: 0.4,
      proximity: 0.25,
      intent: 0.2,
      quality: 0.1,
      diversity: 0.05,
    };
  }

  return {
    relevance: safe.relevance / total,
    proximity: safe.proximity / total,
    intent: safe.intent / total,
    quality: safe.quality / total,
    diversity: safe.diversity / total,
  };
}

function normalizeCandidateScore(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0.5;
  return clamp01(value);
}

function normalizeQuality(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp01(value > 1 ? value / 100 : value);
}

function includesNormalized(
  values: readonly string[],
  expected: string,
): boolean {
  return values.some((value) => normalizedEqual(value, expected));
}

function normalizedEqual(
  left: string | null,
  right: string,
): boolean {
  return normalizeText(left ?? "") === normalizeText(right);
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nullableAscending(
  left: number | null,
  right: number | null,
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
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
