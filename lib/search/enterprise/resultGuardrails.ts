import type {
  EnterpriseLocation,
  EnterprisePair,
  EnterpriseSearchResult,
} from "./types";

function text(row: EnterpriseLocation) {
  return [
    row.name,
    row.restaurant_name,
    row.activity_name,
    row.location_type,
    (row as any).activity_type,
    (row as any).primary_category,
    (row as any).tags,
    (row as any).search_keywords,
    (row as any).semantic_tags,
    (row as any).intent_tags,
    (row as any).date_style_tags,
    (row as any).best_for_tags,
    (row as any).search_document,
    (row as any).semantic_search_text,
    row.description,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function isMinorAudienceQuery(query: string) {
  return /\b(teen|teenage|teenager|kid|kids|child|children|family friendly|family-friendly|my son|my daughter)\b/i.test(
    query,
  );
}

function explicitlyRequestsAdultLeaningActivity(query: string) {
  return /\b(spa|massage|wellness|perfume|fragrance|bike shop|bicycle shop|shopping|retail)\b/i.test(
    query,
  );
}

function isWeakMinorAudienceResult(row: EnterpriseLocation) {
  const value = text(row);
  const positive =
    /\b(arcade|games?|gaming|museum|park|bowling|mini golf|escape room|claw|workshop|diy|art studio|interactive|all ages|family friendly|kid friendly|teen friendly|under 21|outdoor|sports|roller|ice skating)\b/.test(
      value,
    );
  const adultLeaning =
    /\b(spa|massage|wellness|perfume|fragrance|beauty treatment|couples massage|retail store|bike shop|bicycle shop|shopping)\b/.test(
      value,
    );
  const storeLike =
    /\b(store|shop|retail|dealer|showroom)\b/.test(value) &&
    !/\b(workshop|studio|experience|rental|tour)\b/.test(value);
  return !positive && (adultLeaning || storeLike);
}

function isRelaxedQuery(query: string) {
  return /\b(relaxed activity|relaxing activity|chill activity|casual activity|easy activity|low key|laid back)\b/i.test(
    query,
  );
}

function explicitlyRequestsNightlife(query: string) {
  return /\b(karaoke|club|nightclub|rooftop|lounge|bar|live music|dj|dancing|hookah|speakeasy)\b/i.test(
    query,
  );
}

function isNightlifeResult(row: EnterpriseLocation) {
  return /\b(karaoke|club|nightclub|rooftop|lounge|bar|live music|dj|dancing|hookah|speakeasy|nightlife)\b/.test(
    text(row),
  );
}

function cleanRelaxedDebug(debug: Record<string, any> | undefined) {
  if (!debug) return debug;
  const blocked = new Set([
    "club",
    "nightclub",
    "karaoke",
    "lounge",
    "rooftop",
    "bar",
    "live music",
    "dj",
    "dancing",
    "hookah",
    "speakeasy",
  ]);
  const cleanTerms = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (term) => !blocked.has(String(term).toLowerCase().trim()),
        )
      : value;
  const normalizedIntent = debug.normalizedIntent
    ? {
        ...debug.normalizedIntent,
        activityIntent: debug.normalizedIntent.activityIntent
          ? {
              ...debug.normalizedIntent.activityIntent,
              activityTerms: cleanTerms(
                debug.normalizedIntent.activityIntent.activityTerms,
              ),
              categoryTerms: cleanTerms(
                debug.normalizedIntent.activityIntent.categoryTerms,
              ),
              featureTerms: cleanTerms(
                debug.normalizedIntent.activityIntent.featureTerms,
              ),
            }
          : debug.normalizedIntent.activityIntent,
      }
    : debug.normalizedIntent;
  return {
    ...debug,
    normalizedIntent,
    activityTerms: cleanTerms(debug.activityTerms),
    relaxedGuardrailApplied: true,
  };
}

function pairActivityRows(pair: EnterprisePair) {
  const rows: EnterpriseLocation[] = [];
  if (pair.activity) rows.push(pair.activity);
  const first = (pair as any).first_activity;
  const second = (pair as any).second_activity;
  const paired = (pair as any).paired_activity;
  if (first) rows.push(first);
  if (second) rows.push(second);
  if (paired) rows.push(paired);
  return rows;
}

function pairAllowed(
  pair: EnterprisePair,
  minorAudience: boolean,
  relaxed: boolean,
  allowAdultLeaning: boolean,
  allowNightlife: boolean,
) {
  const activities = pairActivityRows(pair);
  if (
    minorAudience &&
    !allowAdultLeaning &&
    activities.some(isWeakMinorAudienceResult)
  ) {
    return false;
  }
  if (
    relaxed &&
    !allowNightlife &&
    activities.some(isNightlifeResult)
  ) {
    return false;
  }
  return true;
}

export function applyResultGuardrails(
  result: EnterpriseSearchResult,
  query: string,
): EnterpriseSearchResult {
  const minorAudience = isMinorAudienceQuery(query);
  const relaxed = isRelaxedQuery(query);
  const allowAdultLeaning = explicitlyRequestsAdultLeaningActivity(query);
  const allowNightlife = explicitlyRequestsNightlife(query);
  let activities = [...(result.activities ?? [])];
  let minorRemoved = 0;
  let relaxedRemoved = 0;

  if (minorAudience && !allowAdultLeaning) {
    const before = activities.length;
    activities = activities.filter((row) => !isWeakMinorAudienceResult(row));
    minorRemoved = before - activities.length;
  }

  if (relaxed && !allowNightlife) {
    const before = activities.length;
    activities = activities.filter((row) => !isNightlifeResult(row));
    relaxedRemoved = before - activities.length;
  }

  const pairs = (result.pairs ?? []).filter((pair) =>
    pairAllowed(
      pair,
      minorAudience,
      relaxed,
      allowAdultLeaning,
      allowNightlife,
    ),
  );
  const fallbackPairs = (result.fallbackPairs ?? []).filter((pair) =>
    pairAllowed(
      pair,
      minorAudience,
      relaxed,
      allowAdultLeaning,
      allowNightlife,
    ),
  );
  const recommendedFallbackPairs = (
    result.recommendedFallbackPairs ?? []
  ).filter((pair) =>
    pairAllowed(
      pair,
      minorAudience,
      relaxed,
      allowAdultLeaning,
      allowNightlife,
    ),
  );
  const pairRemovedCount =
    (result.pairs?.length ?? 0) - pairs.length +
    (result.fallbackPairs?.length ?? 0) - fallbackPairs.length +
    (result.recommendedFallbackPairs?.length ?? 0) -
      recommendedFallbackPairs.length;

  const cards = result.restaurants.length ? result.restaurants : activities;
  return {
    ...result,
    activities,
    pairs,
    fallbackPairs,
    recommendedFallbackPairs,
    matched_locations: result.restaurants.length ? result.restaurants : activities,
    matchedLocations: result.restaurants.length ? result.restaurants : activities,
    cards,
    card_counts: {
      ...result.card_counts,
      activities: activities.length,
      matched_locations: cards.length,
      pairs: pairs.length,
      fallbackPairs: fallbackPairs.length,
    },
    cardCounts: result.cardCounts
      ? {
          ...result.cardCounts,
          activities: activities.length,
          matched_locations: cards.length,
          pairs: pairs.length,
          fallbackPairs: fallbackPairs.length,
        }
      : result.cardCounts,
    debug: {
      ...(relaxed
        ? cleanRelaxedDebug(result.debug as Record<string, any>)
        : result.debug),
      minorAudienceGuardrailApplied: minorAudience,
      minorAudienceRemovedCount: minorRemoved,
      relaxedResultGuardrailApplied: relaxed,
      relaxedResultRemovedCount: relaxedRemoved,
      guardrailPairRemovedCount: pairRemovedCount,
      finalDisplayedResultCount:
        result.restaurants.length + activities.length + pairs.length,
    },
  } as EnterpriseSearchResult;
}
