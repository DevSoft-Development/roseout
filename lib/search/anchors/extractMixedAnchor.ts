export type MixedOutingAnchorRequest = {
  intentQuery: string;
  rawAnchorText: string;
  relationship: "near" | "close_to" | "around" | "by" | "next_to" | "walking_distance_from";
};

const MEAL_SIGNAL = /\b(?:dinner|lunch|brunch|breakfast|restaurant|food|eat|dining|meal|steak|seafood|sushi|pizza|tacos?|chicken|wings)\b/i;
const ACTIVITY_SIGNAL = /\b(?:activity|activities|things to do|something fun|hookah|shisha|lounge|bar|drinks?|bowling|arcade|museum|karaoke|escape room|mini golf|comedy|show|theater|theatre|nightclub|rooftop|spa)\b/i;

const TRAILING_ANCHOR_RE = /^(.*?)(?:\s+(?:after\s+)?(near|close to|around|by|next to|nearby|within walking distance of)\s+)([^,?.!]+)[?.!]*$/i;

function relationshipFromText(value: string): MixedOutingAnchorRequest["relationship"] {
  const normalized = value.toLowerCase();
  if (normalized === "close to") return "close_to";
  if (normalized === "around") return "around";
  if (normalized === "by" || normalized === "nearby") return "by";
  if (normalized === "next to") return "next_to";
  if (normalized.includes("walking distance")) return "walking_distance_from";
  return "near";
}

export function extractMixedOutingAnchor(query: string): MixedOutingAnchorRequest | null {
  const source = String(query || "").trim();
  if (!MEAL_SIGNAL.test(source) || !ACTIVITY_SIGNAL.test(source)) return null;

  const match = source.match(TRAILING_ANCHOR_RE);
  if (!match) return null;

  const intentQuery = match[1].trim().replace(/\b(?:and|then|after)\s*$/i, "").trim();
  const rawAnchorText = match[3].trim();
  if (!intentQuery || !rawAnchorText) return null;

  return {
    intentQuery,
    rawAnchorText,
    relationship: relationshipFromText(match[2]),
  };
}
