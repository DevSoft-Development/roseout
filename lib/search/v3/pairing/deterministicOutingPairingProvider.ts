import type {
  KnowledgeEdge,
  KnowledgeEntity,
  LocationIntelligenceProfile,
  SearchCandidate,
  SearchIntentGraph,
  SearchOuting,
  SearchOutingSequence,
  SearchPairingProvider,
  SearchRouteConfidence,
  SearchRouteMatrixEntry,
  SearchRoutePoint,
  SearchRoutingProvider,
  SearchV3Request,
  TravelMode,
} from "@/lib/search-framework";

export interface DeterministicOutingPairingOptions {
  relevanceWeight?: number;
  proximityWeight?: number;
  intentWeight?: number;
  qualityWeight?: number;
  diversityWeight?: number;
  graphWeight?: number;
  maxDistanceMiles?: number;
  maxPairs?: number;
  maxCandidatesPerRole?: number;
}

type PairRole = "restaurant" | "activity";

export interface GraphPairingKnowledgeProvider {
  readonly providerId: string;
  getLocationEntities(locationIds: readonly string[]): Promise<readonly KnowledgeEntity[]>;
  getRelationshipsForEntities(entityIds: readonly string[]): Promise<readonly KnowledgeEdge[]>;
}

interface GraphPairingContext {
  entityByLocationId: ReadonlyMap<string, KnowledgeEntity>;
  edgesByEntityId: ReadonlyMap<string, readonly KnowledgeEdge[]>;
}

export class DeterministicOutingPairingProvider implements SearchPairingProvider {
  readonly providerId = "search-v3.deterministic-outing-pairer.v1";

