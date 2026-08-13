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
    summary: "Sophisticated, cinematic, and intimate with strong photography and premium spacing.",
    signals: ["upscale", "luxury", "dark", "romantic", "intimate", "moody", "elegant", "nightlife"],
    theme: { mood: "refined", contrast: "dark", typography: "editorial", density: "airy", imageTreatment: "immersive" },
  },
  {
    id: "modern_luxe",
    name: "Modern Luxe",
    summary: "Polished and contemporary with clean structure, confident typography, and premium restraint.",
    signals: ["modern", "luxury", "clean", "premium", "sleek", "minimal", "stylish", "contemporary"],
    theme: { mood: "premium", contrast: "mixed", typography: "modern", density: "airy", imageTreatment: "editorial" },
  },
  {
    id: "editorial_minimal",
    name: "Editorial Minimal",
    summary: "Quiet, design-forward, and spacious with content-led layouts and minimal visual noise.",
    signals: ["minimal", "editorial", "simple", "clean", "calm", "artistic", "design", "spacious"],
    theme: { mood: "minimal", contrast: "light", typography: "editorial", density: "airy", imageTreatment: "minimal" },
  },
  {
    id: "bold_social",
    name: "Bold & Social",
    summary: "High-energy and expressive for places built around groups, nightlife, events, and shareable moments.",
    signals: ["bold", "energetic", "social", "fun", "nightlife", "party", "vibrant", "lively"],
    theme: { mood: "energetic", contrast: "dark", typography: "modern", density: "balanced", imageTreatment: "grid" },
  },
  {
    id: "warm_neighborhood",
    name: "Warm Neighborhood",
    summary: "Friendly, approachable, and authentic with an emphasis on hospitality and local character.",
    signals: ["warm", "local", "neighborhood", "friendly", "cozy", "casual", "authentic", "welcoming"],
    theme: { mood: "welcoming", contrast: "light", typography: "classic", density: "balanced", imageTreatment: "editorial" },
  },
  {
    id: "playful_experience",
    name: "Playful Experience",
    summary: "Bright, active, and easy to explore for activity venues, classes, attractions, and group experiences.",
    signals: ["playful", "fun", "activity", "experience", "family", "interactive", "creative", "colorful"],
    theme: { mood: "playful", contrast: "light", typography: "playful", density: "balanced", imageTreatment: "grid" },
  },
  {
    id: "calm_wellness",
    name: "Calm Wellness",
    summary: "Serene and restorative with soft hierarchy, generous whitespace, and a trust-first presentation.",
    signals: ["calm", "wellness", "spa", "serene", "relaxing", "soft", "clean", "peaceful"],
    theme: { mood: "calm", contrast: "light", typography: "modern", density: "airy", imageTreatment: "minimal" },
  },
  {
    id: "classic_signature",
    name: "Classic Signature",
    summary: "Timeless and versatile with clear navigation, familiar hierarchy, and broad category fit.",
    signals: ["classic", "timeless", "traditional", "professional", "simple", "versatile", "trusted"],
    theme: { mood: "timeless", contrast: "mixed", typography: "classic", density: "balanced", imageTreatment: "editorial" },
  },
];

export function getWebsiteDesignDirection(id: string) {
  return WEBSITE_DESIGN_DIRECTIONS.find((direction) => direction.id === id) || null;
}
