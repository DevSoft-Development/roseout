export const GENERIC_MEAL_TERMS = [
  "dinner",
  "lunch",
  "breakfast",
  "brunch",
  "restaurant",
  "restaurants",
  "food",
  "eat",
  "dining",
] as const;

export const SPECIFIC_MEAL_FOOD_INTENTS = [
  "steak","steakhouse","seafood","sushi","pasta","soul_food","caribbean","italian","mexican","thai","chinese","japanese","american","african","vegan","vegetarian","halal","burgers","pizza","tacos","fine_dining",
] as const;

export const MEAL_FOOD_INTENTS = [
  ...SPECIFIC_MEAL_FOOD_INTENTS,
  "brunch","breakfast","lunch","dinner",
] as const;

export const ADD_ON_FOOD_INTENTS = [
  "dessert","drinks","cocktails","wine","coffee","cafe","ice_cream","bakery",
] as const;

export const ACTIVITY_INTENTS = [
  "hookah","bowling","paint_and_sip","sip_and_paint","karaoke","arcade","comedy","escape_room","spa","rooftop","lounge","nightclub","live_music","jazz","cigar","mini_golf","axe_throwing","museum","movies","pool","billiards",
] as const;

export const INTENT_ALIASES: Record<string, string[]> = {
  hookah: ["hookah", "shisha", "hookah lounge", "hookah bar"],
  paint_and_sip: ["paint and sip", "sip and paint", "paint n sip", "sip n paint", "paint night", "painting class", "painting studio", "wine and paint", "paint with wine"],
  steak: ["steak", "steak dinner", "steakhouse", "ribeye", "porterhouse", "filet mignon"],
  seafood: ["seafood", "seafood dinner", "fish", "crab", "lobster", "shrimp"],
};

export const OUTING_PHRASES = ["and", "after", "then", "followed by", "date night", "outing"];
