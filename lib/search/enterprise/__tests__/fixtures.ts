import { normalizeIntent } from "../normalize-intent";
import { resolveSearchMarket } from "../markets";
import { createPairingDebug, createSearchPairs } from "../pairing";
import { rankActivityResults, rankRestaurantResults } from "../ranking";
import { formatDistanceFromRestaurant, userAskedForWalking } from "../distance";
import type { EnterpriseLocation, EnterprisePair, SearchIntent } from "../types";

const photo = "https://example.test/photo.jpg";

type FixtureLocation = EnterpriseLocation & {
  county?: string | null;
  has_photos?: boolean;
  quality_status?: string;
  public_visibility_tier?: string;
  curation_tier?: string;
  is_low_level?: boolean;
  category?: string | null;
};

function text(parts: Array<string | string[] | null | undefined>) {
  return parts.flat().filter(Boolean).join(" ");
}

function restaurant(input: Partial<FixtureLocation> & { id: string; name: string }): FixtureLocation {
  const base: FixtureLocation = {
    id: input.id,
    name: input.name,
    restaurant_name: input.name,
    city: "New York",
    borough: "Manhattan",
    county: "New York County",
    state: "NY",
    latitude: 40.758,
    longitude: -73.9855,
    rating: 4.5,
    review_count: 500,
    has_photos: true,
    image_url: photo,
    quality_status: "approved",
    public_visibility_tier: "featured",
    curation_tier: "curated",
    is_low_level: false,
    location_type: "restaurant",
    primary_category: "full service restaurant",
    category: "restaurant",
    cuisine: "American",
    tags: ["dinner", "date night", "full service", "reservations"],
    description: "Full-service dinner spot with ambiance and reservations.",
    google_types: ["restaurant", "food", "point_of_interest"],
    ...input,
  };
  base.search_document = input.search_document ?? text([
    base.name,
    base.restaurant_name,
    base.city,
    base.borough,
    base.county,
    base.state,
    base.primary_category,
    base.category,
    base.cuisine,
    base.tags as string[],
    base.description,
    base.google_types as string[],
  ]);
  return base;
}

function activity(input: Partial<FixtureLocation> & { id: string; name: string }): FixtureLocation {
  const base: FixtureLocation = {
    id: input.id,
    name: input.name,
    activity_name: input.name,
    city: "New York",
    borough: "Manhattan",
    county: "New York County",
    state: "NY",
    latitude: 40.758,
    longitude: -73.9855,
    rating: 4.5,
    review_count: 500,
    has_photos: true,
    image_url: photo,
    quality_status: "approved",
    public_visibility_tier: "featured",
    curation_tier: "curated",
    is_low_level: false,
    location_type: "activity",
    primary_category: "rooftop bar",
    category: "bar",
    activity_type: "rooftop_bar",
    tags: ["rooftop", "cocktails", "lounge", "drinks"],
    description: "Rooftop bar and lounge with skyline views and cocktails.",
    google_types: ["bar", "night_club", "point_of_interest"],
    ...input,
  };
  base.search_document = input.search_document ?? text([
    base.name,
    base.activity_name,
    base.city,
    base.borough,
    base.county,
    base.state,
    base.primary_category,
    base.category,
    base.activity_type,
    base.tags as string[],
    base.description,
    base.google_types as string[],
  ]);
  return base;
}

