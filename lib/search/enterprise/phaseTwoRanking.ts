import type { EnterpriseLocation, EnterprisePair, SearchIntent } from "./types";
import {
  personalizationAdjustment,
  personalizationMode,
  type PersonalizationMode,
  type UserPreferenceProfile,
} from "./personalization";
import {
  buildSearchScoreBreakdown,
  detectSearchInterpretation,
  evaluateTemporalFeasibility,
  resolveRouteEvidence,
  type SearchScoreBreakdown,
} from "./phaseOneQuality";

export type QualityRolloutMode = "disabled" | "shadow" | "enabled";
export type QualityRankEvidence = {
  id: string;
  oldRank: number;
  newRank: number;
  scoreDelta: number;
  status: "ranking_unchanged" | "shadow_only" | "ranking_applied" | "rejected";
  breakdown?: SearchScoreBreakdown;
};

export function searchQualityRolloutMode(
  value = process.env.SEARCH_QUALITY_RANKING_MODE,
): QualityRolloutMode {
  return value === "enabled" || value === "shadow" ? value : "disabled";
}

const baseScore = (item: EnterpriseLocation) =>
  Number(item.score ?? item.final_score ?? item.ml_score ?? 0) || 0;

const boundedAdjustment = (breakdown: SearchScoreBreakdown) =>
  Math.max(
    -20,
    Math.min(
      20,
      breakdown.cuisineMatch * 0.2 +
        breakdown.activityMatch * 0.2 +
        breakdown.occasionMatch * 0.15 +
        breakdown.availability * 0.2 +
        breakdown.penalties * 0.15,
    ),
  );

export function rerankLocations(
  items: EnterpriseLocation[],
  intent: SearchIntent,
  options: {
    mode?: QualityRolloutMode;
    debug?: boolean;
    profile?: UserPreferenceProfile;
    personalization?: PersonalizationMode;
  } = {},
) {
  const mode = options.mode ?? searchQualityRolloutMode();
  const interpretation = detectSearchInterpretation(intent);

  if (mode === "disabled") {
    return {
      results: items,
      shadowResults: items,
      evidence: [] as QualityRankEvidence[],
      interpretation,
      applied: false,
      personalization: { adjustmentCount: 0, orderChanged: false },
    };
  }

  const personalization =
    options.personalization ?? personalizationMode();
  const explicitIntent = {
    cuisines: intent.restaurantIntent?.cuisineTerms ?? [],
    activities: intent.activityIntent?.activityTerms ?? [],
  };

  const scored = items
    .map((item, oldIndex) => {
      const breakdown = buildSearchScoreBreakdown(item, intent);
      const personal = personalizationAdjustment(
        options.profile,
        item,
        explicitIntent,
      );
      const adjustment =
        boundedAdjustment(breakdown) +
        (personalization !== "disabled" ? personal : 0);

      return {
        item,
        oldIndex,
        breakdown,
        adjustment,
        score: baseScore(item) + adjustment,
      };
    })
    .sort((a, b) => b.score - a.score || a.oldIndex - b.oldIndex);

  const evidence = scored.slice(0, 50).map((entry, newIndex) => ({
    id: String(entry.item.id ?? ""),
    oldRank: entry.oldIndex + 1,
    newRank: newIndex + 1,
    scoreDelta: entry.adjustment,
    status: mode === "enabled" ? "ranking_applied" : "shadow_only",
    ...(options.debug ? { breakdown: entry.breakdown } : {}),
  })) satisfies QualityRankEvidence[];

  const ranked = scored.map((entry) =>
    options.debug
      ? {
          ...entry.item,
          searchQuality: {
            adjustment: entry.adjustment,
            breakdown: entry.breakdown,
          },
        }
      : entry.item,
  );
  const baselineOrder = items
    .map((item, oldIndex) => ({
      oldIndex,
      score: baseScore(item) + boundedAdjustment(buildSearchScoreBreakdown(item, intent)),
    }))
    .sort((a, b) => b.score - a.score || a.oldIndex - b.oldIndex)
    .map((entry) => entry.oldIndex);
  const baselineRanked = baselineOrder.map((oldIndex) => items[oldIndex]);

  return {
    results:
      mode === "enabled"
        ? personalization === "enabled"
          ? ranked
          : baselineRanked
        : items,
    shadowResults: ranked,
    evidence,
    interpretation,
    applied: mode === "enabled",
    personalization: {
      adjustmentCount: scored.filter((entry) =>
        personalizationAdjustment(options.profile, entry.item, explicitIntent) > 0,
      ).length,
      orderChanged:
        personalization !== "disabled" &&
        scored.some((entry, index) => entry.oldIndex !== baselineOrder[index]),
    },
  };
}

export function rerankPairs(
  items: EnterprisePair[],
  intent: SearchIntent,
  options: { mode?: QualityRolloutMode; debug?: boolean } = {},
) {
  const mode = options.mode ?? searchQualityRolloutMode();

  if (mode === "disabled") {
    return {
      results: items,
      shadowResults: items,
      evidence: [] as QualityRankEvidence[],
      rejected: [] as Array<{ id: string; reason: string }>,
      applied: false,
    };
  }

  const rejected: Array<{ id: string; reason: string }> = [];
  const scored = items
    .map((item, oldIndex) => {
      const route = resolveRouteEvidence(item);
      const temporal = evaluateTemporalFeasibility({
        pair: item,
        outingDateTimeISO: intent.parsedDateTimeISO,
      });
      const restaurantBreakdown = buildSearchScoreBreakdown(
        item.restaurant,
        intent,
      );
      const activityBreakdown = buildSearchScoreBreakdown(item.activity, intent);
      let adjustment = Math.max(
        -25,
        Math.min(
          25,
          (boundedAdjustment(restaurantBreakdown) +
            boundedAdjustment(activityBreakdown)) /
            2 +
            (route.confidence === "verified" ? 3 : 0),
        ),
      );

      if (temporal.status === "infeasible") {
        adjustment = -1000;
        rejected.push({
          id: String(`${item.restaurant.id}:${item.activity.id}`),
          reason: temporal.reason ?? "temporally_infeasible",
        });
      }

      return {
        item,
        oldIndex,
        adjustment,
        score: Number(item.score ?? 0) + adjustment,
        route,
        temporal,
      };
    })
    .sort((a, b) => b.score - a.score || a.oldIndex - b.oldIndex);

  const evidence = scored.map((entry, newIndex) => ({
    id: String(`${entry.item.restaurant.id}:${entry.item.activity.id}`),
    oldRank: entry.oldIndex + 1,
    newRank: newIndex + 1,
    scoreDelta: entry.adjustment,
    status:
      entry.temporal.status === "infeasible"
        ? "rejected"
        : mode === "enabled"
          ? "ranking_applied"
          : "shadow_only",
  })) satisfies QualityRankEvidence[];

  const ranked = scored
    .filter((entry) => entry.temporal.status !== "infeasible")
    .map((entry) =>
      options.debug
        ? {
            ...entry.item,
            searchQuality: {
              adjustment: entry.adjustment,
              route: entry.route,
              temporal: entry.temporal,
            },
          }
        : entry.item,
    );

  return {
    results: mode === "enabled" ? ranked : items,
    shadowResults: ranked,
    evidence,
    rejected,
    applied: mode === "enabled",
  };
}
