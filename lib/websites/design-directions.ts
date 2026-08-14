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
    name: "Editorial Light",
    summary: "Warm ivory, elegant type, restrained photography, and magazine-like hospitality polish.",
    signals: ["editorial", "light", "cream", "ivory", "elegant", "refined", "magazine", "chef", "premium"],
    variants: ["editorial_split", "framed_photo", "cinematic_strip", "typography_first"],
    defaultVariant: "editorial_split",
    theme: { mood: "editorial", contrast: "light", typography: "editorial", density: "airy", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "refined_after_dark",
    name: "Dark Lounge",
    summary: "Moody, intimate, and premium with copper or gold accents and controlled cinematic imagery.",
    signals: ["dark", "lounge", "romantic", "moody", "intimate", "cocktail", "nightlife", "luxury", "candlelight", "upscale"],
    variants: ["asymmetric_gallery", "cinematic_strip", "typography_first", "editorial_split"],
    defaultVariant: "asymmetric_gallery",
    theme: { mood: "refined", contrast: "dark", typography: "editorial", density: "airy", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "modern_minimal",
    name: "Modern Reservation-First",
    summary: "Clean, conversion-focused hospitality with reservation controls given the strongest visual priority.",
    signals: ["modern", "clean", "reservation", "book", "minimal", "sleek", "simple", "conversion", "contemporary"],
    variants: ["typography_first", "editorial_split", "framed_photo"],
    defaultVariant: "editorial_split",
    theme: { mood: "modern", contrast: "light", typography: "modern", density: "balanced", imageTreatment: "minimal", reservationPriority: "primary" },
  },
  {
    id: "bold_social",
    name: "Bold Social",
    summary: "Energetic and expressive for nightlife, brunch, groups, and high-social-intent venues.",
    signals: ["bold", "energetic", "social", "fun", "nightlife", "party", "vibrant", "brunch", "groups", "lively"],
    variants: ["photo_mosaic", "asymmetric_gallery", "cinematic_strip"],
    defaultVariant: "photo_mosaic",
    theme: { mood: "energetic", contrast: "dark", typography: "modern", density: "balanced", imageTreatment: "grid", reservationPriority: "primary" },
  },
  {
    id: "classic_bistro",
    name: "Classic Bistro",
    summary: "Timeless dining presentation with traditional hospitality cues, elegant menus, and understated warmth.",
    signals: ["bistro", "french", "italian", "wine bar", "brasserie", "classic", "traditional", "european", "vintage"],
    variants: ["editorial_split", "framed_photo", "typography_first"],
    defaultVariant: "editorial_split",
    theme: { mood: "classic", contrast: "mixed", typography: "classic", density: "balanced", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "coastal_airy",
    name: "Coastal Airy",
    summary: "Bright, fresh, and relaxed with generous whitespace and controlled sunlit photography.",
    signals: ["coastal", "seafood", "waterfront", "beach", "airy", "bright", "fresh", "relaxed", "ocean", "rooftop"],
    variants: ["framed_photo", "editorial_split", "cinematic_strip"],
    defaultVariant: "framed_photo",
    theme: { mood: "breezy", contrast: "light", typography: "modern", density: "airy", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "warm_neighborhood",
    name: "Warm Neighborhood",
    summary: "Cozy, local, approachable hospitality with authentic personality and a welcoming booking journey.",
    signals: ["warm", "local", "neighborhood", "friendly", "cozy", "casual", "authentic", "welcoming", "cafe", "pub"],
    variants: ["editorial_split", "framed_photo", "photo_mosaic"],
    defaultVariant: "editorial_split",
    theme: { mood: "welcoming", contrast: "light", typography: "classic", density: "balanced", imageTreatment: "editorial", reservationPriority: "primary" },
  },
  {
    id: "luxury_minimal",
    name: "Luxury Minimal",
    summary: "Quiet high-end design led by typography, precision spacing, and very selective imagery.",
    signals: ["luxury minimal", "minimal luxury", "quiet luxury", "high end", "exclusive", "restrained", "sophisticated", "private", "fine dining"],
    variants: ["typography_first", "framed_photo", "cinematic_strip"],
    defaultVariant: "typography_first",
    theme: { mood: "luxury", contrast: "mixed", typography: "editorial", density: "airy", imageTreatment: "minimal", reservationPriority: "primary" },
  },
  {
    id: "experiential_escape",
    name: "Experience-First",
    summary: "Bookable, story-led layouts for activities and destinations where the experience itself is the product.",
    signals: ["experience", "activity", "immersive", "escape room", "bowling", "mini golf", "rooftop", "adventure", "attraction", "book now"],
    variants: ["asymmetric_gallery", "photo_mosaic", "cinematic_strip"],
    defaultVariant: "asymmetric_gallery",
    theme: { mood: "immersive", contrast: "mixed", typography: "modern", density: "balanced", imageTreatment: "grid", reservationPriority: "primary" },
  },
  {
    id: "creative_workshop",
    name: "Creative / Playful",
    summary: "Polished but expressive for workshops, maker spaces, date activities, and hands-on venues.",
    signals: ["creative", "playful", "pottery", "painting", "candle", "cooking class", "diy", "workshop", "studio", "colorful"],
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
