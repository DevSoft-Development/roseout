import type {
  LocationIntelligenceProfile,
  SearchCandidate,
  SearchOuting,
  SearchV3Execution,
} from "@/lib/search-framework";
import type { GoldenQueryCase } from "./goldenQueries";

export type V3ReplayComparison = {
  passed: boolean;
  resultCount: number;
  pairCount: number;
  expectedDomains: string[];
  servedDomains: string[];
  missingDomains: string[];
  unexpectedDomains: string[];
  exactDomainCoveragePass: boolean;
  minimumResultsPass: boolean;
  geographyPass: boolean;
  restaurantTermsPass: boolean;
  prohibitedCategoriesPass: boolean;
  pairedDomainCoveragePass: boolean;
  minimumPairsPass: boolean;
  pairRelevancePass: boolean;
  pairActivityCategoryPass: boolean;
  pairGeographyPass: boolean;
  pairDistancePass: boolean;
  pairTravelTimePass: boolean;
  pairRouteVerifiedPass: boolean;
  routeVerificationRequired: boolean;
  verifiedRouteCoverage: boolean;
  pairSequencingPass: boolean;
  distanceLeakage: boolean;
  travelTimeLeakage: boolean;
  noResultRegression: boolean;
  latencyMs: number;
  candidateDomainCounts: Record<string, number>;
  topCandidates: Array<{
    locationId: string;
    rank: number | null;
    score: number | null;
    domains: string[];
  }>;
  topOutings: Array<{
    outingId: string;
    restaurantId: string;
    activityId: string;
    score: number;
    distanceMiles: number | null;
    travelMinutes: number | null;
    travelMode: string;
    sequence: string;
    routeSource: string;
    routeConfidence: string;
  }>;
};

export type V3ReplayMetrics = {
  total: number;
  successRate: number;
  exactDomainCoverageRate: number;
  geographyPassRate: number;
  restaurantTermsPassRate: number;
  prohibitedCategoryViolationRate: number;
  pairedDomainCoverageRate: number;
  pairSuccessRate: number;
  pairRelevancePassRate: number;
  pairDistanceLeakageRate: number;
  pairTravelTimeLeakageRate: number;
  pairRouteVerificationRate: number;
  pairSequencingPassRate: number;
  noResultRegressionRate: number;
  p95LatencyMs: number;
  contractFailureCount: number;
  v3OnlyPassCount: number;
  canonicalOnlyPassCount: number;
  bothPassCount: number;
  bothFailCount: number;
};

