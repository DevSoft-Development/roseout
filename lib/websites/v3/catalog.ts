export type WebsiteRendererVersion = "legacy" | "v3";

export type WebsiteV3ConceptId =
  | "nocturne"
  | "atelier"
  | "vista"
  | "social_house"
  | "quiet_luxury"
  | "maison"
  | "pulse"
  | "botanica"
  | "grandstand"
  | "gallery_house";

export type WebsiteV3Concept = {
  id: WebsiteV3ConceptId;
  name: string;
  description: string;
  bestFor: string;
  status: "building" | "preview_ready";
};

export const WEBSITE_V3_CONCEPTS: WebsiteV3Concept[] = [
  { id:"nocturne", name:"Nocturne", description:"Cinematic, moody, reservation-forward, and image-led.", bestFor:"Steakhouses, lounges, nightlife, jazz, rooftops, upscale dining", status:"preview_ready" },
  { id:"atelier", name:"Atelier", description:"Editorial, art-directed, asymmetric, and typography-led.", bestFor:"Chef-driven dining, sushi, wine, museums, galleries", status:"preview_ready" },
  { id:"vista", name:"Vista", description:"Panoramic, destination-led, spacious, and environmental.", bestFor:"Rooftops, coastal venues, gardens, breweries, destinations", status:"preview_ready" },
  { id:"social_house", name:"Social House", description:"Energetic, multi-image, social, and booking-forward.", bestFor:"Brunch, karaoke, bowling, arcade, mini golf, group experiences", status:"preview_ready" },
  { id:"quiet_luxury", name:"Quiet Luxury", description:"Calm, restrained, tactile, spacious, and discreet.", bestFor:"Spas, wellness, intimate dining, private events", status:"preview_ready" },
  { id:"maison", name:"Maison", description:"Warm, classic, neighborhood-led hospitality with editorial polish.", bestFor:"Bistros, wine bars, neighborhood restaurants, date-night dining", status:"preview_ready" },
  { id:"pulse", name:"Pulse", description:"High-energy, bold, nightlife-first and intentionally graphic.", bestFor:"Nightclubs, karaoke, lounges, late-night venues, social concepts", status:"preview_ready" },
  { id:"botanica", name:"Botanica", description:"Airy, garden-inspired, relaxed and naturally elegant.", bestFor:"Brunch, garden restaurants, cafes, rooftops, wellness-led venues", status:"preview_ready" },
  { id:"grandstand", name:"Grandstand", description:"Bold, structured, group-first and entertainment-driven.", bestFor:"Sports bars, bowling, arcades, game venues, group entertainment", status:"preview_ready" },
  { id:"gallery_house", name:"Gallery House", description:"Museum-like, art-directed, minimal and culture-forward.", bestFor:"Museums, galleries, theaters, chef concepts, premium experiences", status:"preview_ready" },
];

export function normalizeWebsiteRendererVersion(value: unknown): WebsiteRendererVersion {
  return value === "v3" ? "v3" : "legacy";
}

export function normalizeWebsiteV3Concept(value: unknown): WebsiteV3ConceptId {
  return WEBSITE_V3_CONCEPTS.some((concept) => concept.id === value)
    ? value as WebsiteV3ConceptId
    : "nocturne";
}
