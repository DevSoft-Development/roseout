export type WebsiteDesignDirection = {
  id: string;
  name: string;
  summary: string;
  signals: string[];
  theme: {
    mood: string;
    contrast: "light" | "dark" | "mixed";
    typography: "editorial" | "modern" | "classic" | "playful";
    density: "airy" | "balanced" | "compact";
    imageTreatment: "immersive" | "editorial" | "grid" | "minimal";
  };
};

export const WEBSITE_DESIGN_DIRECTIONS: WebsiteDesignDirection[] = [
  {
    id: "refined_after_dark",
    name: "Refined After Dark",
    summary: "Sophisticated, cinematic, and intimate for premium dining, lounges, and romantic nightlife.",
    signals: ["upscale", "luxury", "dark", "romantic", "intimate", "moody", "elegant", "nightlife", "steakhouse", "lounge"],
    theme: { mood: "refined", contrast: "dark", typography: "editorial", density: "airy", imageTreatment: "immersive" },
  },
  {
    id: "editorial_luxury",
    name: "Editorial Luxury",
    summary: "Magazine-inspired and premium with oversized typography, curated imagery, and generous whitespace.",
    signals: ["editorial", "luxury", "chef", "tasting menu", "premium", "fashion", "curated", "high end", "exclusive"],
    theme: { mood: "luxury", contrast: "mixed", typography: "editorial", density: "airy", imageTreatment: "editorial" },
  },
  {
    id: "modern_minimal",
    name: "Modern Minimal",
    summary: "Clean, restrained, and contemporary with simple navigation and strong visual hierarchy.",
    signals: ["modern", "minimal", "clean", "sleek", "simple", "contemporary", "omakase", "gallery", "premium"],
    theme: { mood: "minimal", contrast: "light", typography: "modern", density: "airy", imageTreatment: "minimal" },
  },
  {
    id: "warm_neighborhood",
    name: "Warm Neighborhood",
    summary: "Friendly, approachable, and authentic with emphasis on hospitality and local character.",
    signals: ["warm", "local", "neighborhood", "friendly", "cozy", "casual", "authentic", "welcoming", "cafe", "bakery", "pub"],
    theme: { mood: "welcoming", contrast: "light", typography: "classic", density: "balanced", imageTreatment: "editorial" },
  },
  {
    id: "classic_bistro",
    name: "Classic Bistro",
    summary: "Timeless European character with menu-forward structure and understated vintage polish.",
    signals: ["bistro", "french", "italian", "wine bar", "brasserie", "classic", "vintage", "european", "traditional"],
    theme: { mood: "classic", contrast: "mixed", typography: "classic", density: "balanced", imageTreatment: "editorial" },
  },
  {
    id: "bold_social",
    name: "Bold & Social",
    summary: "Expressive and high-energy for lively restaurants, brunch, nightlife, and group-focused venues.",
    signals: ["bold", "energetic", "social", "fun", "nightlife", "party", "vibrant", "lively", "brunch", "groups"],
    theme: { mood: "energetic", contrast: "dark", typography: "modern", density: "balanced", imageTreatment: "grid" },
  },
  {
    id: "cocktail_society",
    name: "Cocktail Society",
    summary: "Moody and polished with drink-forward storytelling, reservations, and intimate atmosphere.",
    signals: ["cocktail", "bar", "speakeasy", "lounge", "drinks", "mixology", "moody", "intimate", "reservation"],
    theme: { mood: "cocktail", contrast: "dark", typography: "editorial", density: "airy", imageTreatment: "immersive" },
  },
  {
    id: "experiential_escape",
    name: "Experiential Escape",
    summary: "Immersive and story-led for themed dining, rooftop concepts, and venues selling an atmosphere as much as a service.",
    signals: ["immersive", "themed", "experience", "rooftop", "destination", "atmosphere", "story", "unique", "memorable"],
    theme: { mood: "immersive", contrast: "mixed", typography: "editorial", density: "airy", imageTreatment: "immersive" },
  },
  {
    id: "natural_retreat",
    name: "Natural Retreat",
    summary: "Organic, calm, and grounded with earthy visual language and relaxed premium spacing.",
    signals: ["natural", "organic", "earthy", "winery", "retreat", "outdoor", "wellness", "calm", "garden", "rustic"],
    theme: { mood: "organic", contrast: "light", typography: "classic", density: "airy", imageTreatment: "editorial" },
  },
  {
    id: "playful_local",
    name: "Playful Local",
    summary: "Bright, casual, and personality-driven for approachable food, dessert, and community concepts.",
    signals: ["playful", "colorful", "pizza", "tacos", "dessert", "casual", "family", "fun", "local", "youthful"],
    theme: { mood: "playful", contrast: "light", typography: "playful", density: "balanced", imageTreatment: "grid" },
  },
  {
    id: "industrial_edge",
    name: "Industrial Edge",
    summary: "Urban, structured, and bold for breweries, BBQ, distilleries, music spaces, and raw-material aesthetics.",
    signals: ["industrial", "brewery", "bbq", "distillery", "music", "urban", "warehouse", "edgy", "charcoal", "concrete"],
    theme: { mood: "industrial", contrast: "dark", typography: "modern", density: "compact", imageTreatment: "grid" },
  },
  {
    id: "heritage_story",
    name: "Heritage & Story",
    summary: "History-forward and character-rich for longstanding restaurants, cultural venues, and legacy businesses.",
    signals: ["heritage", "historic", "legacy", "tradition", "story", "family owned", "cultural", "established", "classic"],
    theme: { mood: "heritage", contrast: "mixed", typography: "classic", density: "balanced", imageTreatment: "editorial" },
  },
  {
    id: "coastal_airy",
    name: "Coastal & Airy",
    summary: "Bright, breezy, and relaxed with generous whitespace and a polished waterfront feel.",
    signals: ["coastal", "seafood", "waterfront", "beach", "rooftop", "airy", "bright", "fresh", "relaxed", "ocean"],
    theme: { mood: "breezy", contrast: "light", typography: "modern", density: "airy", imageTreatment: "editorial" },
  },
  {
    id: "contemporary_culture",
    name: "Contemporary Culture",
    summary: "Art-forward and expressive for galleries, creative spaces, cultural venues, and design-led hospitality.",
    signals: ["art", "culture", "gallery", "creative", "design", "contemporary", "museum", "studio", "fashion", "editorial"],
    theme: { mood: "cultural", contrast: "mixed", typography: "editorial", density: "airy", imageTreatment: "editorial" },
  },
  {
    id: "high_energy_experience",
    name: "High-Energy Experience",
    summary: "Action-first and conversion-focused for competitive attractions and adrenaline-driven group activities.",
    signals: ["axe throwing", "go kart", "trampoline", "laser tag", "action", "adrenaline", "competitive", "groups", "book now", "activity"],
    theme: { mood: "energetic", contrast: "dark", typography: "modern", density: "compact", imageTreatment: "immersive" },
  },
  {
    id: "competitive_social",
    name: "Competitive Social",
    summary: "Social, game-forward, and bookable for bowling, darts, billiards, mini golf, and group entertainment.",
    signals: ["bowling", "darts", "billiards", "pool", "mini golf", "ping pong", "games", "league", "party", "group booking"],
    theme: { mood: "social", contrast: "mixed", typography: "modern", density: "balanced", imageTreatment: "grid" },
  },
  {
    id: "immersive_adventure",
    name: "Immersive Adventure",
    summary: "Cinematic and suspenseful for escape rooms, VR, interactive attractions, and story-based experiences.",
    signals: ["escape room", "vr", "virtual reality", "immersive", "mystery", "adventure", "puzzle", "interactive", "rooms", "difficulty"],
    theme: { mood: "adventure", contrast: "dark", typography: "modern", density: "balanced", imageTreatment: "immersive" },
  },
  {
    id: "family_fun",
    name: "Family Fun",
    summary: "Bright, accessible, and package-friendly for arcades, skating, family entertainment, and birthday-focused venues.",
    signals: ["family", "kids", "birthday", "arcade", "skating", "family entertainment", "party package", "all ages", "fun", "groups"],
    theme: { mood: "family", contrast: "light", typography: "playful", density: "balanced", imageTreatment: "grid" },
  },
  {
    id: "creative_workshop",
    name: "Creative Workshop",
    summary: "Hands-on and inspiring for pottery, painting, candle making, cooking classes, and DIY studios.",
    signals: ["pottery", "painting", "candle", "cooking class", "diy", "workshop", "creative", "class", "studio", "make"],
    theme: { mood: "creative", contrast: "light", typography: "playful", density: "balanced", imageTreatment: "editorial" },
  },
  {
    id: "wellness_escape",
    name: "Wellness Escape",
    summary: "Serene, restorative, and trust-forward for spas, saunas, yoga, massage, and recovery experiences.",
    signals: ["spa", "sauna", "massage", "yoga", "wellness", "recovery", "serene", "relaxing", "treatment", "self care"],
    theme: { mood: "wellness", contrast: "light", typography: "modern", density: "airy", imageTreatment: "minimal" },
  },
];

export function getWebsiteDesignDirection(id: string) {
  return WEBSITE_DESIGN_DIRECTIONS.find((direction) => direction.id === id) || null;
}