export function evaluateV3Execution(
  testCase: GoldenQueryCase,
  execution: SearchV3Execution,
  options: {
    legacyCount: number;
    latencyMs: number;
  },
): V3ReplayComparison {
  const expected = testCase.expectations ?? {};
  const expectedDomains = (expected.expectedDomains ?? []).map(normalizeComparisonDomain);
  const domainCounts = countCandidateDomains(execution.candidates);
  const servedDomains = Object.entries(domainCounts)
    .filter(([, count]) => count > 0)
    .map(([domain]) => domain)
    .sort();

  const missingDomains = expectedDomains.filter((domain) => !servedDomains.includes(domain));
  const unexpectedDomains = expectedDomains.length
    ? servedDomains.filter((domain) => !expectedDomains.includes(domain))
    : [];

  const exactDomainCoveragePass =
    missingDomains.length === 0 &&
    unexpectedDomains.length === 0;

  const minimumResults = Math.max(0, Number(expected.minimumResults ?? 0));
  const minimumResultsPass = execution.candidates.length >= minimumResults;
  const geographyPass = matchesExpectedGeography(
    execution.candidates,
    expected.expectedGeography ?? [],
  );
  const restaurantTermsPass = matchesExpectedRestaurantTerms(
    execution.candidates,
    expected.expectedRestaurantTerms ?? [],
  );
  const prohibitedCategoriesPass = avoidsProhibitedCategories(
    execution.candidates,
    expected.prohibitedCategories ?? [],
  );

  const expectedMinimumPairs = Math.max(0, Number(expected.minimumPairs ?? 0));
  const pairExpected =
    expectedMinimumPairs > 0 ||
    (
      expectedDomains.includes("restaurant") &&
      expectedDomains.includes("activity")
    );

  const minimumPairsPass =
    !pairExpected ||
    execution.outings.length >= Math.max(1, expectedMinimumPairs);

  const pairActivityCategoryPass =
    !pairExpected ||
    matchesPairActivityCategories(
      execution.outings,
      expected.expectedActivityCategories ?? [],
    );

  const pairGeographyPass =
    !pairExpected ||
    matchesPairGeography(
      execution.outings,
      expected.expectedGeography ?? [],
    );

  const pairDistancePass =
    !pairExpected ||
    matchesPairDistance(
      execution.outings,
      expected.maximumDistanceMiles ?? null,
    );

  const pairTravelTimePass =
    !pairExpected ||
    matchesPairTravelTime(
      execution.outings,
      expected.maximumTravelMinutes ?? null,
    );

  const routeVerificationRequired =
    pairExpected && Boolean(expected.requireVerifiedRoute);

  const verifiedRouteCoverage =
    execution.outings.length > 0 &&
    execution.outings.every((outing) =>
      outing.metadata.routeConfidence === "verified"
    );

  const pairRouteVerifiedPass =
    !routeVerificationRequired || verifiedRouteCoverage;

  const pairSequencingPass =
    !pairExpected ||
    matchesPairSequence(
      execution.outings,
      expected.expectedSequence ?? null,
    );

  const pairRestaurantTermsPass =
    !pairExpected ||
    matchesPairRestaurantTerms(
      execution.outings,
      expected.expectedRestaurantTerms ?? [],
    );

  const pairRelevancePass =
    !pairExpected ||
    (
      pairActivityCategoryPass &&
      pairGeographyPass &&
      pairRestaurantTermsPass
    );

  const pairedDomainCoveragePass = minimumPairsPass;
  const distanceLeakage =
    pairExpected &&
    expected.maximumDistanceMiles != null &&
    execution.outings.some((outing) =>
      outing.distanceMiles == null ||
      outing.distanceMiles > Number(expected.maximumDistanceMiles) + 1e-9
    );

  const travelTimeLeakage =
    pairExpected &&
    expected.maximumTravelMinutes != null &&
    execution.outings.some((outing) =>
      outing.travelMinutes == null ||
      outing.travelMinutes > Number(expected.maximumTravelMinutes) + 1e-9
    );

  const noResultRegression =
    options.legacyCount > 0 &&
    execution.candidates.length === 0;

  const passed =
    exactDomainCoveragePass &&
    minimumResultsPass &&
    geographyPass &&
    restaurantTermsPass &&
    prohibitedCategoriesPass &&
    minimumPairsPass &&
    pairRelevancePass &&
    pairDistancePass &&
    pairTravelTimePass &&
    pairRouteVerifiedPass &&
    pairSequencingPass &&
    !noResultRegression;

  return {
    passed,
    resultCount: execution.candidates.length,
    pairCount: execution.outings.length,
    expectedDomains,
    servedDomains,
    missingDomains,
    unexpectedDomains,
    exactDomainCoveragePass,
    minimumResultsPass,
    geographyPass,
    restaurantTermsPass,
    prohibitedCategoriesPass,
    pairedDomainCoveragePass,
    minimumPairsPass,
    pairRelevancePass,
    pairActivityCategoryPass,
    pairGeographyPass,
    pairDistancePass,
    pairTravelTimePass,
    pairRouteVerifiedPass,
    routeVerificationRequired,
    verifiedRouteCoverage,
    pairSequencingPass,
    distanceLeakage,
    travelTimeLeakage,
    noResultRegression,
    latencyMs: options.latencyMs,
    candidateDomainCounts: domainCounts,
    topCandidates: execution.candidates.slice(0, 10).map((candidate) => ({
      locationId: candidate.locationId,
      rank: candidate.finalRank,
      score: candidate.frameworkScore,
      domains: candidateComparisonDomains(candidate),
    })),
    topOutings: execution.outings.slice(0, 10).map((outing) => ({
      outingId: outing.outingId,
      restaurantId: outing.restaurant.locationId,
      activityId: outing.activity.locationId,
      score: outing.score,
      distanceMiles: outing.distanceMiles,
      travelMinutes: outing.travelMinutes,
      travelMode: outing.travelMode,
      sequence: outing.sequence,
      routeSource: outing.metadata.routeSource,
      routeConfidence: outing.metadata.routeConfidence,
    })),
  };
}

