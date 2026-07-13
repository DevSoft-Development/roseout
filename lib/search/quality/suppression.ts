import type { EnterpriseLocation, EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import { detectExpectedAudience } from "./rules/audience-intent";

const ADULT_ONLY = /\b(21\+|adults only|nightclub|hookah|strip club|adult entertainment)\b/i;
const ADULT_ORIENTED = /\b(nightlife|late night|bar|cocktail|lounge)\b/i;
const TEEN_FRIENDLY = /\b(arcade|bowling|museum|mini golf|escape room|games|interactive|all ages|family friendly|park|art studio|workshop)\b/i;

function recordText(record: EnterpriseLocation) {
  return [
    record.name,
    record.activity_name,
    record.primary_category,
    record.activity_type,
    record.description,
    record.search_document,
    ...(Array.isArray(record.tags) ? record.tags : []),
    ...(Array.isArray(record.intent_tags) ? record.intent_tags : []),
    ...(Array.isArray(record.semantic_tags) ? record.semantic_tags : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function safetyScore(record: EnterpriseLocation) {
  const text = recordText(record);
  let score = 0;
  if (TEEN_FRIENDLY.test(text)) score += 200;
  if (/\ball ages\b|\bfamily friendly\b/.test(text)) score += 120;
  if (ADULT_ORIENTED.test(text)) score -= 120;
  if (ADULT_ONLY.test(text)) score -= 1000;
  return score;
}

function neutralizeConflictingBoosts(record: EnterpriseLocation): EnterpriseLocation {
  const reasons = Array.isArray(record.activityQualityReasons) ? record.activityQualityReasons : [];
  const conflicting = reasons.some((reason) => /nightlife|drinks\/lounge/i.test(String(reason)));
  if (!conflicting) return record;
  const removedBoost = Math.max(0, Number(record.intent_boost ?? record.ml_boost ?? 0));
  return {
    ...record,
    intent_boost: 0,
    ml_boost: 0,
    activityQualityReasons: reasons.filter((reason) => !/nightlife|drinks\/lounge/i.test(String(reason))),
    audienceSafetyPenalty: Math.max(120, removedBoost),
  };
}

function guard(records: EnterpriseLocation[]) {
  const normalized = records.map(neutralizeConflictingBoosts);
  const kept = normalized.filter((record) => !ADULT_ONLY.test(recordText(record)));
  return kept
    .map((record, index) => ({ record, index, score: safetyScore(record) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ record }) => record);
}

export function applyAudienceSafetyToSearchResult(query: string, result: EnterpriseSearchResult): EnterpriseSearchResult {
  const audience = (result.debug as any)?.audienceIntent?.type ?? detectExpectedAudience(query);
  if (!audience || !["teen", "kids", "family"].includes(audience)) return result;

  const activities = guard(result.activities ?? []);
  const restaurants = guard(result.restaurants ?? []);
  const matchedLocations = guard((result.matched_locations ?? result.matchedLocations ?? []) as EnterpriseLocation[]);
  const suppressedCount = (result.activities?.length ?? 0) + (result.restaurants?.length ?? 0) - activities.length - restaurants.length;

  return {
    ...result,
    activities,
    restaurants,
    matched_locations: matchedLocations,
    matchedLocations,
    card_counts: {
      ...result.card_counts,
      activities: activities.length,
      restaurants: restaurants.length,
      matched_locations: matchedLocations.length,
    },
    cardCounts: result.cardCounts ? {
      ...result.cardCounts,
      activities: activities.length,
      restaurants: restaurants.length,
      matched_locations: matchedLocations.length,
    } : result.cardCounts,
    debug: {
      ...(result.debug ?? {}),
      audienceSafetyApplied: true,
      audienceSafetyAudience: audience,
      audienceSafetySuppressedCount: suppressedCount,
      audienceSafetyOrderReappliedAfterMl: true,
    },
  };
}
