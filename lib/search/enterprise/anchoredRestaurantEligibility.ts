import type { EnterpriseLocation } from "./types";

const BAKERY_REQUEST_RE = /\b(?:bakery|bakeries|baked goods?|pastr(?:y|ies)|dessert|desserts|cake|cakes|cupcake|cupcakes|coffee|cafe|cafes|breakfast|brunch|bagel|bagels|donut|donuts|doughnut|doughnuts)\b/i;
const BAKERY_ONLY_RE = /\b(?:bakery|bakeries|boulangerie|patisserie|pastry shop|cake shop|cupcake shop|donut shop|doughnut shop|bagel shop)\b/i;
const FULL_MEAL_RE = /\b(?:restaurant|grill|diner|bistro|eatery|kitchen|steakhouse|pizzeria|trattoria|taqueria|sushi|ramen|noodle|seafood|barbecue|bbq|bar and grill|gastropub|tavern)\b/i;

function flattenSearchText(value: unknown): string {
  if (Array.isArray(value)) return value.map(flattenSearchText).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(flattenSearchText)
      .join(" ");
  }
  return typeof value === "string" ? value : "";
}

function restaurantSearchText(row: EnterpriseLocation): string {
  return [
    row.name,
    row.restaurant_name,
    row.primary_category,
    row.location_type,
    row.cuisine,
    row.cuisine_type,
    row.google_types,
    row.tags,
    row.search_keywords,
    row.semantic_tags,
    row.intent_tags,
    row.search_document,
    row.semantic_search_text,
  ]
    .map(flattenSearchText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function queryAllowsBakeryResults(query: string): boolean {
  return BAKERY_REQUEST_RE.test(query);
}

export function isBakeryOnlyRestaurant(
  row: EnterpriseLocation,
  query: string,
): boolean {
  if (queryAllowsBakeryResults(query)) return false;

  const text = restaurantSearchText(row);
  if (!BAKERY_ONLY_RE.test(text)) return false;

  const displayName = String(row.name || row.restaurant_name || "");
  const categoryText = [row.primary_category, row.cuisine, row.cuisine_type]
    .map(flattenSearchText)
    .join(" ");

  return !FULL_MEAL_RE.test(`${displayName} ${categoryText}`);
}

export function filterAnchoredRestaurantResults(
  rows: EnterpriseLocation[],
  query: string,
  limit: number,
): { results: EnterpriseLocation[]; excludedBakeryOnlyCount: number } {
  let excludedBakeryOnlyCount = 0;
  const results: EnterpriseLocation[] = [];

  for (const row of rows) {
    if (isBakeryOnlyRestaurant(row, query)) {
      excludedBakeryOnlyCount += 1;
      continue;
    }

    results.push(row);
    if (results.length >= limit) break;
  }

  return { results, excludedBakeryOnlyCount };
}
