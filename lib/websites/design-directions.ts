export type WebsiteHeroStyle =
  | "editorial_split"
  | "photo_mosaic"
  | "cinematic_strip"
  | "typography_first"
  | "asymmetric_gallery"
  | "framed_photo";

export type WebsiteDesignDirection = {
  id: string;
  name: string;
  summary: string;
  signals: string[];
  variants: WebsiteHeroStyle[];
  defaultVariant: WebsiteHeroStyle;
  theme: {
    mood: string;
    contrast: "light" | "dark" | "mixed";
    typography: "editorial" | "modern" | "classic" | "playful";
    density: "airy" | "balanced" | "compact";
    imageTreatment: "editorial" | "grid" | "minimal";
    reservationPriority: "primary";
  };
};

export const WEBSITE_DESIGN_DIRECTIONS: WebsiteDesignDirection[] = [
  {
    id: "editorial_luxury",
    name: "Editorial Dining",
    summary: "High-end hospitality with oversized editorial typography, generous whitespace, cinematic food photography, and an intentionally paced guest journey.",
    signals: ["editorial", "light", "cream", "ivory", "elegant", "refined", "magazine", "chef", "premium", "fine dining", "tasting menu"],
    variants: ["editorial_split", "framed_photo", "cinematic_strip", "typography_first"],
    defaultVariant: "editorial_split",
    theme: { mood: "editorial", contrast: "light", typography: "editorial", density: "airy", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "refined_after_dark",
    name: "After Dark",
    summary: "Cinematic nightlife design for lounges, rooftops, cocktail bars, steakhouses, and restaurants where mood and atmosphere sell the experience.",
    signals: ["dark", "lounge", "romantic", "moody", "intimate", "cocktail", "nightlife", "luxury", "candlelight", "upscale", "steakhouse", "rooftop"],
    variants: ["asymmetric_gallery", "cinematic_strip", "typography_first", "editorial_split"],
    defaultVariant: "asymmetric_gallery",
    theme: { mood: "refined", contrast: "dark", typography: "editorial", density: "airy", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "modern_minimal",
    name: "Contemporary Hospitality",
    summary: "Crisp, modern hospitality with strong conversion hierarchy, restrained surfaces, and prominent reservation or booking actions.",
    signals: ["modern", "clean", "reservation", "book", "minimal", "sleek", "simple", "conversion", "contemporary", "chef driven"],
    variants: ["typography_first", "editorial_split", "framed_photo"],
    defaultVariant: "editorial_split",
    theme: { mood: "modern", contrast: "light", typography: "modern", density: "balanced", imageTreatment: "minimal", reservationPriority: "primary" },
  },
  {
    id: "bold_social",
    name: "High Energy Social",
    summary: "Large-scale imagery, bold typography, and energetic rhythm for brunch, nightlife, sports bars, group dining, and social-first venues.",
    signals: ["bold", "energetic", "social", "fun", "nightlife", "party", "vibrant", "brunch", "groups", "lively", "sports bar", "club"],
    variants: ["photo_mosaic", "asymmetric_gallery", "cinematic_strip"],
    defaultVariant: "photo_mosaic",
    theme: { mood: "energetic", contrast: "dark", typography: "modern", density: "balanced", imageTreatment: "grid", reservationPriority: "primary" },
  },
  {
    id: "classic_bistro",
    name: "Classic European",
    summary: "Timeless restaurant design with restrained typography, elegant menu presentation, narrow editorial proportions, and traditional hospitality cues.",
    signals: ["bistro", "french", "italian", "wine bar", "brasserie", "classic", "traditional", "european", "vintage", "trattoria"],
    variants: ["editorial_split", "framed_photo", "typography_first"],
    defaultVariant: "editorial_split",
    theme: { mood: "classic", contrast: "mixed", typography: "classic", density: "balanced", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "coastal_airy",
    name: "Coastal Escape",
    summary: "Open, bright, image-led design for seafood, waterfront, rooftop, resort-style, and daylight-driven hospitality concepts.",
    signals: ["coastal", "seafood", "waterfront", "beach", "airy", "bright", "fresh", "relaxed", "ocean", "rooftop", "resort"],
    variants: ["framed_photo", "editorial_split", "cinematic_strip"],
    defaultVariant: "framed_photo",
    theme: { mood: "breezy", contrast: "light", typography: "modern", density: "airy", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "warm_neighborhood",
    name: "Neighborhood Favorite",
    summary: "Warm, approachable and polished for restaurants, pubs, cafés, and local destinations where personality and familiarity matter most.",
    signals: ["warm", "local", "neighborhood", "friendly", "cozy", "casual", "authentic", "welcoming", "cafe", "pub", "family"],
    variants: ["editorial_split", "framed_photo", "photo_mosaic"],
    defaultVariant: "editorial_split",
    theme: { mood: "welcoming", contrast: "light", typography: "classic", density: "balanced", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "luxury_minimal",
    name: "Quiet Luxury",
    summary: "Gallery-like restraint, dramatic whitespace, selective imagery, and oversized typography for premium restaurants, spas, and private experiences.",
    signals: ["luxury minimal", "minimal luxury", "quiet luxury", "high end", "exclusive", "restrained", "sophisticated", "private", "fine dining", "spa"],
    variants: ["typography_first", "framed_photo", "cinematic_strip"],
    defaultVariant: "typography_first",
    theme: { mood: "luxury", contrast: "mixed", typography: "editorial", density: "airy", imageTreatment: "minimal", reservationPriority: "primary" },
  },
  {
    id: "experiential_escape",
    name: "Immersive Experience",
    summary: "Image-forward, action-oriented layouts for escape rooms, bowling, mini golf, attractions, and bookable destinations where the experience is the product.",
    signals: ["experience", "activity", "immersive", "escape room", "bowling", "mini golf", "rooftop", "adventure", "attraction", "book now", "arcade", "axe throwing"],
    variants: ["asymmetric_gallery", "photo_mosaic", "cinematic_strip"],
    defaultVariant: "asymmetric_gallery",
    theme: { mood: "immersive", contrast: "mixed", typography: "modern", density: "balanced", imageTreatment: "grid", reservationPriority: "primary" },
  },
  {
    id: "creative_workshop",
    name: "Creative Studio",
    summary: "Expressive, premium and playful for workshops, maker spaces, classes, date activities, family entertainment, and hands-on venues.",
    signals: ["creative", "playful", "pottery", "painting", "candle", "cooking class", "diy", "workshop", "studio", "colorful", "family fun"],
    variants: ["photo_mosaic", "framed_photo", "editorial_split"],
    defaultVariant: "photo_mosaic",
    theme: { mood: "creative", contrast: "light", typography: "playful", density: "balanced", imageTreatment: "grid", reservationPriority: "primary" },
  },
];

const LEGACY_DIRECTION_ALIASES: Record<string, string> = {
  cocktail_society: "refined_after_dark",
  experiential_escape: "experiential_escape",
  natural_retreat: "coastal_airy",
  playful_local: "creative_workshop",
  industrial_edge: "bold_social",
  heritage_story: "classic_bistro",
  contemporary_culture: "editorial_luxury",
  high_energy_experience: "experiential_escape",
  competitive_social: "experiential_escape",
  immersive_adventure: "experiential_escape",
  family_fun: "creative_workshop",
  wellness_escape: "luxury_minimal",
};

export function normalizeWebsiteDesignDirectionId(id: string) {
  return LEGACY_DIRECTION_ALIASES[id] || id;
}

export function getWebsiteDesignDirection(id: string) {
  const normalized = normalizeWebsiteDesignDirectionId(id);
  return WEBSITE_DESIGN_DIRECTIONS.find((direction) => direction.id === normalized) || null;
}
