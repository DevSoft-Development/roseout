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
  | "gallery_house"
  | "riviera"
  | "ember"
  | "velvet_room"
  | "market_hall"
  | "skyline"
  | "daylight"
  | "foundry"
  | "supper_club"
  | "sanctuary"
  | "electric_garden";

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
  { id:"riviera", name:"Riviera", description:"Coastal, sunlit and relaxed with polished destination energy.", bestFor:"Mediterranean dining, seafood, beach clubs, coastal restaurants", status:"preview_ready" },
  { id:"ember", name:"Ember", description:"Fire-led, dramatic and tactile with a warm evening atmosphere.", bestFor:"Steakhouses, barbecue, wood-fired restaurants, whiskey bars", status:"preview_ready" },
  { id:"velvet_room", name:"Velvet Room", description:"Intimate, nocturnal and refined with a cocktail-lounge sensibility.", bestFor:"Cocktail bars, jazz rooms, speakeasies, lounges, private clubs", status:"preview_ready" },
  { id:"market_hall", name:"Market Hall", description:"Graphic, casual and energetic with an approachable neighborhood feel.", bestFor:"Food halls, cafes, casual restaurants, bakeries, fast-casual concepts", status:"preview_ready" },
  { id:"skyline", name:"Skyline", description:"City-facing, elevated and cinematic with strong rooftop energy.", bestFor:"Rooftops, skyline restaurants, terraces, penthouse lounges", status:"preview_ready" },
  { id:"daylight", name:"Daylight", description:"Bright, editorial and daytime-led with cafe and brunch energy.", bestFor:"Cafes, bakeries, brunch spots, coffee shops, patisseries", status:"preview_ready" },
  { id:"foundry", name:"Foundry", description:"Industrial, craft-led and tactile with maker energy.", bestFor:"Breweries, distilleries, taprooms, craft restaurants, food halls", status:"preview_ready" },
  { id:"supper_club", name:"Supper Club", description:"Classic evening hospitality with music, dinner and occasion.", bestFor:"Supper clubs, live music, jazz dining, cabaret, destination restaurants", status:"preview_ready" },
  { id:"sanctuary", name:"Sanctuary", description:"Restorative, calm and premium with a wellness-first rhythm.", bestFor:"Spas, wellness studios, massage, saunas, restorative experiences", status:"preview_ready" },
  { id:"electric_garden", name:"Electric Garden", description:"Immersive, playful and high-energy for active group outings.", bestFor:"Mini golf, arcades, bowling, immersive entertainment, family fun", status:"preview_ready" },
];

export function normalizeWebsiteRendererVersion(value: unknown): WebsiteRendererVersion {
  return value === "v3" ? "v3" : "legacy";
}

export function normalizeWebsiteV3Concept(value: unknown): WebsiteV3ConceptId {
  return WEBSITE_V3_CONCEPTS.some((concept) => concept.id === value)
    ? value as WebsiteV3ConceptId
    : "nocturne";
}
