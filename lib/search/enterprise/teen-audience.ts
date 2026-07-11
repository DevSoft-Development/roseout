import type { ActivityIntent, SearchIntent } from "./types";

export type TeenAudienceIntent = {
  type: "teen" | "family" | "kids" | null;
  requiresAllAges: boolean;
  avoidAdultOnly: boolean;
};

const TEEN_ACTIVITY_TERMS = [
  "bowling",
  "arcade",
  "escape room",
  "mini golf",
  "museum",
  "games",
  "interactive experience",
  "all ages",
];

const MINOR_UNSAFE_TERMS = [
  "21+",
  "adults only",
  "nightclub",
  "hookah",
  "late night",
];

function uniq(items: string[]) {
  return Array.from(new Set(items.map((item) => item.toLowerCase().trim()).filter(Boolean)));
}

export function detectAudienceIntent(query: string): TeenAudienceIntent {
  const normalized = String(query || "").toLowerCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ").trim();
  const teen = /\b(teen|teens|teenage|teenager|teenagers|teenage son|teenage daughter|my son|my daughter|parent and teen)\b/.test(normalized);
  const kids = /\b(kid|kids|child|children|young child|young children)\b/.test(normalized);
  const family = /\b(family|family friendly|all ages)\b/.test(normalized);

  if (teen) return { type: "teen", requiresAllAges: true, avoidAdultOnly: true };
  if (kids) return { type: "kids", requiresAllAges: true, avoidAdultOnly: true };
  if (family) return { type: "family", requiresAllAges: true, avoidAdultOnly: true };
  return { type: null, requiresAllAges: false, avoidAdultOnly: false };
}

export function applyAudienceToActivityIntent(
  activityIntent: ActivityIntent,
  audience: TeenAudienceIntent,
): ActivityIntent {
  if (!audience.type) return activityIntent;

  return {
    ...activityIntent,
    activityTerms: uniq([
      ...(activityIntent.activityTerms ?? []),
      ...(audience.type === "teen" ? TEEN_ACTIVITY_TERMS : []),
    ]),
    negativeTerms: uniq([
      ...(activityIntent.negativeTerms ?? []),
      ...(audience.avoidAdultOnly ? MINOR_UNSAFE_TERMS : []),
    ]),
  };
}

export function applyAudienceIntent(intent: SearchIntent): SearchIntent {
  const audience = detectAudienceIntent(intent.rawQuery);
  if (!audience.type) return intent;

  return {
    ...intent,
    searchType: intent.needsRestaurant ? intent.searchType : "activity",
    primaryDomain: intent.needsRestaurant ? intent.primaryDomain : "activity",
    needsActivity: true,
    activityIntent: applyAudienceToActivityIntent(intent.activityIntent, audience),
    audience,
  } as SearchIntent;
}
