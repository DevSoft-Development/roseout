import type {
  LocationIntelligenceProfile,
  SearchCandidate,
  SearchV3Execution,
} from "@/lib/search-framework";
import type { GoldenQueryCase } from "./goldenQueries";

export type V3ReplayComparison = {
  passed: boolean;
  resultCount: number;
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
  noResultRegression: boolean;
  latencyMs: number;
  candidateDomainCounts: Record<string, number>;
  topCandidates: Array<{
    locationId: string;
    rank: number | null;
    score: number | null;
    domains: string[];
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

  const pairedDomainCoveragePass =
    Number(expected.minimumPairs ?? 0) <= 0 ||
    (
      domainCounts.restaurant > 0 &&
      domainCounts.activity > 0
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
    pairedDomainCoveragePass &&
    !noResultRegression;

  return {
    passed,
    resultCount: execution.candidates.length,
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
    noResultRegression,
    latencyMs: options.latencyMs,
    candidateDomainCounts: domainCounts,
    topCandidates: execution.candidates.slice(0, 10).map((candidate) => ({
      locationId: candidate.locationId,
      rank: candidate.finalRank,
      score: candidate.frameworkScore,
      domains: candidateComparisonDomains(candidate),
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
  const total = rows.length || 1;
  const comparable = rows.filter((row) => row.v3);
  const paired = comparable.filter((row) =>
    row.v3 && row.v3.expectedDomains.includes("restaurant") && row.v3.expectedDomains.includes("activity")
  );

  const pct = (count: number, denominator = total) =>
    denominator > 0 ? (count / denominator) * 100 : 100;

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
    pairedDomainCoverageRate: pct(
      paired.filter((row) => row.v3?.pairedDomainCoveragePass).length,
      paired.length || 1,
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
  const normalizedExpected = expected.map(normalizeText);

  return candidates.some((candidate) => {
    const values = [
      candidate.intelligence.geo.neighborhood,
      candidate.intelligence.geo.borough,
      candidate.intelligence.geo.city,
      candidate.intelligence.geo.county,
      candidate.intelligence.geo.state,
      candidate.intelligence.geo.market,
    ].filter((value): value is string => Boolean(value));

    return normalizedExpected.some((needle) =>
      values.some((value) => normalizeText(value).includes(needle)),
    );
  });
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
