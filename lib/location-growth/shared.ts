import { detectChainBrand } from "@/lib/location-growth/chainDetection";
import {
  getPhotoStatus,
  hasLocationPhoto,
} from "@/lib/location-growth/photoDetection";

export type ImportSource = "nyc_open_data" | "osm" | "google_places";

export type StagedLocationInput = {
  source: ImportSource;
  source_id: string;
  source_url?: string | null;
  location_type: "restaurant" | "activity" | "bar" | "nightlife" | "experience";
  name: string;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_tag?: string | null;
  tags?: string[];
  vibe_tags?: string[];
  best_for_tags?: string[];
  search_keywords?: string[];
  google_types?: string[];
  rating?: number | null;
  review_count?: number | null;
  main_image?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
  photos?: string[];
  images?: string[];
  gallery_images?: string[];
  gallery_image_urls?: string[];
  photo_urls?: string[];
  brand_type?: string | null;
  chain_brand?: string | null;
  curation_tier?: string | null;
  date_score?: number | null;
  search_boost?: number | null;
  is_chain?: boolean | null;
  has_photos?: boolean | null;
  photo_status?: string | null;
  description?: string | null;
  raw_payload?: Record<string, any>;
};

export function cleanText(value: unknown) {
  return String(value || "").trim();
}

export function nullIfEmpty(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned.length ? cleaned : null;
}

export function uniqueLower(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(items.map((item) => cleanText(item).toLowerCase()).filter(Boolean)),
  );
}

export function normalizePhone(value: unknown) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits.length ? digits : null;
}

export function normalizeCuisine(value: unknown) {
  const text = cleanText(value).toLowerCase();
  if (!text) return "restaurant";
  if (text.includes("steak")) return "steakhouse";
  if (text.includes("seafood") || text.includes("oyster")) return "seafood";
  if (text.includes("italian") || text.includes("pizza")) return "italian";
  if (text.includes("mexican") || text.includes("taco")) return "mexican";
  if (text.includes("chinese") || text.includes("dim sum")) return "chinese";
  if (
    text.includes("japanese") ||
    text.includes("sushi") ||
    text.includes("ramen")
  )
    return "japanese";
  if (text.includes("korean")) return "korean";
  if (text.includes("thai")) return "thai";
  if (text.includes("indian")) return "indian";
  if (
    text.includes("caribbean") ||
    text.includes("jamaican") ||
    text.includes("haitian")
  )
    return "caribbean";
  if (text.includes("soul")) return "soul_food";
  if (text.includes("french")) return "french";
  if (text.includes("spanish") || text.includes("tapas")) return "spanish";
  if (text.includes("mediterranean") || text.includes("greek"))
    return "mediterranean";
  if (text.includes("vegan")) return "vegan";
  if (text.includes("vegetarian")) return "vegetarian";
  if (text.includes("halal")) return "halal";
  if (text.includes("kosher")) return "kosher";
  if (text.includes("bakery")) return "bakery";
  if (text.includes("coffee") || text.includes("cafe")) return "cafe";
  if (text.includes("dessert") || text.includes("ice cream")) return "dessert";
  if (text.includes("brunch") || text.includes("breakfast")) return "brunch";
  if (text.includes("barbecue") || text.includes("bbq")) return "bbq";
  return (
    text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "restaurant"
  );
}

