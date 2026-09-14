export type WebsiteRendererVersion = "legacy" | "v3";

export type WebsiteV3ConceptId =
  | "nocturne"
  | "atelier"
  | "vista"
  | "social_house"
  | "quiet_luxury";

export type WebsiteV3Concept = {
  id: WebsiteV3ConceptId;
  name: string;
  description: string;
  bestFor: string;
  status: "building" | "preview_ready";
};

export const WEBSITE_V3_CONCEPTS: WebsiteV3Concept[] = [
  {
    id: "nocturne",
    name: "Nocturne",
    description: "Cinematic, moody, reservation-forward, and image-led.",
    bestFor: "Steakhouses, lounges, nightlife, jazz, rooftops, upscale dining",
    status: "building",
  },
  {
    id: "atelier",
    name: "Atelier",
    description: "Editorial, art-directed, asymmetric, and typography-led.",
    bestFor: "Chef-driven dining, sushi, wine, museums, galleries",
    status: "building",
  },
  {
    id: "vista",
    name: "Vista",
    description: "Panoramic, destination-led, spacious, and environmental.",
    bestFor: "Rooftops, coastal venues, gardens, breweries, destinations",
    status: "building",
  },
  {
    id: "social_house",
    name: "Social House",
    description: "Energetic, multi-image, social, and booking-forward.",
    bestFor: "Brunch, karaoke, bowling, arcade, mini golf, group experiences",
    status: "building",
  },
  {
    id: "quiet_luxury",
    name: "Quiet Luxury",
    description: "Calm, restrained, tactile, spacious, and discreet.",
    bestFor: "Spas, wellness, intimate dining, private events",
    status: "building",
  },
];

export function normalizeWebsiteRendererVersion(value: unknown): WebsiteRendererVersion {
  return value === "v3" ? "v3" : "legacy";
}

export function normalizeWebsiteV3Concept(value: unknown): WebsiteV3ConceptId {
  return WEBSITE_V3_CONCEPTS.some((concept) => concept.id === value)
    ? value as WebsiteV3ConceptId
    : "nocturne";
}
