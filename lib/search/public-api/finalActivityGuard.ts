import { qualifyExplicitActivityIntent } from "@/lib/search/enterprise/taxonomy";

const GENERIC_ACTIVITY_TERMS = new Set([
  "activity",
  "activities",
  "things to do",
  "experience",
]);

type PublicSearchResult = Record<string, any>;

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
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
  if (/\bbowling\b|\bbowling alley\b|\bbowling alleys\b/.test(normalized)) {
    return ["bowling"];
  }
  return [];
}

function activityFromPair(pair: any): any | null {
  return pair?.activity ?? pair?.activity_location ?? pair?.activityLocation ?? null;
}

function pairHasQualifiedActivity(pair: any, terms: string[]): boolean {
  const activity = activityFromPair(pair);
  if (!activity) return true;
  return qualifyExplicitActivityIntent(activity, terms).matches;
}

function cardHasQualifiedActivity(card: any, terms: string[]): boolean {
  const locationType = card?.location_type ?? card?.locationType;
  if (locationType && locationType !== "activity") return true;
  if (locationType === "activity") {
    return qualifyExplicitActivityIntent(card, terms).matches;
  }
  if (card?.restaurant_name || card?.cuisine || card?.cuisine_type) return true;
  if (card?.activity_name || card?.activity_type) {
    return qualifyExplicitActivityIntent(card, terms).matches;
  }
  return true;
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
  if (terms.length === 0) return rawResult;

  const activities = Array.isArray(rawResult.activities)
    ? rawResult.activities.filter((activity: any) =>
        qualifyExplicitActivityIntent(activity, terms).matches,
      )
    : rawResult.activities;
  const pairs = Array.isArray(rawResult.pairs)
    ? rawResult.pairs.filter((pair: any) => pairHasQualifiedActivity(pair, terms))
    : rawResult.pairs;
  const cards = Array.isArray(rawResult.cards)
    ? rawResult.cards.filter((card: any) => cardHasQualifiedActivity(card, terms))
    : rawResult.cards;

  const debug = {
    ...(rawResult.debug ?? {}),
    finalPublicActivityGuard: {
      terms,
      source:
        explicitActivityTermsFromNormalizedIntent(rawResult).length > 0
          ? "normalized_intent"
          : "query_text_fallback",
      removedActivities: Array.isArray(rawResult.activities)
        ? rawResult.activities.length - (Array.isArray(activities) ? activities.length : 0)
        : 0,
      removedPairs: Array.isArray(rawResult.pairs)
        ? rawResult.pairs.length - (Array.isArray(pairs) ? pairs.length : 0)
        : 0,
    },
    qualifiedActivityCount: Array.isArray(activities) ? activities.length : 0,
    primaryPairCount: Array.isArray(pairs) ? pairs.length : 0,
    counts: {
      ...(rawResult.debug?.counts ?? {}),
      qualifiedActivityCount: Array.isArray(activities) ? activities.length : 0,
      primaryPairCount: Array.isArray(pairs) ? pairs.length : 0,
    },
  };

  return {
    ...rawResult,
    activities,
    pairs,
    cards,
    debug,
  };
}
