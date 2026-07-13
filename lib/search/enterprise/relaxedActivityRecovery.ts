const uniq = (items: string[]) =>
  Array.from(new Set(items.map((item) => item.toLowerCase().trim()).filter(Boolean)));

export const RELAXED_ACTIVITY_RECOVERY_TERMS = [
  "relaxed activity",
  "low-key activity",
  "quiet activity",
  "casual activity",
  "peaceful date",
  "board games",
  "museum",
  "art gallery",
  "gallery",
  "cafe",
  "coffee shop",
  "dessert",
  "scenic walk",
  "park",
  "botanical garden",
  "bookstore",
  "bowling",
  "mini golf",
  "billiards",
  "paint and sip",
] as const;

export const ENTERTAINMENT_ACTIVITY_RECOVERY_TERMS = [
  "entertainment",
  "arcade",
  "games",
  "comedy",
  "karaoke",
  "live music",
  "rooftop",
  "lounge",
  "nightlife",
] as const;

export const RELAXED_ACTIVITY_BLOCKED_RECOVERY_TERMS = new Set([
  "bar",
  "club",
  "comedy club",
  "dance club",
  "dj",
  "karaoke",
  "karaoke bar",
  "karaoke lounge",
  "live entertainment",
  "live music",
  "lounge",
  "nightclub",
  "nightlife",
  "private karaoke",
  "rooftop",
  "rooftop bar",
  "rooftop lounge",
  "speakeasy",
]);

function normalizeQuery(query: string | null | undefined) {
  return String(query ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRelaxedActivityRecoveryQuery(query: string | null | undefined) {
  const normalized = normalizeQuery(query);
  return /\b(relaxed activity|low key activity|quiet activity|peaceful date|casual activity|chill activity|easy activity|laid back activity)\b/.test(
    normalized,
  );
}

export function isExplicitEntertainmentRecoveryQuery(
  query: string | null | undefined,
) {
  const normalized = normalizeQuery(query);
  return /\b(nightlife|karaoke|comedy|live music|concert|rooftop drinks?|club|dancing|dj|entertainment)\b/.test(
    normalized,
  );
}

export function sanitizeRelaxedActivityRecoveryTerms(terms: string[]) {
  return uniq(
    terms.filter(
      (term) =>
        !RELAXED_ACTIVITY_BLOCKED_RECOVERY_TERMS.has(
          normalizeQuery(term),
        ),
    ),
  );
}

export function activityRecoveryTermsForQuery(
  query: string | null | undefined,
) {
  if (isRelaxedActivityRecoveryQuery(query)) {
    return [...RELAXED_ACTIVITY_RECOVERY_TERMS];
  }

  if (isExplicitEntertainmentRecoveryQuery(query)) {
    return [...ENTERTAINMENT_ACTIVITY_RECOVERY_TERMS];
  }

  return [
    "activity",
    "things to do",
    "arcade",
    "bowling",
    "billiards",
    "games",
    "mini golf",
    "museum",
    "gallery",
  ];
}