export function activityTagsForOsm(tags: Record<string, string>) {
  const amenity = tags.amenity || "";
  const tourism = tags.tourism || "";
  const leisure = tags.leisure || "";
  const shop = tags.shop || "";
  const name = tags.name || "";
  const joined =
    `${amenity} ${tourism} ${leisure} ${shop} ${name}`.toLowerCase();
  if (joined.includes("bowling"))
    return { activity_type: "bowling", primary_category: "Bowling" };
  if (joined.includes("karaoke"))
    return { activity_type: "karaoke", primary_category: "Karaoke" };
  if (joined.includes("cinema"))
    return { activity_type: "movies", primary_category: "Movies" };
  if (joined.includes("theatre") || joined.includes("theater"))
    return { activity_type: "theater", primary_category: "Theater" };
  if (joined.includes("museum"))
    return { activity_type: "museum", primary_category: "Museum" };
  if (joined.includes("gallery"))
    return { activity_type: "gallery", primary_category: "Art Gallery" };
  if (joined.includes("nightclub"))
    return { activity_type: "nightlife", primary_category: "Nightlife" };
  if (joined.includes("bar") || joined.includes("pub"))
    return { activity_type: "bar", primary_category: "Bar" };
  if (joined.includes("park"))
    return { activity_type: "outdoor", primary_category: "Park" };
  if (joined.includes("spa"))
    return { activity_type: "spa", primary_category: "Spa" };
  if (joined.includes("billiards"))
    return { activity_type: "billiards", primary_category: "Billiards" };
  if (joined.includes("arcade"))
    return { activity_type: "arcade", primary_category: "Arcade" };
  if (joined.includes("escape"))
    return { activity_type: "escape_room", primary_category: "Escape Room" };
  if (joined.includes("zoo"))
    return { activity_type: "zoo", primary_category: "Zoo" };
  if (joined.includes("aquarium"))
    return { activity_type: "aquarium", primary_category: "Aquarium" };
  if (joined.includes("ice_cream") || joined.includes("ice cream"))
    return { activity_type: "dessert", primary_category: "Dessert" };
  if (joined.includes("bakery") || joined.includes("pastry"))
    return { activity_type: "dessert", primary_category: "Bakery" };
  if (joined.includes("coffee") || joined.includes("cafe"))
    return { activity_type: "cafe", primary_category: "Cafe" };
  return { activity_type: "activity", primary_category: "Activity" };
}

export function removeDuplicatedCityStateZipFromAddress(row: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}) {
  let address = cleanText(row.address);
  const city = cleanText(row.city);
  const state = cleanText(row.state);
  const zip = cleanText(row.zip_code);
  if (!address) return null;
  const duplicateParts = [
    city && state && zip ? `${city}, ${state} ${zip}` : "",
    city && state ? `${city}, ${state}` : "",
    zip,
  ].filter(Boolean);
  for (const part of duplicateParts) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    address = address.replace(new RegExp(`,?\\s*${escaped}\\s*$`, "i"), "");
  }
  return address.trim().replace(/,\s*$/, "");
}

export function calculateLocationQuality(row: any) {
  let score = 0;
  const name = cleanText(row.name || row.restaurant_name || row.activity_name);
  const category = cleanText(
    row.primary_category ||
      row.cuisine ||
      row.cuisine_type ||
      row.activity_type ||
      row.primary_tag,
  );
  if (name) score += 15;
  if (cleanText(row.address)) score += 15;
  if (cleanText(row.city)) score += 8;
  if (cleanText(row.state)) score += 6;
  if (cleanText(row.zip_code)) score += 6;
  if (row.latitude != null && row.longitude != null) score += 15;
  if (category) score += 15;
  if (cleanText(row.phone)) score += 6;
  if (cleanText(row.website)) score += 6;
  if (hasLocationPhoto(row)) score += 6;
  if (Number(row.rating || 0) >= 4) score += 4;
  if (Number(row.review_count || 0) >= 25) score += 4;
  return Math.min(100, score);
}

export function applySearchQualityFields<T extends Record<string, any>>(
  row: T,
): T {
  const name = row.name || row.restaurant_name || row.activity_name || "";
  const chain = detectChainBrand(String(name));
  const hasPhotos = hasLocationPhoto(row);
  return {
    ...row,
    has_photos: hasPhotos,
    photo_status: hasPhotos ? getPhotoStatus(row) : "missing_photo",
    is_chain: chain.isChain,
    brand_type: chain.isChain ? "chain" : "independent",
    chain_brand: chain.chainBrand,
    curation_tier: chain.isChain ? "utility" : row.curation_tier || "standard",
    date_score: chain.isChain ? 20 : (row.date_score ?? 50),
    search_boost: chain.isChain ? -25 : (row.search_boost ?? 0),
  };
}
