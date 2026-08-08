import type { GooglePlace } from "./places";

type SuggestionLike = {
  foodTerms?: string[];
  cuisineTerms?: string[];
  categoryTerms?: string[];
  featureTerms?: string[];
  searchKeywords?: string[];
  semanticTags?: string[];
  intentTags?: string[];
  evidence?: Record<string, unknown>;
};

const SPECIALTY_TYPE_TO_FOODS: Record<string, string[]> = {
  pizza_restaurant: ["pizza"],
  chicken_restaurant: ["chicken"],
  seafood_restaurant: ["seafood"],
  steak_house: ["steak"],
  sushi_restaurant: ["sushi"],
  ramen_restaurant: ["ramen"],
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasPhrase(text: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  return ` ${text} `.includes(` ${normalizedPhrase} `);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

export function applySpecialtyFoodConfidence<T extends SuggestionLike>(
  place: GooglePlace,
  suggestion: T,
): T {
  const googleText = normalize([
    place.displayName?.text,
    place.editorialSummary?.text,
  ].filter(Boolean).join(" "));
  const googleTypes = Array.from(new Set([place.primaryType, ...(place.types || [])].filter(Boolean))) as string[];
  const explicitFoods = new Set(
    (Array.isArray(suggestion.evidence?.explicitFoodEvidence)
      ? suggestion.evidence?.explicitFoodEvidence
      : []) as string[],
  );

  const acceptedSpecialtyTypes: string[] = [];
  const rejectedSecondarySpecialtyTypes: string[] = [];
  const explicitSecondarySpecialtyEvidence: string[] = [];
  const allowedSpecialtyFoods = new Set<string>();
  const allSpecialtyFoods = new Set(Object.values(SPECIALTY_TYPE_TO_FOODS).flat());

  for (const type of googleTypes) {
    const foods = SPECIALTY_TYPE_TO_FOODS[type];
    if (!foods) continue;

    const primary = type === place.primaryType;
    const explicit = foods.some((food) => hasPhrase(googleText, food));

    if (primary || explicit) {
      acceptedSpecialtyTypes.push(type);
      foods.forEach((food) => allowedSpecialtyFoods.add(food));
      if (!primary && explicit) explicitSecondarySpecialtyEvidence.push(...foods);
    } else {
      rejectedSecondarySpecialtyTypes.push(type);
    }
  }

  const foodTerms = unique((suggestion.foodTerms || []).filter((food) => {
    const normalized = normalize(food);
    if (!allSpecialtyFoods.has(normalized)) return true;
    return explicitFoods.has(normalized) || allowedSpecialtyFoods.has(normalized);
  }));
  const cuisineTerms = unique(suggestion.cuisineTerms || []);
  const categoryTerms = unique(suggestion.categoryTerms || []);
  const featureTerms = unique(suggestion.featureTerms || []);
  const searchKeywords = unique([...foodTerms, ...cuisineTerms, ...categoryTerms, ...featureTerms]);

  return {
    ...suggestion,
    foodTerms,
    cuisineTerms,
    categoryTerms,
    featureTerms,
    searchKeywords,
    semanticTags: [...searchKeywords],
    intentTags: [...searchKeywords],
    evidence: {
      ...(suggestion.evidence || {}),
      specialtyFoodEvidenceMode: "primary_or_explicit_secondary",
      acceptedSpecialtyTypes: unique(acceptedSpecialtyTypes),
      rejectedSecondarySpecialtyTypes: unique(rejectedSecondarySpecialtyTypes),
      explicitSecondarySpecialtyEvidence: unique(explicitSecondarySpecialtyEvidence),
    },
  } as T;
}