  constructor(
    private readonly options: DeterministicOutingPairingOptions = {},
    private readonly routingProvider: SearchRoutingProvider | null = null,
    private readonly graphProvider: GraphPairingKnowledgeProvider | null = null,
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
      graph: this.options.graphWeight ?? 0.15,
    });

    const maxPairs = Math.max(
      1,
      Math.min(100, Math.floor(this.options.maxPairs ?? args.request.limit ?? 20)),
    );
    const maxCandidatesPerRole = Math.max(
      5,
      Math.min(100, Math.floor(this.options.maxCandidatesPerRole ?? 10)),
    );

    const travelMode = effectiveTravelMode(args.intent);
    const travelLimit = resolveTravelLimit(args.intent, this.options.maxDistanceMiles);

    const graphPoolMultiplier = this.graphProvider ? 2 : 1;
    const restaurantPool = args.candidates
      .filter((candidate) => supportsRole(candidate, "restaurant"))
      .slice(0, maxCandidatesPerRole * graphPoolMultiplier);
    const activityPool = args.candidates
      .filter((candidate) => supportsRole(candidate, "activity"))
      .slice(0, maxCandidatesPerRole * graphPoolMultiplier);

    const graphContext = await buildGraphPairingContext(
      [...restaurantPool, ...activityPool],
      this.graphProvider,
    );

    const restaurants = prioritizeByGraphAnchor(
      restaurantPool,
      graphContext,
      args.intent.anchor?.entityId ?? null,
    ).slice(0, maxCandidatesPerRole);
    const activities = prioritizeByGraphAnchor(
      activityPool,
      graphContext,
      args.intent.anchor?.entityId ?? null,
    ).slice(0, maxCandidatesPerRole);

    const rawPairs: Array<{ restaurant: SearchCandidate; activity: SearchCandidate }> = [];

    if (args.intent.sequencing === "same_venue") {
      for (const candidate of args.candidates.slice(0, maxCandidatesPerRole * 2)) {
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

    const routeLookup = new Map<string, SearchRouteMatrixEntry>();
    let routingState: "not_requested" | "completed" | "failed" = "not_requested";

    if (
      travelMode === "walking" &&
      this.routingProvider &&
      rawPairs.some(({ restaurant, activity }) => restaurant.locationId !== activity.locationId)
    ) {
      const origins = uniqueRoutePoints(restaurants);
      const destinations = uniqueRoutePoints(activities);

      if (origins.length > 0 && destinations.length > 0) {
        try {
          const matrix = await this.routingProvider.routeMatrix({
            mode: "walking",
            origins,
            destinations,
          });
          for (const entry of matrix.entries) {
            routeLookup.set(routeKey(entry.originId, entry.destinationId), entry);
          }
          routingState = "completed";
        } catch {
          routingState = "failed";
        }
      }
    }

    return rawPairs
      .flatMap(({ restaurant, activity }): SearchOuting[] => {
        const sameVenue = restaurant.locationId === activity.locationId;
        const straightLineMiles = pairDistanceMiles(restaurant, activity);
        const routeEntry = routeLookup.get(
          routeKey(restaurant.locationId, activity.locationId),
        );

        let routeSource = sameVenue ? "same_venue" : "haversine_estimate";
        let routeConfidence: SearchRouteConfidence = sameVenue ? "verified" : "estimated";
        let routeDistanceMiles: number | null = null;
        let distanceMiles = straightLineMiles;
        let travelMinutes = distanceMiles == null
          ? null
          : estimateTravelMinutes(distanceMiles, travelMode);

        if (sameVenue) {
          distanceMiles = 0;
          routeDistanceMiles = 0;
          travelMinutes = 0;
        } else if (travelMode === "walking" && routingState === "completed") {
          if (
            !routeEntry ||
            routeEntry.confidence !== "verified" ||
            routeEntry.distanceMiles == null ||
            routeEntry.durationMinutes == null
          ) {
            return [];
          }

          routeSource = routeEntry.source;
          routeConfidence = routeEntry.confidence;
          routeDistanceMiles = routeEntry.distanceMiles;
          distanceMiles = routeEntry.distanceMiles;
          travelMinutes = routeEntry.durationMinutes;
        } else if (
          travelMode === "walking" &&
          this.routingProvider &&
          routingState === "not_requested"
        ) {
          return [];
        } else if (travelMode === "walking" && routingState === "failed") {
          routeSource = "haversine_fallback";
          routeConfidence = "estimated";
        }

        const withinTravelLimit = isWithinTravelLimit({
          distanceMiles,
          travelMinutes,
          travelMode,
          routeConfidence,
          travelLimit,
        });

        if (withinTravelLimit === false) return [];

        const components = {
          relevance: pairRelevance(restaurant, activity),
          proximity: pairProximity(distanceMiles, travelLimit?.maxDistanceMiles ?? null),
          intent: pairIntentScore(restaurant, activity, args.intent),
          quality: (
            candidateQualityScore(restaurant) +
            candidateQualityScore(activity)
          ) / 2,
          diversity: sameVenue ? 0.5 : 1,
          graph: pairGraphAffinity(restaurant, activity, graphContext),
        };

        const score =
          components.relevance * weights.relevance +
          components.proximity * weights.proximity +
          components.intent * weights.intent +
          components.quality * weights.quality +
          components.diversity * weights.diversity +
          components.graph * weights.graph;

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
            routeSource,
            routeConfidence,
          }),
          metadata: {
            pairingProvider: this.providerId,
            scoreComponents: components,
            scoreWeights: weights,
            withinTravelLimit,
            routeSource,
            routeConfidence,
            straightLineMiles,
            routeDistanceMiles,
            routingProvider: this.routingProvider?.providerId ?? null,
            graphProvider: this.graphProvider?.providerId ?? null,
            graphEvidence: describeGraphEvidence(restaurant, activity, graphContext),
            routingState,
            maxDistanceMiles: travelLimit?.maxDistanceMiles ?? null,
            maxTravelMinutes: travelLimit?.maxTravelMinutes ?? null,
          },
        }];
      })
      .sort((a, b) =>
        b.score - a.score ||
        nullableAscending(a.travelMinutes, b.travelMinutes) ||
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

function uniqueRoutePoints(
  candidates: readonly SearchCandidate[],
): SearchRoutePoint[] {
  const points = new Map<string, SearchRoutePoint>();
  for (const candidate of candidates) {
    const point = candidate.intelligence.geo.point;
    if (!point || points.has(candidate.locationId)) continue;
    points.set(candidate.locationId, {
      id: candidate.locationId,
      latitude: point.latitude,
      longitude: point.longitude,
    });
  }
  return [...points.values()];
}

function routeKey(originId: string, destinationId: string): string {
  return `${originId}::${destinationId}`;
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

function isWithinTravelLimit(args: {
  distanceMiles: number | null;
  travelMinutes: number | null;
  travelMode: TravelMode;
  routeConfidence: SearchRouteConfidence;
  travelLimit: { maxDistanceMiles: number; maxTravelMinutes: number | null } | null;
}): boolean | null {
  if (!args.travelLimit) return true;

  if (
    args.travelMode === "walking" &&
    args.routeConfidence === "verified" &&
    args.travelLimit.maxTravelMinutes != null
  ) {
    return args.travelMinutes != null
      ? args.travelMinutes <= args.travelLimit.maxTravelMinutes + 1e-9
      : false;
  }

  if (args.distanceMiles == null) return null;
  if (args.distanceMiles > args.travelLimit.maxDistanceMiles + 1e-9) return false;

  if (
    args.travelLimit.maxTravelMinutes != null &&
    args.travelMinutes != null &&
    args.travelMinutes > args.travelLimit.maxTravelMinutes + 1e-9
  ) {
    return false;
  }

  return true;
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
  routeSource: string;
  routeConfidence: SearchRouteConfidence;
}): string[] {
  const reasons = ["Restaurant and activity both satisfy the requested outing domains."];

  if (args.distanceMiles != null) {
    const routeLabel = args.routeConfidence === "verified"
      ? `Verified ${args.routeSource} route`
      : "Estimated route";
    reasons.push(
      `${routeLabel}: ${args.distanceMiles.toFixed(1)} miles` +
      (args.travelMinutes != null
        ? ` (~${Math.round(args.travelMinutes)} min ${args.travelMode}).`
        : "."),
    );
  }

  const matched = args.intent.constraints
    .filter((constraint) => {
      const role = constraintRole(constraint.key, constraint.value);
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
  graph: number;
}): {
  relevance: number;
  proximity: number;
  intent: number;
  quality: number;
  diversity: number;
  graph: number;
} {
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
      graph: 0.15,
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

async function buildGraphPairingContext(
  candidates: readonly SearchCandidate[],
  provider: GraphPairingKnowledgeProvider | null,
): Promise<GraphPairingContext> {
  const empty: GraphPairingContext = {
    entityByLocationId: new Map(),
    edgesByEntityId: new Map(),
  };
  if (!provider || candidates.length === 0) return empty;

  try {
    const locationIds = [...new Set(candidates.map((candidate) => candidate.locationId))];
    const entities = await provider.getLocationEntities(locationIds);
    const entityByLocationId = new Map<string, KnowledgeEntity>();

    for (const entity of entities) {
      if (!entity.locationId) continue;
      const current = entityByLocationId.get(entity.locationId);
      if (!current || entity.confidence > current.confidence) {
        entityByLocationId.set(entity.locationId, entity);
      }
    }

    const entityIds = [...new Set([...entityByLocationId.values()].map((entity) => entity.id))];
    const edges = await provider.getRelationshipsForEntities(entityIds);
    const edgesByEntityId = new Map<string, KnowledgeEdge[]>();

    for (const edge of edges) {
      for (const entityId of [edge.subjectEntityId, edge.objectEntityId]) {
        if (!entityIds.includes(entityId)) continue;
        const list = edgesByEntityId.get(entityId) ?? [];
        list.push(edge);
        edgesByEntityId.set(entityId, list);
      }
    }

    return { entityByLocationId, edgesByEntityId };
  } catch {
    return empty;
  }
}

function prioritizeByGraphAnchor(
  candidates: readonly SearchCandidate[],
  context: GraphPairingContext,
  anchorEntityId: string | null,
): SearchCandidate[] {
  if (!anchorEntityId) return [...candidates];

  return [...candidates].sort((a, b) => {
    const affinityDelta =
      candidateAnchorAffinity(b, context, anchorEntityId) -
      candidateAnchorAffinity(a, context, anchorEntityId);
    if (affinityDelta !== 0) return affinityDelta;
    return (a.finalRank ?? Number.MAX_SAFE_INTEGER) - (b.finalRank ?? Number.MAX_SAFE_INTEGER);
  });
}

function candidateAnchorAffinity(
  candidate: SearchCandidate,
  context: GraphPairingContext,
  anchorEntityId: string,
): number {
  const entity = context.entityByLocationId.get(candidate.locationId);
  if (!entity) return 0;

  const edges = context.edgesByEntityId.get(entity.id) ?? [];
  const direct = edges.find((edge) =>
    (edge.subjectEntityId === entity.id && edge.objectEntityId === anchorEntityId) ||
    (edge.objectEntityId === entity.id && edge.subjectEntityId === anchorEntityId)
  );
  return direct ? clamp01(direct.confidence) : 0;
}

function pairGraphAffinity(
  restaurant: SearchCandidate,
  activity: SearchCandidate,
  context: GraphPairingContext,
): number {
  const left = context.entityByLocationId.get(restaurant.locationId);
  const right = context.entityByLocationId.get(activity.locationId);
  if (!left || !right) return 0.5;

  const leftEdges = context.edgesByEntityId.get(left.id) ?? [];
  const rightEdges = context.edgesByEntityId.get(right.id) ?? [];

  const directPredicates = new Set([
    "compatible_with",
    "commonly_paired_with",
    "near",
    "same_area_as",
    "reachable_within",
    "followed_by",
  ]);

  const direct = [...leftEdges, ...rightEdges].filter((edge) =>
    (
      (edge.subjectEntityId === left.id && edge.objectEntityId === right.id) ||
      (edge.subjectEntityId === right.id && edge.objectEntityId === left.id)
    ) &&
    directPredicates.has(edge.predicate)
  );

  if (direct.length > 0) {
    return clamp01(Math.max(...direct.map((edge) => edge.confidence)));
  }

  const sharedLocatedIn = sharedObjects(left.id, right.id, leftEdges, rightEdges, "located_in");
  if (sharedLocatedIn.length > 0) return 0.9;

  for (const predicate of ["suited_for_occasion", "has_vibe", "for_audience"]) {
    if (sharedObjects(left.id, right.id, leftEdges, rightEdges, predicate).length > 0) {
      return 0.75;
    }
  }

  return 0.5;
}

function describeGraphEvidence(
  restaurant: SearchCandidate,
  activity: SearchCandidate,
  context: GraphPairingContext,
): Readonly<Record<string, unknown>> {
  const left = context.entityByLocationId.get(restaurant.locationId);
  const right = context.entityByLocationId.get(activity.locationId);
  if (!left || !right) return { status: "unavailable" };

  const leftEdges = context.edgesByEntityId.get(left.id) ?? [];
  const rightEdges = context.edgesByEntityId.get(right.id) ?? [];
  const sharedGeography = sharedObjects(left.id, right.id, leftEdges, rightEdges, "located_in");

  return {
    status: "available",
    restaurantEntityId: left.id,
    activityEntityId: right.id,
    sharedGeographyEntityIds: sharedGeography,
    affinity: pairGraphAffinity(restaurant, activity, context),
  };
}

function sharedObjects(
  leftId: string,
  rightId: string,
  leftEdges: readonly KnowledgeEdge[],
  rightEdges: readonly KnowledgeEdge[],
  predicate: string,
): string[] {
  const targets = (entityId: string, edges: readonly KnowledgeEdge[]) =>
    new Set(
      edges
        .filter((edge) => edge.subjectEntityId === entityId && edge.predicate === predicate)
        .map((edge) => edge.objectEntityId),
    );

  const leftTargets = targets(leftId, leftEdges);
  const rightTargets = targets(rightId, rightEdges);
  return [...leftTargets].filter((id) => rightTargets.has(id));
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
