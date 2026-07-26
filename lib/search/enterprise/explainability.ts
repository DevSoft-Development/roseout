import type { QualityRankEvidence, QualityRolloutMode } from "./phaseTwoRanking";

const MAX_EXPLANATIONS_PER_TYPE = 20;
const MAX_REJECTIONS = 20;
const SCORE_KEYS = [
  "lexical", "semantic", "cuisineMatch", "activityMatch", "occasionMatch",
  "geoMatch", "quality", "popularity", "availability", "personalization",
  "penalties", "final",
] as const;

type RankingInput = {
  mode?: unknown;
  interpretation?: unknown;
  restaurants?: unknown;
  activities?: unknown;
  pairs?: unknown;
  rejectedPairs?: unknown;
};

const finite = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};

function mode(value: unknown): QualityRolloutMode {
  return value === "enabled" || value === "shadow" ? value : "disabled";
}

function safeEvidence(value: unknown, resultType: "restaurant" | "activity" | "pair") {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_EXPLANATIONS_PER_TYPE).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as QualityRankEvidence;
    const breakdown = item.breakdown && typeof item.breakdown === "object"
      ? Object.fromEntries(SCORE_KEYS.map((key) => [key, finite(item.breakdown?.[key])]))
      : undefined;
    const status = ["ranking_unchanged", "shadow_only", "ranking_applied", "rejected"].includes(item.status)
      ? item.status
      : "ranking_unchanged";
    return [{
      id: `${resultType}-${index + 1}`,
      resultType,
      oldRank: Math.max(1, Math.round(finite(item.oldRank))),
      newRank: Math.max(1, Math.round(finite(item.newRank))),
      rankMovement: Math.round(finite(item.oldRank) - finite(item.newRank)),
      scoreDelta: finite(item.scoreDelta),
      status,
      ...(breakdown ? { breakdown } : {}),
    }];
  });
}

function safeRejections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_REJECTIONS).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const reason = String((raw as Record<string, unknown>).reason ?? "rejected")
      .toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 80);
    return [{ id: `pair-rejected-${index + 1}`, resultType: "pair", status: "rejected", reason }];
  });
}

/** Serializes only ranking evidence produced by the live rerankers. */
export function serializeSearchRankingExplanations(input: unknown) {
  const ranking = input && typeof input === "object" ? input as RankingInput : {};
  const rankingMode = mode(ranking.mode);
  const restaurants = safeEvidence(ranking.restaurants, "restaurant");
  const activities = safeEvidence(ranking.activities, "activity");
  const pairs = safeEvidence(ranking.pairs, "pair");
  const rejectedPairs = safeRejections(ranking.rejectedPairs);
  const searchExplanations = [...restaurants, ...activities, ...pairs, ...rejectedPairs];
  return {
    rankingMode,
    rankingApplied: rankingMode === "enabled" && searchExplanations.some((item) => item.status === "ranking_applied"),
    searchQualityRanking: {
      mode: rankingMode,
      interpretation: ["same_venue", "two_stop", "either"].includes(String(ranking.interpretation))
        ? ranking.interpretation : "either",
      restaurants, activities, pairs, rejectedPairs,
    },
    searchExplanations,
  };
}

export const SEARCH_EXPLANATION_LIMITS = {
  perResultType: MAX_EXPLANATIONS_PER_TYPE,
  rejectedPairs: MAX_REJECTIONS,
} as const;
