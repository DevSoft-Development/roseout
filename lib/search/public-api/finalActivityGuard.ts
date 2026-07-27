import { qualifyExplicitActivityIntent } from "@/lib/search/enterprise/taxonomy";

const GENERIC_ACTIVITY_TERMS = new Set([
  "activity",
  "activities",
  "things to do",
  "experience",
]);

const SPORTS_QUERY = /\b(knicks|sports?\s*(bar|lounge|viewing)|watch\s+(the\s+)?game|basketball|football|baseball|hockey)\b/i;
const SPORTS_EVIDENCE = /\b(sports?\s*bar|sports?\s*lounge|watch\s*party|game\s*day|live\s*sports|big\s*screens?|tvs?|pub|tavern|bar\s*and\s*grill)\b/i;
const KARAOKE_EVIDENCE = /\b(karaoke|private\s*karaoke|sing\s*along)\b/i;
const HOOKAH_EVIDENCE = /\b(hookah|shisha)\b/i;
const RELAXED_EVIDENCE = /\b(board\s*games?|mini\s*golf|bowling|gallery|museum|scenic|park|billiards|pool\s*hall|paint\s*and\s*sip|arcade|game\s*room)\b/i;

type PublicSearchResult = Record<string, any>;

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function locationKey(value: any): string {
  return String(
    value?.id ??
      value?.source_id ??
      value?.google_place_id ??
      [value?.name, value?.restaurant_name, value?.activity_name, value?.address]
        .filter(Boolean)
        .join("|"),
  ).toLowerCase();
}