export function buildV3ReplayMetrics(
  rows: Array<{
    canonicalPassed: boolean;
    v3?: V3ReplayComparison | null;
    contractFailure?: boolean;
  }>,
): V3ReplayMetrics {
  const comparable = rows.filter((row) => row.v3);
  const denominator = comparable.length || 1;
  const paired = comparable.filter((row) =>
    row.v3 &&
    row.v3.expectedDomains.includes("restaurant") &&
    row.v3.expectedDomains.includes("activity")
  );
  const pairedDenominator = paired.length || 1;
  const routeRequired = comparable.filter((row) => row.v3?.routeVerificationRequired);
  const routeRequiredDenominator = routeRequired.length || 1;

  const pct = (count: number, base = denominator) =>
    base > 0 ? (count / base) * 100 : 100;

  const pairSuccessCount = paired.filter((row) =>
    row.v3?.minimumPairsPass &&
    row.v3?.pairRelevancePass &&
    row.v3?.pairDistancePass &&
    row.v3?.pairTravelTimePass &&
    row.v3?.pairRouteVerifiedPass &&
    row.v3?.pairSequencingPass
  ).length;

  const pairSuccessRate = pct(pairSuccessCount, pairedDenominator);

  return {
    total: rows.length,
    successRate: pct(comparable.filter((row) => row.v3?.passed).length),
    exactDomainCoverageRate: pct(
      comparable.filter((row) => row.v3?.exactDomainCoveragePass).length,
    ),
    geographyPassRate: pct(
      comparable.filter((row) => row.v3?.geographyPass).length,
    ),
    restaurantTermsPassRate: pct(
      comparable.filter((row) => row.v3?.restaurantTermsPass).length,
    ),
    prohibitedCategoryViolationRate: pct(
      comparable.filter((row) => row.v3 && !row.v3.prohibitedCategoriesPass).length,
    ),
    pairedDomainCoverageRate: pairSuccessRate,
    pairSuccessRate,
    pairRelevancePassRate: pct(
      paired.filter((row) => row.v3?.pairRelevancePass).length,
      pairedDenominator,
    ),
    pairDistanceLeakageRate: pct(
      paired.filter((row) => row.v3?.distanceLeakage).length,
      pairedDenominator,
    ),
    pairTravelTimeLeakageRate: pct(
      paired.filter((row) => row.v3?.travelTimeLeakage).length,
      pairedDenominator,
    ),
    pairRouteVerificationRate: pct(
      routeRequired.filter((row) => row.v3?.verifiedRouteCoverage).length,
      routeRequiredDenominator,
    ),
    pairSequencingPassRate: pct(
      paired.filter((row) => row.v3?.pairSequencingPass).length,
      pairedDenominator,
    ),
    noResultRegressionRate: pct(
      comparable.filter((row) => row.v3?.noResultRegression).length,
    ),
    p95LatencyMs: percentile(
      comparable.map((row) => Number(row.v3?.latencyMs ?? 0)),
      95,
    ),
    contractFailureCount: rows.filter((row) => row.contractFailure).length,
    v3OnlyPassCount: comparable.filter((row) => row.v3?.passed && !row.canonicalPassed).length,
    canonicalOnlyPassCount: comparable.filter((row) => !row.v3?.passed && row.canonicalPassed).length,
    bothPassCount: comparable.filter((row) => row.v3?.passed && row.canonicalPassed).length,
    bothFailCount: comparable.filter((row) => !row.v3?.passed && !row.canonicalPassed).length,
  };
}

