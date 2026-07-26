export type SearchExplanation = {
  id?: string;
  resultType?: "restaurant" | "activity" | "pair" | "unknown";
  finalScore: number;
  baseScore: number;
  qualityAdjustment: number;
  mlAdjustment: number;
  geoAdjustment: number;
  personalizationAdjustment?: number;
  intentMatch?: string;
  routeConfidence?: string;
  routeSource?: string;
  temporalFeasibility?: string;
  penalties: string[];
  oldRank?: number;
  newRank?: number;
  cacheStatus?: string;
};

type QualityEvidence = {
  id?: unknown;
  oldRank?: unknown;
  newRank?: unknown;
  scoreDelta?: unknown;
  breakdown?: Record<string, unknown>;
};

const boundedText = (value: unknown, max = 160) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined;

const boundedNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(-10_000, Math.min(10_000, parsed))
    : 0;
};

const optionalNumber = (value: unknown) =>
  value == null ? undefined : boundedNumber(value);

function stringPenalties(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, 12)
    .map((item) => item.slice(0, 120));
}

export function serializeSearchExplanation(
  value: unknown,
): SearchExplanation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const resultType = boundedText(source.resultType, 20);

  return {
    id: boundedText(source.id, 160),
    resultType:
      resultType === "restaurant" ||
      resultType === "activity" ||
      resultType === "pair"
        ? resultType
        : resultType
          ? "unknown"
          : undefined,
    finalScore: boundedNumber(source.finalScore),
    baseScore: boundedNumber(source.baseScore),
    qualityAdjustment: boundedNumber(source.qualityAdjustment),
    mlAdjustment: boundedNumber(source.mlAdjustment),
    geoAdjustment: boundedNumber(source.geoAdjustment),
    personalizationAdjustment: optionalNumber(
      source.personalizationAdjustment,
    ),
    intentMatch: boundedText(source.intentMatch),
    routeConfidence: boundedText(source.routeConfidence, 32),
    routeSource: boundedText(source.routeSource, 32),
    temporalFeasibility: boundedText(source.temporalFeasibility, 32),
    penalties: stringPenalties(source.penalties),
    oldRank: optionalNumber(source.oldRank),
    newRank: optionalNumber(source.newRank),
    cacheStatus: boundedText(source.cacheStatus, 32),
  };
}

export function serializeSearchExplanations(values: unknown, limit = 50) {
  return (Array.isArray(values) ? values : [])
    .slice(0, Math.max(0, Math.min(100, limit)))
    .map(serializeSearchExplanation)
    .filter((value): value is SearchExplanation => value !== null);
}

function qualityEvidenceList(value: unknown): QualityEvidence[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is QualityEvidence =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function explanationFromEvidence(
  evidence: QualityEvidence,
  resultType: SearchExplanation["resultType"],
): SearchExplanation {
  const breakdown =
    evidence.breakdown && typeof evidence.breakdown === "object"
      ? evidence.breakdown
      : {};
  const scoreDelta = boundedNumber(evidence.scoreDelta);
  const penaltyScore = boundedNumber(breakdown.penalties);
  const penalties = stringPenalties(breakdown.penaltyReasons);

  if (penaltyScore < 0 && penalties.length === 0) {
    penalties.push(`quality_penalty:${penaltyScore}`);
  }

  const intentMatches = [
    boundedNumber(breakdown.cuisineMatch) > 0 ? "cuisine" : null,
    boundedNumber(breakdown.activityMatch) > 0 ? "activity" : null,
    boundedNumber(breakdown.occasionMatch) > 0 ? "occasion" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    id: boundedText(evidence.id, 160),
    resultType,
    finalScore: scoreDelta,
    baseScore: 0,
    qualityAdjustment: scoreDelta,
    mlAdjustment: boundedNumber(breakdown.mlAdjustment),
    geoAdjustment: boundedNumber(breakdown.geoAdjustment),
    personalizationAdjustment: optionalNumber(
      breakdown.personalizationAdjustment,
    ),
    intentMatch: intentMatches.length ? intentMatches.join(", ") : undefined,
    routeConfidence: boundedText(breakdown.routeConfidence, 32),
    routeSource: boundedText(breakdown.routeSource, 32),
    temporalFeasibility: boundedText(breakdown.temporalFeasibility, 32),
    penalties,
    oldRank: optionalNumber(evidence.oldRank),
    newRank: optionalNumber(evidence.newRank),
    cacheStatus: boundedText(breakdown.cacheStatus, 32),
  };
}

export function buildSearchExplanationsFromQualityRanking(
  qualityRanking: unknown,
  limit = 50,
) {
  if (!qualityRanking || typeof qualityRanking !== "object") return [];

  const source = qualityRanking as Record<string, unknown>;
  const explanations = [
    ...qualityEvidenceList(source.restaurants).map((item) =>
      explanationFromEvidence(item, "restaurant"),
    ),
    ...qualityEvidenceList(source.activities).map((item) =>
      explanationFromEvidence(item, "activity"),
    ),
    ...qualityEvidenceList(source.pairs).map((item) =>
      explanationFromEvidence(item, "pair"),
    ),
  ];

  return serializeSearchExplanations(explanations, limit);
}