export const restaurants: FixtureLocation[] = [
  restaurant({ id: "modern", name: "The Modern", latitude: 40.7614, longitude: -73.9776, cuisine: "New American", primary_category: "fine dining restaurant", description: "Fine dining, upscale, romantic date night restaurant with reservations." }),
  restaurant({ id: "olio", name: "OLIO E PIÙ Bryant Park", latitude: 40.7537, longitude: -73.9845, cuisine: "Italian", primary_category: "full service Italian restaurant", description: "Italian dinner, pasta, cocktails, full service and date-friendly ambiance." }),
  restaurant({ id: "parker", name: "Parker & Quinn", latitude: 40.7509, longitude: -73.9855, cuisine: "American", primary_category: "full service restaurant cocktail bar", description: "Dinner, cocktails, full-service dining room, date night and group night." }),
  restaurant({ id: "boucherie", name: "La Grande Boucherie", latitude: 40.7626, longitude: -73.9807, cuisine: "French steakhouse brasserie", primary_category: "upscale brasserie full service restaurant", description: "Upscale brasserie, steak dinner, elegant ambiance, reservations, date-friendly." }),
  restaurant({ id: "bernardin", name: "Le Bernardin", latitude: 40.7616, longitude: -73.9817, cuisine: "Seafood French", primary_category: "fine dining seafood restaurant", description: "Upscale seafood dinner, fine dining, reservations, elegant date night." }),
  restaurant({ id: "moe", name: "MOE EATS NYC", latitude: 40.759, longitude: -73.99, rating: 4.0, review_count: 20, has_photos: false, image_url: null, public_visibility_tier: "standard", curation_tier: "utility", primary_category: "takeout delivery casual eats", cuisine: "American", tags: ["takeout", "delivery", "casual"], description: "Casual eats and takeout counter service." }),
  restaurant({ id: "daves", name: "Dave's Hot Chicken", latitude: 40.754, longitude: -73.986, rating: 4.2, review_count: 100, public_visibility_tier: "standard", curation_tier: "utility", primary_category: "fast casual chicken restaurant", cuisine: "Chicken", tags: ["hot chicken", "fast casual", "counter service"], description: "Casual hot chicken and quick dinner." }),
  restaurant({ id: "fogo", name: "Fogo de Chão Brazilian Steakhouse", latitude: 40.7430, longitude: -73.9970, cuisine: "Brazilian Steakhouse", primary_category: "steakhouse full service restaurant", description: "Full-service steakhouse dinner with reservations." }),
  restaurant({ id: "bluefin", name: "BLUE FIN", latitude: 40.7596, longitude: -73.9846, cuisine: "Seafood sushi", primary_category: "full service seafood restaurant", description: "Seafood dinner and sushi near theaters." }),
  restaurant({ id: "elias", name: "ELIAS CORNER FOR FISH", city: "New York", borough: "Queens", county: "Queens County", latitude: 40.7672, longitude: -73.9206, cuisine: "Seafood Greek", primary_category: "full service seafood restaurant", tags: ["seafood", "fish", "casual dinner"], description: "Greek seafood dinner in Astoria Queens." }),
  restaurant({ id: "astoria-seafood", name: "Astoria Seafood", city: "New York", borough: "Queens", county: "Queens County", latitude: 40.7639, longitude: -73.9282, cuisine: "Seafood", primary_category: "casual seafood restaurant", tags: ["seafood", "fish", "casual dinner"], description: "Seafood dinner in Queens near Long Island City and Astoria." }),
];