export function snapshotV3Execution(execution: SearchV3Execution) {
  return {
    contractVersion: execution.contractVersion,
    intent: execution.intent,
    metadata: execution.metadata,
    retrieval: execution.retrieval.map((lane) => ({
      lane: lane.lane,
      candidateCount: lane.candidates.length,
      elapsedMs: lane.elapsedMs,
      truncated: lane.truncated ?? false,
    })),
    candidates: execution.candidates.slice(0, 20).map((candidate) => ({
      locationId: candidate.locationId,
      finalRank: candidate.finalRank,
      frameworkScore: candidate.frameworkScore,
      domains: candidateComparisonDomains(candidate),
      geo: candidate.intelligence.geo,
      taxonomy: {
        restaurantCategories: candidate.intelligence.taxonomy.restaurantCategories,
        activityCategories: candidate.intelligence.taxonomy.activityCategories,
        nightlifeCategories: candidate.intelligence.taxonomy.nightlifeCategories,
        cuisines: candidate.intelligence.taxonomy.cuisines,
        foods: candidate.intelligence.taxonomy.foods,
        mealPeriods: candidate.intelligence.taxonomy.mealPeriods,
        features: candidate.intelligence.taxonomy.features,
      },
      ranking: candidate.metadata.ranking ?? null,
    })),
    outings: execution.outings.slice(0, 20).map((outing) => ({
      outingId: outing.outingId,
      restaurantId: outing.restaurant.locationId,
      activityId: outing.activity.locationId,
      score: outing.score,
      distanceMiles: outing.distanceMiles,
      travelMinutes: outing.travelMinutes,
      travelMode: outing.travelMode,
      sequence: outing.sequence,
      reasons: outing.reasons,
      scoreComponents: outing.metadata.scoreComponents,
      scoreWeights: outing.metadata.scoreWeights,
      withinTravelLimit: outing.metadata.withinTravelLimit,
      routeSource: outing.metadata.routeSource,
      routeConfidence: outing.metadata.routeConfidence,
      straightLineMiles: outing.metadata.straightLineMiles,
      routeDistanceMiles: outing.metadata.routeDistanceMiles,
    })),
    trace: execution.trace,
  };
}

function countCandidateDomains(
  candidates: readonly SearchCandidate[],
): Record<string, number> {
  const counts: Record<string, number> = {
    restaurant: 0,
    activity: 0,
  };

  for (const candidate of candidates) {
    for (const domain of candidateComparisonDomains(candidate)) {
      counts[domain] = (counts[domain] ?? 0) + 1;
    }
  }

  return counts;
}

function candidateComparisonDomains(candidate: SearchCandidate): string[] {
  const domains = new Set(
    [
      candidate.intelligence.identity.primaryDomain,
      ...candidate.intelligence.identity.supportedDomains,
    ].map(normalizeComparisonDomain),
  );
  domains.delete("venue");
  return [...domains].sort();
}

function normalizeComparisonDomain(domain: string): string {
  return domain === "nightlife" ? "activity" : domain;
}

function matchesExpectedGeography(
  candidates: readonly SearchCandidate[],
  expected: readonly string[],
): boolean {
  if (expected.length === 0) return true;
  return candidates.some((candidate) => candidateMatchesGeography(candidate, expected));
}

function matchesPairGeography(
  outings: readonly SearchOuting[],
  expected: readonly string[],
): boolean {
  if (expected.length === 0) return true;
  return outings.some((outing) =>
    candidateMatchesGeography(outing.restaurant, expected) &&
    candidateMatchesGeography(outing.activity, expected)
  );
}

