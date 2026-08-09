import type { SearchIntent } from "./types";
import {
  ACTIVITY_SYNONYMS,
  GENERIC_ACTIVITY_SIGNAL_TERMS,
} from "./taxonomy";

export type ActivityEvidence = Readonly<{
  matched: boolean;
  terms: readonly string[];
  categories: readonly string[];
}>;

type ActivityGroup = Readonly<{
  category: string;
  patterns: readonly RegExp[];
  terms: readonly string[];
}>;

const ACTIVITY_GROUPS: readonly ActivityGroup[] = [
  {
    category: "live_music",
    patterns: [
      /\blive\s+(?:jazz|music|band|performance|performances|entertainment)\b/i,
      /\bjazz\s+(?:music|performance|performances|club|show|shows|lounge|bar)\b/i,
      /\b(?:jazz|music)\s+venue\b/i,
      /\bconcerts?\b/i,
    ],
    terms: [
      "live music",
      "live jazz",
      "jazz music",
      "jazz performance",
      "jazz club",
      "music venue",
      "concert",
    ],
  },
  {
    category: "karaoke",
    patterns: [/\bkaraoke\b/i, /\bprivate\s+(?:karaoke\s+)?rooms?\b/i],
    terms: ["karaoke", "karaoke bar", "private karaoke room"],
  },
  {
    category: "comedy",
    patterns: [/\bcomedy(?:\s+(?:club|show|shows))?\b/i, /\bstand[- ]?up\b/i, /\bimprov\b/i],
    terms: ["comedy club", "comedy show", "stand up comedy", "improv"],
  },
  {
    category: "games",
    patterns: [
      /\bbowling\b/i,
      /\barcade\b/i,
      /\bmini\s+golf\b/i,
      /\bbilliards?\b/i,
      /\bpool\s+hall\b/i,
      /\baxe\s+throwing\b/i,
      /\bdarts?\b/i,
      /\btrivia\b/i,
      /\bboard\s+games?\b/i,
    ],
    terms: [
      "bowling",
      "arcade",
      "mini golf",
      "billiards",
      "pool hall",
      "axe throwing",
      "darts",
      "trivia",
      "board games",
    ],
  },
  {
    category: "interactive",
    patterns: [
      /\bescape\s+rooms?\b/i,
      /\bpaint\s+and\s+sip\b/i,
      /\bsip\s+and\s+paint\b/i,
      /\bpottery(?:\s+(?:class|painting))?\b/i,
      /\bvirtual\s+reality\b/i,
      /\bimmersive\s+experience\b/i,
      /\bcooking\s+class\b/i,
      /\bdance\s+class\b/i,
    ],
    terms: [
      "escape room",
      "paint and sip",
      "pottery",
      "virtual reality",
      "immersive experience",
      "cooking class",
      "dance class",
    ],
  },
  {
    category: "culture",
    patterns: [
      /\bmuseums?\b/i,
      /\bart\s+galler(?:y|ies)\b/i,
      /\bexhibits?\b/i,
      /\btheat(?:er|re)\b/i,
      /\bbroadway\b/i,
      /\bmusicals?\b/i,
      /\bpoetry\b/i,
      /\bbookstores?\b/i,
    ],
    terms: [
      "museum",
      "art gallery",
      "exhibit",
      "theater",
      "Broadway show",
      "musical",
      "poetry",
      "bookstore",
    ],
  },
  {
    category: "nightlife",
    patterns: [
      /\bhookah\b/i,
      /\bshisha\b/i,
      /\bspeakeas(?:y|ies)\b/i,
      /\bnightclubs?\b/i,
      /\bdanc(?:e|ing)\b/i,
      /\bsalsa\s+danc(?:e|ing)\b/i,
      /\brooftop\s+(?:bar|lounge|drinks?|cocktails?)\b/i,
      /\bcocktail\s+bar\b/i,
      /\bwine\s+bar\b/i,
    ],
    terms: [
      "hookah",
      "shisha",
      "speakeasy",
      "nightclub",
      "dancing",
      "rooftop bar",
      "rooftop lounge",
      "cocktail bar",
      "wine bar",
    ],
  },
  {
    category: "wellness",
    patterns: [
      /\bspa\b/i,
      /\bmassage\b/i,
      /\bsauna\b/i,
      /\bwellness\b/i,
      /\bhead\s+spa\b/i,
      /\bfloat\s+spa\b/i,
    ],
    terms: ["spa", "massage", "sauna", "wellness", "head spa", "float spa"],
  },
  {
    category: "outdoors",
    patterns: [
      /\bscenic\s+walk\b/i,
      /\bparks?\b/i,
      /\bbotanical\s+garden\b/i,
      /\bwaterfront\b/i,
      /\bboat\s+(?:ride|cruise)\b/i,
      /\bwalking\s+tour\b/i,
      /\bobservation\s+deck\b/i,
      /\bzoo\b/i,
      /\baquarium\b/i,
    ],
    terms: [
      "scenic walk",
      "park",
      "botanical garden",
      "waterfront",
      "boat ride",
      "walking tour",
      "observation deck",
      "zoo",
      "aquarium",
    ],
  },
];

