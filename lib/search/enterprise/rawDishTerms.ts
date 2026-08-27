import type { SearchIntent } from "./types";

const GENERIC_QUERY_PHRASES = [
  "plan a restaurant and activity outing",
  "plan an restaurant and activity outing",
  "plan a restaurant outing",
  "plan an outing",
  "plan an activity outing",
  "return the best options ranked by fit",
  "return the best options, ranked by fit",
  "return the best options",
  "ranked by fit",
  "best options",
  "find me",
  "show me",
  "give me",
  "i want",
  "i'm looking for",
  "im looking for",
  "looking for",
  "a place that serves",
  "a place serving",
  "place that serves",
  "place serving",
  "restaurant that serves",
  "restaurant serving",
];

const GENERIC_QUERY_TOKENS = new Set([
  "a",
  "an",
  "activity",
  "activities",
  "after",
  "and",
  "around",
  "at",
  "before",
  "best",
  "by",
  "date",
  "dining",
  "eat",
  "food",
  "for",
  "good",
  "in",
  "location",
  "meal",
  "near",
  "nearby",
  "of",
  "option",
  "options",
  "or",
  "outing",
  "place",
  "plan",
  "ranked",
  "restaurant",
  "restaurants",
  "return",
  "serves",
  "serving",
  "spot",
  "spots",
  "that",
  "the",
  "then",
  "to",
  "when",
  "with",
]);

const NON_DISH_ONLY_TOKENS = new Set([
  "anniversary",
  "birthday",
  "casual",
  "chill",
  "cozy",
  "date",
  "fun",
  "intimate",
  "night",
  "quiet",
  "romantic",
  "rooftop",
  "social",
  "upscale",
  "views",
]);

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9&/\s-]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removePhrase(source: string, phrase: unknown) {
  const normalized = normalize(phrase);
  if (!normalized) return source;
  const pattern = normalized
    .split(/\s+/)
    .map(escapeRegex)
    .join("\\s+");
  return source.replace(new RegExp(`(^|\\s)${pattern}(?=\\s|$)`, "gi"), " ");
}

function flatTerms(...values: unknown[]) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(normalize)
    .filter(Boolean);
}

function knownNonDishTerms(intent: SearchIntent) {
  return flatTerms(
    intent.occasion,
    intent.vibe,
    intent.restaurantIntent?.mealTerms,
    intent.restaurantIntent?.categoryTerms,
    intent.restaurantIntent?.vibeTerms,
    intent.restaurantIntent?.featureTerms,
    intent.activityIntent?.activityTerms,
    intent.activityIntent?.categoryTerms,
    intent.activityIntent?.vibeTerms,
    intent.activityIntent?.featureTerms,
    intent.activityPairIntent?.activityTerms,
    intent.activityPairIntent?.categoryTerms,
    intent.activityPairIntent?.vibeTerms,
    intent.activityPairIntent?.featureTerms,
  );
}

function geoTerms(intent: SearchIntent) {
  return flatTerms(
    intent.geo?.raw,
    intent.geo?.neighborhood,
    intent.geo?.borough,
    intent.geo?.city,
    intent.geo?.county,
    intent.geo?.region,
    intent.geo?.state,
    intent.geo?.requestedMarket,
    intent.geo?.resolvedMarket,
  ).sort((a, b) => b.length - a.length);
}

function stripStructuredSearchWrapper(query: string) {
  let value = String(query ?? "");

  // Public create-search requests append structured Location/When/Return clauses.
  // The user-authored request is always before those clauses, so discard the
  // machine-generated tail before extracting a dish phrase.
  value = value.split(/\blocation\s*:/i)[0];
  value = value.split(/\bwhen\s*:/i)[0];
  value = value.replace(/\breturn\s+the\s+best\s+options(?:,)?\s+ranked\s+by\s+fit\.?\s*$/i, " ");

  return normalize(value);
}

function trimGenericEdges(value: string) {
  const tokens = normalize(value).split(/\s+/).filter(Boolean);
  while (tokens.length && GENERIC_QUERY_TOKENS.has(tokens[0])) tokens.shift();
  while (tokens.length && GENERIC_QUERY_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function hasDishLikeContent(value: string) {
  const contentTokens = normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !GENERIC_QUERY_TOKENS.has(token));
  if (!contentTokens.length) return false;
  return !contentTokens.every((token) => NON_DISH_ONLY_TOKENS.has(token));
}

/**
 * Recover user-authored food/dish wording that a taxonomy or LLM may collapse
 * to a broad cuisine. This is intentionally vocabulary-agnostic: the menu
 * itself is the vocabulary, so phrases such as "cacio e pepe" or "birria
 * ramen" do not need to be hardcoded in the parser.
 */
export function extractRawRestaurantDishTerms(query: string, intent: SearchIntent) {
  if (!intent?.needsRestaurant) return [];

  let residual = stripStructuredSearchWrapper(query);

  for (const phrase of GENERIC_QUERY_PHRASES) residual = removePhrase(residual, phrase);

  // Remove explicit geo phrases first, including their leading preposition.
  for (const geo of geoTerms(intent)) {
    const pattern = geo.split(/\s+/).map(escapeRegex).join("\\s+");
    residual = residual.replace(
      new RegExp(`(^|\\s)(?:in|near|around|within|by|at)\\s+${pattern}(?=\\s|$)`, "gi"),
      " ",
    );
    residual = removePhrase(residual, geo);
  }

  // Keep food/cuisine terms; remove everything the parser already understood
  // as meal, vibe, feature, activity, occasion, or category language.
  const nonDishTerms = knownNonDishTerms(intent).sort((a, b) => b.length - a.length);
  for (const term of nonDishTerms) residual = removePhrase(residual, term);

  residual = residual
    .replace(/\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " ")
    .replace(/[;,|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const phrase of GENERIC_QUERY_PHRASES) residual = removePhrase(residual, phrase);
  residual = trimGenericEdges(residual);
  residual = residual.replace(/^(?:that\s+)?(?:has|have|serves|serving)\s+/i, "");
  residual = residual.replace(/\s+(?:and|then|after|before)\s*$/i, "").trim();

  if (!residual || !hasDishLikeContent(residual)) return [];

  const tokens = residual.split(/\s+/).filter(Boolean);
  if (tokens.length > 8) return [];

  const existing = new Set(
    flatTerms(
      intent.restaurantIntent?.foodTerms,
      intent.restaurantIntent?.cuisineTerms,
    ),
  );
  if (existing.has(residual)) return [];

  return [residual];
}

export function preserveRawRestaurantDishTerms(query: string, intent: SearchIntent) {
  const terms = extractRawRestaurantDishTerms(query, intent);
  if (!terms.length) return intent;

  const current = Array.isArray(intent.restaurantIntent?.foodTerms)
    ? intent.restaurantIntent.foodTerms
    : [];
  const merged = Array.from(
    new Set([...current, ...terms].map(normalize).filter(Boolean)),
  );

  intent.restaurantIntent = {
    ...intent.restaurantIntent,
    foodTerms: merged,
  };

  return intent;
}