function locationText(value: any): string {
  return [
    value?.name,
    value?.restaurant_name,
    value?.activity_name,
    value?.activity_type,
    value?.primary_category,
    value?.description,
    ...stringArray(value?.tags),
    ...stringArray(value?.semantic_tags),
    ...stringArray(value?.intent_tags),
    ...stringArray(value?.search_keywords),
    value?.search_document,
    value?.semantic_search_text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function explicitActivityTermsFromNormalizedIntent(result: PublicSearchResult): string[] {
  const normalizedIntent = result?.debug?.normalizedIntent ?? result?.normalizedIntent ?? null;
  const activityIntent = normalizedIntent?.activityIntent ?? normalizedIntent?.activity ?? null;
  const activityTerms = stringArray(activityIntent?.activityTerms);
  const categoryTerms = stringArray(activityIntent?.categoryTerms);

  return unique([...activityTerms, ...categoryTerms]).filter(
    (term) => !GENERIC_ACTIVITY_TERMS.has(term),
  );
}

function explicitActivityTermsFromQuery(cleanInput: string): string[] {
  const normalized = cleanInput.toLowerCase();
  if (/\bbowling\b|\bbowling alley\b|\bbowling alleys\b/.test(normalized)) return ["bowling"];
  if (/\bkaraoke\b/.test(normalized)) return ["karaoke"];
  if (/\bhookah\b|\bshisha\b/.test(normalized)) return ["hookah"];
  if (SPORTS_QUERY.test(normalized)) return ["sports bar"];
  return [];
}

function activityFromPair(pair: any): any | null {
  return pair?.activity ?? pair?.activity_location ?? pair?.activityLocation ?? null;
}

function strongIntentEvidence(value: any, cleanInput: string): boolean {
  const haystack = locationText(value);
  if (/\bkaraoke\b/i.test(cleanInput)) return KARAOKE_EVIDENCE.test(haystack);
  if (/\bhookah\b|\bshisha\b/i.test(cleanInput)) return HOOKAH_EVIDENCE.test(haystack);
  if (SPORTS_QUERY.test(cleanInput)) return SPORTS_EVIDENCE.test(haystack);
  if (/\b(relaxed|relaxing|chill|low[ -]?key|casual activity)\b/i.test(cleanInput)) {
    return RELAXED_EVIDENCE.test(haystack);
  }
  return false;
}

function recoveryProvenance(value: any): boolean {
  return Boolean(
    value?.recovery_generated ||
      value?.post_filter_recovery ||
      value?.recoveryGenerated ||
      value?._recoveryCandidate ||
      value?.search_recovery_source,
  );
}

function qualifiesActivity(value: any, terms: string[], cleanInput: string): boolean {
  const taxonomyMatch = qualifyExplicitActivityIntent(value, terms).matches;
  if (taxonomyMatch) return true;
  if (strongIntentEvidence(value, cleanInput)) return true;
  return recoveryProvenance(value) && strongIntentEvidence(value, cleanInput);
}

function pairHasQualifiedActivity(pair: any, terms: string[], cleanInput: string): boolean {
  const activity = activityFromPair(pair);
  if (!activity) return true;
  return qualifiesActivity(activity, terms, cleanInput);
}

function cardHasQualifiedActivity(card: any, terms: string[], cleanInput: string): boolean {
  const locationType = card?.location_type ?? card?.locationType;
  if (locationType === "activity") return qualifiesActivity(card, terms, cleanInput);
  if (locationType && locationType !== "activity") return true;
  if (card?.activity_name || card?.activity_type) return qualifiesActivity(card, terms, cleanInput);
  return true;
}

function promoteRestaurantTypedActivities(
  restaurants: any[],
  cleanInput: string,
): { restaurants: any[]; promoted: any[] } {
  if (!SPORTS_QUERY.test(cleanInput)) return { restaurants, promoted: [] };
  const promoted = restaurants
    .filter((row) => strongIntentEvidence(row, cleanInput))
    .map((row) => ({
      ...row,
      location_type: "activity",
      activity_name: row.activity_name ?? row.name ?? row.restaurant_name,
      activity_type: row.activity_type ?? "sports_bar",
      cross_domain_activity: true,
      recovery_generated: true,
    }));
  const promotedKeys = new Set(promoted.map(locationKey));
  return {
    restaurants: restaurants.filter((row) => !promotedKeys.has(locationKey(row))),
    promoted,
  };
}

function milesBetween(a: any, b: any): number | null {
  const lat1 = Number(a?.latitude);
  const lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude);
  const lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function regenerateScarceActivityPairs(restaurants: any[], activities: any[], maxMiles = 3): any[] {
  const candidates: any[] = [];
  for (const activity of activities) {
    for (const restaurant of restaurants) {
      const distance = milesBetween(restaurant, activity);
      if (distance == null || distance > maxMiles) continue;
      candidates.push({
        restaurant,
        activity,
        pair_distance_miles: Number(distance.toFixed(2)),
        distance_miles: Number(distance.toFixed(2)),
        pair_walking_minutes: Math.round(distance * 20),
        walking_minutes: Math.round(distance * 20),
        pairScore: Math.max(0, 100 - distance * 20),
        score: Math.max(0, 100 - distance * 20),
        recovery_generated: true,
        scarce_activity_centered: true,
      });
    }
  }
  return candidates.sort((a, b) => b.pairScore - a.pairScore).slice(0, 3);
}

export function resolveFinalPublicActivityTerms(
  result: PublicSearchResult,
  cleanInput: string,
): string[] {
  const normalizedIntentTerms = explicitActivityTermsFromNormalizedIntent(result);
  if (normalizedIntentTerms.length > 0) return normalizedIntentTerms;
  return explicitActivityTermsFromQuery(cleanInput);
}

export function applyFinalPublicActivityGuard<T extends PublicSearchResult>(
  rawResult: T,
  cleanInput: string,
): T {
  const terms = resolveFinalPublicActivityTerms(rawResult, cleanInput);
  const rawRestaurants = Array.isArray(rawResult.restaurants) ? rawResult.restaurants : [];
  const promotion = promoteRestaurantTypedActivities(rawRestaurants, cleanInput);
  const baseActivities = Array.isArray(rawResult.activities) ? rawResult.activities : [];
  const activityMap = new Map<string, any>();
  for (const activity of [...baseActivities, ...promotion.promoted]) {
    if (terms.length === 0 || qualifiesActivity(activity, terms, cleanInput)) {
      activityMap.set(locationKey(activity), activity);
    }
  }
  const activities = Array.from(activityMap.values());
  const originalPairs = Array.isArray(rawResult.pairs) ? rawResult.pairs : [];
  let pairs = terms.length === 0
    ? originalPairs
    : originalPairs.filter((pair: any) => pairHasQualifiedActivity(pair, terms, cleanInput));

  const wantsPairing = Boolean(
    rawResult?.debug?.wantsPairing ??
      rawResult?.debug?.debugParity?.wantsPairing ??
      rawResult?.debug?.normalizedIntent?.wantsPairing,
  );
  if (wantsPairing && pairs.length === 0 && promotion.restaurants.length > 0 && activities.length > 0) {
    pairs = regenerateScarceActivityPairs(promotion.restaurants, activities);
  }

  const cards = Array.isArray(rawResult.cards)
    ? rawResult.cards.filter((card: any) => terms.length === 0 || cardHasQualifiedActivity(card, terms, cleanInput))
    : rawResult.cards;
  const debug = {
    ...(rawResult.debug ?? {}),
    finalPublicActivityGuard: {
      terms,
      source:
        explicitActivityTermsFromNormalizedIntent(rawResult).length > 0
          ? "normalized_intent"
          : "query_text_fallback",
      removedActivities: baseActivities.length - activities.filter((row) => !row.cross_domain_activity).length,
      removedPairs: originalPairs.length - pairs.length,
      preservedRecoveryActivities: activities.filter(recoveryProvenance).length,
      promotedRestaurantTypedActivities: promotion.promoted.length,
      scarceActivityCenteredPairs: pairs.filter((pair) => pair?.scarce_activity_centered).length,
    },
    qualifiedActivityCount: activities.length,
    primaryPairCount: pairs.length,
    counts: {
      ...(rawResult.debug?.counts ?? {}),
      qualifiedActivityCount: activities.length,
      primaryPairCount: pairs.length,
    },
  };

  return {
    ...rawResult,
    restaurants: promotion.restaurants,
    activities,
    pairs,
    cards,
    no_pairs_reason: pairs.length > 0 ? null : rawResult.no_pairs_reason,
    noPairsReason: pairs.length > 0 ? null : rawResult.noPairsReason,
    debug,
  };
}