function unique(values: readonly string[]) {
  return Array.from(
    new Set(values.map((value) => value.toLowerCase().trim()).filter(Boolean)),
  );
}

export function detectCanonicalActivityEvidence(query: string): ActivityEvidence {
  const matchedGroups = ACTIVITY_GROUPS.filter((group) =>
    group.patterns.some((pattern) => pattern.test(query)),
  );

  return {
    matched: matchedGroups.length > 0,
    terms: unique(matchedGroups.flatMap((group) => group.terms)),
    categories: unique(matchedGroups.map((group) => group.category)),
  };
}

/**
 * Registers one canonical activity vocabulary with the existing shared taxonomy.
 * normalizeIntent, deterministic intent, fast-path intent, cache results, and
 * model results all consume these same mutable taxonomy contracts.
 */
export function registerCanonicalActivityVocabulary() {
  const allTerms = unique(ACTIVITY_GROUPS.flatMap((group) => group.terms));

  for (const term of allTerms) {
    if (!GENERIC_ACTIVITY_SIGNAL_TERMS.includes(term)) {
      GENERIC_ACTIVITY_SIGNAL_TERMS.push(term);
    }
  }

  for (const group of ACTIVITY_GROUPS) {
    const existing = ACTIVITY_SYNONYMS[group.category] ?? [];
    ACTIVITY_SYNONYMS[group.category] = unique([
      ...existing,
      ...group.terms,
    ]);
  }

  const liveMusic = ACTIVITY_SYNONYMS["live music"] ?? [];
  ACTIVITY_SYNONYMS["live music"] = unique([
    ...liveMusic,
    "live jazz",
    "jazz music",
    "jazz performance",
    "jazz club",
    "music venue",
  ]);
}

registerCanonicalActivityVocabulary();

/**
 * Search-wide domain reconciliation. This does not replace normalizeIntent;
 * it protects its final domain contract from losing explicit activity evidence.
 */
export function reconcileExplicitActivityIntent(
  query: string,
  intent: SearchIntent,
): SearchIntent {
  const activity = detectCanonicalActivityEvidence(query);
  if (!activity.matched || intent.needsRestaurant !== true) return intent;

  const existingActivityTerms = intent.activityIntent?.activityTerms ?? [];
  const sameVenuePreferred =
    /\b(?:restaurant|dinner|brunch|lunch|breakfast|dining)\b[^.?!]{0,80}\bwith\b/i.test(
      query,
    ) || intent.sameVenuePreferred === true;

  return {
    ...intent,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    pairRequested: true,
    normalizedIntent: "paired_outing",
    sameVenuePreferred,
    sameLocationRequired: false,
    fallbackPairAllowed: true,
    activityIntent: {
      ...intent.activityIntent,
      activityTerms: unique([...existingActivityTerms, ...activity.terms]),
      categoryTerms: unique([
        ...(intent.activityIntent?.categoryTerms ?? []),
        ...activity.categories,
      ]),
    },
    pairingPreference: {
      requiresPairing: true,
      distanceMode: intent.pairingPreference?.distanceMode ?? "any",
      maxPairDistanceMiles:
        intent.pairingPreference?.maxPairDistanceMiles ?? null,
      maxPairWalkingMinutes:
        intent.pairingPreference?.maxPairWalkingMinutes ?? null,
      requireWalkablePair:
        intent.pairingPreference?.requireWalkablePair ?? false,
    },
  };
}
