import type { SearchIntent } from "./types";

export type ActivityEvidence = Readonly<{
  matched: boolean;
  terms: readonly string[];
  category: string | null;
}>;

const ACTIVITY_GROUPS: ReadonlyArray<Readonly<{
  category: string;
  patterns: readonly RegExp[];
  terms: readonly string[];
}>> = [
  {
    category: "live_music",
    patterns: [
      /\blive\s+(?:jazz|music|band|performance|performances|entertainment)\b/i,
      /\bjazz\s+(?:music|performance|performances|club|show|shows|lounge|bar)\b/i,
      /\b(?:jazz|music)\s+venue\b/i,
      /\bconcerts?\b/i,
    ],
    terms: ["live music", "live jazz", "jazz club", "jazz performance", "music venue"],
  },
  {
    category: "karaoke",
    patterns: [/\bkaraoke\b/i, /\bprivate\s+(?:karaoke\s+)?rooms?\b/i],
    terms: ["karaoke", "karaoke bar", "private karaoke room"],
  },
  {
    category: "comedy",
    patterns: [/\bcomedy(?:\s+(?:club|show|shows))?\b/i, /\bstand[- ]?up\b/i],
    terms: ["comedy club", "comedy show", "stand up comedy"],
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
    ],
    terms: ["bowling", "arcade", "mini golf", "billiards", "axe throwing"],
  },
  {
    category: "interactive",
    patterns: [
      /\bescape\s+rooms?\b/i,
      /\bpaint\s+and\s+sip\b/i,
      /\bpottery(?:\s+(?:class|painting))?\b/i,
      /\bvirtual\s+reality\b/i,
    ],
    terms: ["escape room", "paint and sip", "pottery", "virtual reality"],
  },
  {
    category: "culture",
    patterns: [
      /\bmuseums?\b/i,
      /\bart\s+galler(?:y|ies)\b/i,
      /\bexhibits?\b/i,
      /\btheat(?:er|re)\b/i,
      /\bbroadway\b/i,
    ],
    terms: ["museum", "art gallery", "exhibit", "theater", "Broadway show"],
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
    ],
    terms: ["hookah", "shisha", "speakeasy", "nightclub", "dancing"],
  },
  {
    category: "wellness_outdoors",
    patterns: [
      /\bspa\b/i,
      /\bscenic\s+walk\b/i,
      /\bparks?\b/i,
      /\bboat\s+(?:ride|cruise)\b/i,
    ],
    terms: ["spa", "scenic walk", "park", "boat ride"],
  },
];

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function detectCanonicalActivityEvidence(query: string): ActivityEvidence {
  const matchedGroups = ACTIVITY_GROUPS.filter((group) =>
    group.patterns.some((pattern) => pattern.test(query)),
  );

  return {
    matched: matchedGroups.length > 0,
    terms: unique(matchedGroups.flatMap((group) => group.terms)),
    category: matchedGroups[0]?.category ?? null,
  };
}

export function reconcileExplicitActivityIntent(
  query: string,
  intent: SearchIntent,
): SearchIntent {
  const activity = detectCanonicalActivityEvidence(query);
  if (!activity.matched || intent.needsRestaurant !== true) return intent;

  const existingActivityTerms = intent.activityIntent?.activityTerms ?? [];
  const sameVenuePreferred =
    /\b(?:restaurant|dinner|brunch|lunch|breakfast|dining)\b[^.?!]{0,60}\bwith\b/i.test(query) ||
    intent.sameVenuePreferred === true;

  return {
    ...intent,
    searchType: sameVenuePreferred ? "same_location_combo" : "mixed_outing",
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
    },
    pairingPreference: {
      ...intent.pairingPreference,
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