function candidateMatchesGeography(
  candidate: SearchCandidate,
  expected: readonly string[],
): boolean {
  if (expected.length === 0) return true;
  const normalizedExpected = expected.map(normalizeText);
  const values = [
    candidate.intelligence.geo.neighborhood,
    candidate.intelligence.geo.borough,
    candidate.intelligence.geo.city,
    candidate.intelligence.geo.county,
    candidate.intelligence.geo.state,
    candidate.intelligence.geo.market,
  ].filter((value): value is string => Boolean(value));

  return normalizedExpected.some((needle) =>
    values.some((value) => normalizeText(value).includes(needle))
  );
}

function matchesExpectedRestaurantTerms(
  candidates: readonly SearchCandidate[],
  expected: readonly string[],
): boolean {
  if (expected.length === 0) return true;

  const restaurantCandidates = candidates.filter((candidate) =>
    candidateComparisonDomains(candidate).includes("restaurant")
  );

  return expected.every((term) =>
    restaurantCandidates.some((candidate) =>
      candidateSearchTerms(candidate.intelligence).some((value) =>
        normalizeText(value).includes(normalizeText(term))
      )
    )
  );
}

function matchesPairRestaurantTerms(
  outings: readonly SearchOuting[],
  expected: readonly string[],
): boolean {
  if (expected.length === 0) return true;
  return expected.every((term) =>
    outings.some((outing) =>
      candidateSearchTerms(outing.restaurant.intelligence).some((value) =>
        normalizeText(value).includes(normalizeText(term))
      )
    )
  );
}

function matchesPairActivityCategories(
  outings: readonly SearchOuting[],
  expected: readonly string[],
): boolean {
  if (expected.length === 0) return true;
  return expected.every((term) =>
    outings.some((outing) => {
      const values = [
        ...outing.activity.intelligence.identity.categories,
        ...outing.activity.intelligence.taxonomy.activityCategories,
        ...outing.activity.intelligence.taxonomy.nightlifeCategories,
        ...outing.activity.intelligence.taxonomy.features,
        ...outing.activity.intelligence.taxonomy.offerings,
      ];
      return values.some((value) =>
        normalizeText(value).includes(normalizeText(term))
      );
    })
  );
}

function matchesPairDistance(
  outings: readonly SearchOuting[],
  maximumDistanceMiles: number | null,
): boolean {
  if (maximumDistanceMiles == null) return true;
  if (!outings.length) return false;

  return outings.every((outing) =>
    outing.distanceMiles != null &&
    outing.distanceMiles <= maximumDistanceMiles + 1e-9
  );
}

function matchesPairTravelTime(
  outings: readonly SearchOuting[],
  maximumTravelMinutes: number | null,
): boolean {
  if (maximumTravelMinutes == null) return true;
  if (!outings.length) return false;

  return outings.every((outing) =>
    outing.travelMinutes != null &&
    outing.travelMinutes <= maximumTravelMinutes + 1e-9
  );
}

function matchesPairSequence(
  outings: readonly SearchOuting[],
  expectedSequence: string | null,
): boolean {
  if (!expectedSequence) return true;
  return outings.some((outing) => outing.sequence === expectedSequence);
}

function avoidsProhibitedCategories(
  candidates: readonly SearchCandidate[],
  prohibited: readonly string[],
): boolean {
  if (prohibited.length === 0) return true;
  const normalized = prohibited.map(normalizeText);

  return candidates.every((candidate) =>
    candidateSearchTerms(candidate.intelligence).every((value) =>
      !normalized.some((term) => normalizeText(value).includes(term))
    )
  );
}

function candidateSearchTerms(
  intelligence: LocationIntelligenceProfile,
): string[] {
  return [
    ...intelligence.identity.categories,
    ...intelligence.taxonomy.restaurantCategories,
    ...intelligence.taxonomy.activityCategories,
    ...intelligence.taxonomy.nightlifeCategories,
    ...intelligence.taxonomy.cuisines,
    ...intelligence.taxonomy.foods,
    ...intelligence.taxonomy.dishes,
    ...intelligence.taxonomy.features,
    ...intelligence.taxonomy.offerings,
    ...intelligence.taxonomy.vibes,
    ...intelligence.taxonomy.occasions,
    ...intelligence.taxonomy.audiences,
  ];
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}
