"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUTING_PHRASES = exports.INTENT_ALIASES = exports.ACTIVITY_INTENTS = exports.ADD_ON_FOOD_INTENTS = exports.MEAL_FOOD_INTENTS = exports.SPECIFIC_MEAL_FOOD_INTENTS = exports.GENERIC_MEAL_TERMS = void 0;
exports.GENERIC_MEAL_TERMS = [
    "dinner",
    "lunch",
    "breakfast",
    "brunch",
    "restaurant",
    "restaurants",
    "food",
    "eat",
    "dining",
];
exports.SPECIFIC_MEAL_FOOD_INTENTS = [
    "steak", "steakhouse", "seafood", "fish", "crab", "lobster", "shrimp", "oyster", "sushi", "pasta", "soul_food", "caribbean", "italian", "mexican", "thai", "chinese", "japanese", "american", "african", "vegan", "vegetarian", "halal", "burgers", "pizza", "tacos", "fine_dining",
];
exports.MEAL_FOOD_INTENTS = [
    ...exports.SPECIFIC_MEAL_FOOD_INTENTS,
    "brunch", "breakfast", "lunch", "dinner",
];
exports.ADD_ON_FOOD_INTENTS = [
    "dessert", "drinks", "cocktails", "wine", "coffee", "cafe", "ice_cream", "bakery",
];
exports.ACTIVITY_INTENTS = [
    "hookah", "bowling", "paint_and_sip", "sip_and_paint", "karaoke", "arcade", "comedy", "escape_room", "spa", "rooftop", "lounge", "nightclub", "live_music", "jazz", "cigar", "mini_golf", "axe_throwing", "museum", "movies", "pool", "billiards",
];
exports.INTENT_ALIASES = {
    hookah: ["hookah", "shisha", "hookah lounge", "hookah bar"],
    paint_and_sip: ["paint and sip", "sip and paint", "paint n sip", "sip n paint", "paint night", "painting class", "painting studio", "wine and paint", "paint with wine"],
    steak: ["steak", "steak dinner", "steakhouse", "ribeye", "porterhouse", "filet mignon"],
    seafood: ["seafood", "seafood dinner", "fish", "crab", "lobster", "shrimp", "oyster"],
};
exports.OUTING_PHRASES = ["and", "after", "then", "followed by", "date night", "outing"];
