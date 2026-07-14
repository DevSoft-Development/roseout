import type { EnterpriseLocation } from "./types";

export type NormalizedAnchoredQuery = {
  canonicalQuery: string;
  qualifier: string | null;
  requestedDomain: "restaurant" | "activity";
};

const DOMAIN_PATTERN =
  "restaurant|restaurants|food|dinner|lunch|brunch|breakfast|activity|activities|something fun|things to do";
const RELATION_PATTERN =
  "near|close to|next to|around|within(?: a)?(?: \\d+[- ]minute)? walk(?:ing distance)? (?:of|from)";

const PREFIXED_ANCHOR_RE = new RegExp(
  `^\\s*(?:(.+?)\\s+)?(${DOMAIN_PATTERN})\\s+(${RELATION_PATTERN})\\s+(.+?)\\s*$`,
  "i",
);

const QUALIFIER_SYNONYMS: Record<string, string[]> = {
  seafood: ["seafood", "fish", "lobster", "crab", "shrimp", "oyster", "raw bar"],
  italian: ["italian", "pasta", "pizza", "trattoria", "osteria"],
  halal: ["halal"],
  steak: ["steak", "steakhouse", "ribeye", "porterhouse", "filet", "sirloin"],
  sushi: ["sushi", "japanese", "omakase", "sashimi"],
  chicken: [
    "chicken",
    "wings",
    "fried chicken",
    "hot chicken",
    "rotisserie",
    "poultry",
    "chicken sandwich",
    "chicken restaurant",
  ],
  mexican: ["mexican", "taco", "taqueria", "burrito"],
  vegan: ["vegan", "plant based", "plant-based"],
  vegetarian: ["vegetarian", "veggie"],
};

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).join(" ");
  if (value == null) return "";
  return String(value).toLowerCase().replace(/[_-]+/g, " ");
}

export function normalizeAnchoredQuery(
  query: string,
): NormalizedAnchoredQuery | null {
  const match = query.match(PREFIXED_ANCHOR_RE);
  if (!match) return null;

  const qualifier = match[1]?.trim() || null;
  const domainText = match[2].trim();
  const relationText = match[3].trim();
  const anchorText = match[4].trim();
  const requestedDomain = /activities?|something fun|things to do/i.test(domainText)
    ? "activity"
    : "restaurant";

  return {
    canonicalQuery: `${domainText} ${relationText} ${anchorText}`,
    qualifier,
    requestedDomain,
  };
}

export function matchesAnchoredQualifier(
  row: EnterpriseLocation,
  qualifier: string | null,
): boolean {
  if (!qualifier) return true;

  const normalizedQualifier = normalizeText(qualifier).trim();
  if (!normalizedQualifier) return true;

  const haystack = normalizeText([
    row.name,
    row.restaurant_name,
    row.activity_name,
    row.cuisine,
    row.cuisine_type,
    row.food_type,
    row.primary_category,
    row.activity_type,
    row.tags,
    row.search_keywords,
    row.semantic_tags,
    row.intent_tags,
    row.search_document,
    row.semantic_search_text,
  ]);

  const directTokens = normalizedQualifier
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["best", "good", "great"].includes(token));
  if (directTokens.some((token) => haystack.includes(token))) return true;

  for (const [key, synonyms] of Object.entries(QUALIFIER_SYNONYMS)) {
    if (!normalizedQualifier.includes(key)) continue;
    if (synonyms.some((term) => haystack.includes(term))) return true;
  }

  return false;
}