export const activities: FixtureLocation[] = [
  activity({ id: "rt60", name: "RT60 Rooftop Bar & Lounge", latitude: 40.7572, longitude: -73.9892, rating: 4.5, review_count: 900 }),
  activity({ id: "magic-hour", name: "Magic Hour Rooftop Bar & Lounge", latitude: 40.7544, longitude: -73.9883, rating: 4.3, review_count: 5000, public_visibility_tier: "featured", curation_tier: "curated" }),
  activity({ id: "dear-irving", name: "Dear Irving on Hudson Rooftop Bar", latitude: 40.7566, longitude: -73.9932, rating: 4.6, review_count: 1300 }),
  activity({ id: "skylark", name: "The Skylark - Rooftop Bar", latitude: 40.7537, longitude: -73.9904, rating: 4.5, review_count: 1400 }),
  activity({ id: "rooftop-bars-nyc", name: "Rooftop Bars NYC", latitude: 40.758, longitude: -73.9855, rating: 4.0, review_count: 80, has_photos: false, image_url: null, public_visibility_tier: "standard", curation_tier: "utility", primary_category: "website guide listing", activity_type: "aggregator", tags: ["best rooftop bars", "guide to rooftop", "list"], description: "Best rooftop bars NYC guide and listing-style aggregator." }),
  activity({ id: "moon", name: "Moon Bar Rooftop", latitude: 40.7498, longitude: -73.9872, rating: 4.4, review_count: 350 }),
  activity({ id: "vista", name: "Vista Sky Lounge", city: "New York", borough: "Queens", county: "Queens County", latitude: 40.7527, longitude: -73.9401, rating: 4.4, review_count: 700, tags: ["rooftop", "sky lounge", "cocktails", "Queens"], description: "Queens rooftop lounge with skyline views and drinks." }),
  activity({ id: "winter-garden", name: "Winter Garden Theatre", latitude: 40.7617, longitude: -73.9838, primary_category: "Broadway theater", activity_type: "theatre", tags: ["theater", "broadway", "musical"], description: "Broadway theater and performing arts venue." }),
  activity({ id: "gershwin", name: "Gershwin Theatre", latitude: 40.7624, longitude: -73.9850, primary_category: "Broadway theater", activity_type: "theatre", tags: ["theater", "broadway", "musical"], description: "Broadway theater and performing arts venue." }),
  activity({ id: "lena-horne", name: "Lena Horne Theatre", latitude: 40.7601, longitude: -73.9861, primary_category: "Broadway theater", activity_type: "theatre", tags: ["theater", "broadway", "play"], description: "Broadway theater venue." }),
  activity({ id: "broadway-theatre", name: "Broadway Theatre", latitude: 40.7632, longitude: -73.9829, primary_category: "Broadway theater", activity_type: "theatre", tags: ["theater", "broadway", "musical"], description: "Broadway theatre venue." }),
  activity({ id: "secret-theatre", name: "The Secret Theatre", city: "New York", borough: "Queens", county: "Queens County", latitude: 40.7638, longitude: -73.9290, primary_category: "off-broadway theatre", activity_type: "theatre", tags: ["theatre", "show", "play", "Queens"], description: "Queens theatre for shows and plays." }),
  activity({ id: "queens-hookah", name: "Queens Hookah Lounge", city: "New York", borough: "Queens", county: "Queens County", latitude: 40.765, longitude: -73.921, primary_category: "hookah lounge", activity_type: "hookah_lounge", tags: ["hookah", "shisha", "lounge", "Queens"], description: "Hookah lounge and shisha in Queens." }),
  activity({ id: "moving-image", name: "Museum of the Moving Image", city: "New York", borough: "Queens", county: "Queens County", latitude: 40.7563, longitude: -73.9239, primary_category: "museum", activity_type: "museum", tags: ["museum", "relaxed activity", "gallery"], description: "Relaxed museum activity in Queens." }),
];

export function names(items: Array<{ name?: string | null; restaurant_name?: string | null; activity_name?: string | null }>) {
  return items.map((item) => item.name || item.restaurant_name || item.activity_name || "");
}

export function makeIntent(query: string): SearchIntent {
  const intent = normalizeIntent(query);
  const market = resolveSearchMarket({ geo: intent.geo });
  return { ...intent, geo: market.effectiveGeo };
}

export function runFixturePipeline(query: string) {
  const normalizedIntent = normalizeIntent(query);
  const marketResolution = resolveSearchMarket({ geo: normalizedIntent.geo });
  const intent = { ...normalizedIntent, geo: marketResolution.effectiveGeo };
  const rankedRestaurants = rankRestaurantResults(restaurants.map((r) => ({ ...r })), intent);
  const rankedActivities = rankActivityResults(activities.map((a) => ({ ...a })), intent);
  const debug = createPairingDebug();
  const pairs = intent.wantsPairing ? createSearchPairs(rankedRestaurants, rankedActivities, intent, debug) : [];
  const noPairsReason = intent.wantsPairing && pairs.length === 0 && rankedRestaurants.length > 0 && rankedActivities.length > 0 && userAskedForWalking(intent.pairingPreference)
    ? "no_pairs_within_walking_distance"
    : null;
  const pairDisplayLabels = pairs.map((pair) => formatDistanceFromRestaurant({
    pair,
    restaurantName: pair.restaurant.name || pair.restaurant.restaurant_name || "Restaurant",
    pairingPreference: intent.pairingPreference,
  }));
  return { intent, marketResolution, restaurants: rankedRestaurants, activities: rankedActivities, pairs: pairs as EnterprisePair[], debug, noPairsReason, pairDisplayLabels };
}
