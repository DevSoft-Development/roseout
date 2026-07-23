import {
  detectActivityTerms,
  qualifyExplicitActivityIntent,
} from "@/lib/search/enterprise/taxonomy";

const GENERIC_ACTIVITY_TERMS = new Set([
  "activity",
  "activities",
  "thing to do",
  "things to do",
  "something to do",
  "something fun",
  "fun",
  "fun activity",
  "outing",
  "experience",
  "entertainment",
]);

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function activityTermsFromPayload(payload: any, query: string): string[] {
  const debug = payload?.debug ?? payload?.debugParity ?? payload?.metadata?.debugParity;
  const normalizedIntent =
    debug?.normalizedIntent ?? payload?.normalizedIntent ?? payload?.metadata?.normalizedIntent;
  const intent = debug?.intent ?? payload?.intent;

  const structuredTerms = uniqueStrings([
    ...(normalizedIntent?.activityIntent?.activityTerms ?? []),
    ...(normalizedIntent?.activityIntent?.categoryTerms ?? []),
    ...(intent?.activityIntent?.activityTerms ?? []),
    ...(intent?.activityIntent?.categoryTerms ?? []),
    ...(payload?.secondary_intents ?? []),
    ...(payload?.metadata?.secondary_intents ?? []),
  ]);

  const detectedTerms = uniqueStrings(detectActivityTerms(query));
  const candidates = structuredTerms.length > 0 ? structuredTerms : detectedTerms;

  return candidates.filter((term) => !GENERIC_ACTIVITY_TERMS.has(term));
}

function pairActivity(pair: any): any {
  return pair?.activity ?? pair?.activity_location ?? pair?.activityLocation ?? null;
}

function itemId(item: any): string | null {
  const value = item?.id ?? item?.location_id ?? item?.source_id;
  return typeof value === "string" && value ? value : null;
}

function isActivityCard(item: any): boolean {
  return (
    item?.location_type === "activity" ||
    item?.type === "activity" ||
    Boolean(item?.activity_type) ||
    Boolean(item?.activity_name)
  );
}

export function applyFinalPublicActivityGuard<T>(payload: T, query: string): T {
  if (!payload || typeof payload !== "object") return payload;

  const result: any = { ...(payload as any) };
  const explicitTerms = activityTermsFromPayload(result, query);
  if (explicitTerms.length === 0) return payload;

  const rawActivities = Array.isArray(result.activities) ? result.activities : [];
  const qualifiedActivities = rawActivities.filter((activity: any) =>
    qualifyExplicitActivityIntent(activity, explicitTerms).matches,
  );
  const qualifiedActivityIds = new Set(
    qualifiedActivities.map(itemId).filter((id): id is string => Boolean(id)),
  );

  const rawPairs = Array.isArray(result.pairs) ? result.pairs : [];
  const qualifiedPairs = rawPairs.filter((pair: any) => {
    const activity = pairActivity(pair);
    return Boolean(
      activity && qualifyExplicitActivityIntent(activity, explicitTerms).matches,
    );
  });

  const filterCards = (cards: unknown) =>
    Array.isArray(cards)
      ? cards.filter((card: any) => {
          if (!isActivityCard(card)) return true;
          const id = itemId(card);
          if (id && qualifiedActivityIds.has(id)) return true;
          return qualifyExplicitActivityIntent(card, explicitTerms).matches;
        })
      : cards;

  result.activities = qualifiedActivities;
  result.pairs = qualifiedPairs;
  result.cards = filterCards(result.cards);
  result.matched_locations = filterCards(result.matched_locations);
  result.matchedLocations = filterCards(result.matchedLocations);
  result.activityCount = qualifiedActivities.length;
  result.pairCount = qualifiedPairs.length;

  if (result.card_counts && typeof result.card_counts === "object") {
    result.card_counts = {
      ...result.card_counts,
      activities: qualifiedActivities.length,
      pairs: qualifiedPairs.length,
    };
  }
  if (result.cardCounts && typeof result.cardCounts === "object") {
    result.cardCounts = {
      ...result.cardCounts,
      activities: qualifiedActivities.length,
      pairs: qualifiedPairs.length,
    };
  }

  const updateCountObject = (counts: any) => {
    if (!counts || typeof counts !== "object") return counts;
    return {
      ...counts,
      activities: qualifiedActivities.length,
      activityCount: qualifiedActivities.length,
      qualifiedActivityCount: qualifiedActivities.length,
      pairs: qualifiedPairs.length,
      pairCount: qualifiedPairs.length,
      primaryPairCount: qualifiedPairs.length,
      finalDisplayedResultCount:
        qualifiedPairs.length > 0
          ? qualifiedPairs.length
          : Number(counts.finalDisplayedResultCount ?? qualifiedActivities.length),
    };
  };

  result.counts = updateCountObject(result.counts);
  result.resultCounts = updateCountObject(result.resultCounts);
  result.debugParity = updateCountObject(result.debugParity);
  if (result.debugParity?.resultCounts) {
    result.debugParity = {
      ...result.debugParity,
      resultCounts: updateCountObject(result.debugParity.resultCounts),
    };
  }

  if (result.debug && typeof result.debug === "object") {
    result.debug = {
      ...result.debug,
      qualifiedActivityCount: qualifiedActivities.length,
      primaryPairCount: qualifiedPairs.length,
      resultCounts: updateCountObject(result.debug.resultCounts),
    };
  }

  if (result.metadata && typeof result.metadata === "object") {
    const resultIds = Array.isArray(result.metadata.result_ids)
      ? result.metadata.result_ids.filter(
          (item: any) =>
            item?.location_type !== "activity" ||
            qualifiedActivityIds.has(item?.location_id),
        )
      : result.metadata.result_ids;
    const pairIds = Array.isArray(result.metadata.pair_ids)
      ? result.metadata.pair_ids.filter((item: any) => {
          const activityId = item?.activity_location_id;
          return !activityId || qualifiedActivityIds.has(activityId);
        })
      : result.metadata.pair_ids;

    result.metadata = {
      ...result.metadata,
      result_ids: resultIds,
      pair_ids: pairIds,
      qualifiedActivityCount: qualifiedActivities.length,
      primaryPairCount: qualifiedPairs.length,
      debugParity: updateCountObject(result.metadata.debugParity),
    };
  }

  return result;
}
